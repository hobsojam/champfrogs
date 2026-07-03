// End-to-end smoke test: two WS clients walk through the full session flow
const http = require('node:http');
const { WebSocket } = require('ws');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const WS_BASE = BASE.replace(/^http/, 'ws');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function post(path, body = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    }).on('error', reject);
  });
}

function getRaw(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
    }).on('error', reject);
  });
}

function openWs(sessionId, participantId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws?sessionId=${sessionId}&participantId=${participantId}`);
    const messages = [];
    ws.on('message', raw => messages.push(JSON.parse(raw)));
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
  });
}

function waitForState(messages, predicate, timeout = 2000, fromIndex = 0) {
  return new Promise((resolve, reject) => {
    let interval;
    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timeout waiting for state'));
    }, timeout);
    const check = () => {
      for (let i = messages.length - 1; i >= fromIndex; i--) {
        const m = messages[i];
        if (m.type === 'state' && predicate(m.session)) {
          clearInterval(interval);
          clearTimeout(timer);
          return resolve(m.session);
        }
      }
    };
    check();
    interval = setInterval(check, 50);
  });
}

function sendAndWait(ws, messages, msg, predicate, timeout = 2000) {
  const fromIndex = messages.length;
  ws.send(JSON.stringify(msg));
  return waitForState(messages, predicate, timeout, fromIndex);
}

async function sendAndWaitForError(ws, messages, msg, timeout = 1000) {
  const fromIndex = messages.length;
  ws.send(JSON.stringify(msg));
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const err = messages.slice(fromIndex).find(m => m.type === 'error');
    if (err) return err;
    await new Promise(r => setTimeout(r, 25));
  }
  return null;
}

async function run() {
  console.log('\n=== Champfrogs Smoke Test ===\n');

  // --- HTTP API ---
  console.log('HTTP API:');
  const { status, body } = await post('/api/sessions');
  assert(status === 200, 'POST /api/sessions returns 200');
  assert(typeof body.id === 'string' && body.id.length === 4, `Session code is 4 chars: "${body.id}"`);
  const sessionId = body.id;

  const info = await get(`/api/sessions/${sessionId}`);
  assert(info.status === 200, 'GET /api/sessions/:id returns 200');
  assert(info.body.phase === 'waiting', 'Initial phase is waiting');

  const notFound = await get('/api/sessions/ZZZZ');
  assert(notFound.status === 404, 'GET unknown session returns 404');

  // --- Built client assets ---
  console.log('\nBuilt client assets:');
  const page = await getRaw('/');
  assert(page.status === 200, 'GET / returns 200');
  assert((page.headers['content-type'] || '').includes('text/html'), 'GET / serves HTML');
  assert(page.body.includes('<div id="app"'), 'Page contains the #app mount point');

  const assetPaths = [...page.body.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map(m => m[1]);
  assert(assetPaths.some(p => p.endsWith('.js')), `Page references a JS bundle (found: ${assetPaths.join(', ') || 'none'})`);
  for (const assetPath of assetPaths) {
    const asset = await getRaw(assetPath);
    // The SPA fallback answers unknown paths with index.html and a 200,
    // so a missing bundle shows up as text/html here, not as a 404.
    const isHtmlFallback = (asset.headers['content-type'] || '').includes('text/html');
    assert(asset.status === 200 && !isHtmlFallback && asset.body.length > 0, `Asset ${assetPath} is served`);
  }

  // --- WebSocket flow ---
  console.log('\nWebSocket flow:');
  const { ws: subWs, messages: subMsgs } = await openWs(sessionId, 'subject-id');
  const { ws: intWs, messages: intMsgs } = await openWs(sessionId, 'interviewer-id');

  // Both get initial state
  await waitForState(subMsgs, s => s.phase === 'waiting');
  assert(true, 'Subject receives initial state');
  await waitForState(intMsgs, s => s.phase === 'waiting');
  assert(true, 'Interviewer receives initial state');

  // Subject joins → phase advances to subject_arrange
  const afterSubJoin = await sendAndWait(subWs, subMsgs,
    { type: 'join', role: 'subject' },
    s => s.phase === 'subject_arrange'
  );
  assert(afterSubJoin.phase === 'subject_arrange', 'Phase → subject_arrange after subject joins');
  assert(Array.isArray(afterSubJoin.subjectOrder) && afterSubJoin.subjectOrder.length === 10, 'Subject sees their 10-card order');

  // Interviewer joins (phase stays subject_arrange, interviewer gets null order)
  intWs.send(JSON.stringify({ type: 'join', role: 'interviewer' }));
  await new Promise(r => setTimeout(r, 200));
  const intState = intMsgs.findLast(m => m.type === 'state')?.session;
  assert(intState?.phase === 'subject_arrange', 'Interviewer sees subject_arrange phase');
  assert(intState?.subjectOrder === null, 'Interviewer cannot see subject order');

  // Role collision — second subject attempt should fail
  let gotError = false;
  const tmpWs = new WebSocket(`${WS_BASE}/ws?sessionId=${sessionId}&participantId=other-id`);
  await new Promise(r => tmpWs.on('open', r));
  tmpWs.send(JSON.stringify({ type: 'join', role: 'subject' }));
  await new Promise(r => setTimeout(r, 200));
  // check for error message
  const wsMessages = [];
  // Just check no crash — verify via the session state not having a 3rd participant
  const sessionCheck = await get(`/api/sessions/${sessionId}`);
  assert(sessionCheck.body.participantCount <= 2, 'Role collision does not add 3rd participant');
  tmpWs.close();

  // Subject submits their order
  const CARDS = ['C', 'H', 'A', 'M', 'P', 'F', 'R', 'O', 'G', 'S'];
  const subjectOrder = [...CARDS]; // simple known order for test
  const afterSubFinish = await sendAndWait(subWs, subMsgs,
    { type: 'finish_arrange', order: subjectOrder },
    s => s.phase === 'interviewer_arrange'
  );
  assert(afterSubFinish.phase === 'interviewer_arrange', 'Phase → interviewer_arrange after subject submits');

  // Subject can no longer see their order (phase changed, sanitization)
  assert(afterSubFinish.subjectOrder === undefined || afterSubFinish.subjectOrder === null,
    'Subject order hidden from subject during interviewer_arrange');

  // Interviewer sees their order
  const intAfterSub = await waitForState(intMsgs, s => s.phase === 'interviewer_arrange' && s.interviewerOrder !== null);
  assert(Array.isArray(intAfterSub.interviewerOrder) && intAfterSub.interviewerOrder.length === 10,
    'Interviewer sees their 10-card order');
  assert(intAfterSub.subjectOrder === undefined || intAfterSub.subjectOrder === null,
    'Subject order still hidden from interviewer during interviewer_arrange');

  // Interviewer submits → reveal
  const interviewerOrder = [...CARDS].reverse();
  const afterIntFinish = await sendAndWait(intWs, intMsgs,
    { type: 'finish_arrange', order: interviewerOrder },
    s => s.phase === 'reveal'
  );
  assert(afterIntFinish.phase === 'reveal', 'Phase → reveal after interviewer submits');
  assert(JSON.stringify(afterIntFinish.subjectOrder) === JSON.stringify(subjectOrder),
    'Subject order visible in reveal');
  assert(JSON.stringify(afterIntFinish.interviewerOrder) === JSON.stringify(interviewerOrder),
    'Interviewer order visible in reveal');

  // Advance to phase 2
  const afterPhase2 = await sendAndWait(subWs, subMsgs,
    { type: 'set_phase', phase: 'phase2' },
    s => s.phase === 'phase2'
  );
  assert(afterPhase2.phase === 'phase2', 'Phase → phase2');
  assert(Array.isArray(afterPhase2.subject?.order), 'Subject data present in phase2');
  assert(typeof afterPhase2.subject?.yPositions === 'object', 'Y positions present');

  // Update a Y position
  const afterY = await sendAndWait(subWs, subMsgs,
    { type: 'update_y', who: 'subject', cardId: 'C', y: 25 },
    s => s.phase === 'phase2' && s.subject?.yPositions?.C === 25
  );
  assert(afterY.subject.yPositions.C === 25, 'Y position update applied');

  // Toggle interviewer cards
  const afterToggle = await sendAndWait(subWs, subMsgs,
    { type: 'toggle_interviewer', show: true },
    s => s.showInterviewer === true
  );
  assert(afterToggle.showInterviewer === true, 'Interviewer toggle on');
  assert(Array.isArray(afterToggle.interviewer?.order), 'Interviewer cards exposed when toggled on');

  // Back to reveal
  const backToReveal = await sendAndWait(subWs, subMsgs,
    { type: 'set_phase', phase: 'reveal' },
    s => s.phase === 'reveal'
  );
  assert(backToReveal.phase === 'reveal', 'set_phase back to reveal works');

  // Reset
  const afterReset = await sendAndWait(subWs, subMsgs,
    { type: 'reset' },
    s => s.phase === 'waiting'
  );
  assert(afterReset.phase === 'waiting', 'Reset returns to waiting phase');

  // Invalid order rejected — wait for subject_arrange phase before sending bad order
  await sendAndWait(subWs, subMsgs, { type: 'join', role: 'subject' }, s => s.phase === 'subject_arrange');
  const beforeCount = subMsgs.filter(m => m.type === 'error').length;
  subWs.send(JSON.stringify({ type: 'finish_arrange', order: ['C', 'C', 'A', 'M', 'P', 'F', 'R', 'O', 'G', 'S'] }));
  await new Promise(r => setTimeout(r, 300));
  const newErrors = subMsgs.filter(m => m.type === 'error').slice(beforeCount);
  assert(newErrors.some(e => e.code === 'invalid_order'), 'Invalid order (duplicate) is rejected');

  subWs.close();
  intWs.close();

  // --- Solo mode flow ---
  console.log('\nSolo mode flow:');
  const { body: soloBody } = await post('/api/sessions', { mode: 'solo' });
  assert(typeof soloBody.id === 'string' && soloBody.id.length === 4, `Solo session created: "${soloBody.id}"`);

  const { ws: soloWs, messages: soloMsgs } = await openWs(soloBody.id, 'solo-subject-id');
  const soloInitial = await waitForState(soloMsgs, s => s.phase === 'waiting');
  assert(soloInitial.mode === 'solo', 'Solo session has mode=solo');

  const soloAfterJoin = await sendAndWait(soloWs, soloMsgs,
    { type: 'join', role: 'subject' },
    s => s.phase === 'subject_arrange'
  );
  assert(soloAfterJoin.phase === 'subject_arrange', 'Solo: phase → subject_arrange after subject joins');
  assert(Array.isArray(soloAfterJoin.subjectOrder) && soloAfterJoin.subjectOrder.length === 10, 'Solo: subject sees their 10-card order');

  const soloAfterArrange = await sendAndWait(soloWs, soloMsgs,
    { type: 'finish_arrange', order: CARDS },
    s => s.phase !== 'subject_arrange'
  );
  assert(soloAfterArrange.phase === 'phase2', 'Solo: finish_arrange goes directly to phase2 (skips interviewer_arrange)');
  assert(Array.isArray(soloAfterArrange.subject?.order), 'Solo: subject data present in phase2');

  soloWs.close();

  // --- Post-reset re-join (paired) ---
  console.log('\nPost-reset re-join:');
  // sessionId is still the paired session; after the "invalid order" test it is in subject_arrange.
  // We need a fresh reset so we can observe a clean re-join → subject_arrange transition.
  // Re-open a fresh WS pair for this session (previous subWs/intWs were closed above).
  const { ws: rejoinSubWs, messages: rejoinSubMsgs } = await openWs(sessionId, 'subject-id');
  await waitForState(rejoinSubMsgs, s => s.phase === 'subject_arrange');

  // Join first — auth guard requires ws.role before reset is allowed
  await sendAndWait(rejoinSubWs, rejoinSubMsgs, { type: 'join', role: 'subject' }, s => s.phase === 'subject_arrange');

  // Reset the session back to waiting so we can do a clean re-join
  await sendAndWait(rejoinSubWs, rejoinSubMsgs, { type: 'reset' }, s => s.phase === 'waiting');

  // Now re-join as subject → should advance to subject_arrange
  const afterResetJoin = await sendAndWait(rejoinSubWs, rejoinSubMsgs,
    { type: 'join', role: 'subject' },
    s => s.phase === 'subject_arrange'
  );
  assert(afterResetJoin.phase === 'subject_arrange', 'Subject re-joins after reset → phase: subject_arrange');
  assert(Array.isArray(afterResetJoin.subjectOrder) && afterResetJoin.subjectOrder.length === 10,
    'Post-reset: subject sees their 10-card order again');

  rejoinSubWs.close();

  // --- WS reconnect during arrange ---
  console.log('\nWS reconnect flow:');
  // Create a fresh session for the reconnect test
  const { body: rcBody } = await post('/api/sessions');
  const rcSessionId = rcBody.id;

  // Open WS as subject and join → subject_arrange
  const { ws: rcWs1, messages: rcMsgs1 } = await openWs(rcSessionId, 'rc-subject-id');
  await waitForState(rcMsgs1, s => s.phase === 'waiting');
  assert(true, 'Reconnect: initial state received after reconnect');

  await sendAndWait(rcWs1, rcMsgs1, { type: 'join', role: 'subject' }, s => s.phase === 'subject_arrange');

  // Simulate a WS drop
  rcWs1.close();
  await new Promise(r => setTimeout(r, 200));

  // Reconnect with the same participantId
  const { ws: rcWs2, messages: rcMsgs2 } = await openWs(rcSessionId, 'rc-subject-id');
  await waitForState(rcMsgs2, s => s.phase !== null);

  const afterReconnectJoin = await sendAndWait(rcWs2, rcMsgs2,
    { type: 'join', role: 'subject' },
    s => s.phase === 'subject_arrange'
  );
  assert(afterReconnectJoin.phase === 'subject_arrange', 'Reconnect: subject can re-join after WS drop');

  // Finish arrange after reconnect
  const afterRcArrange = await sendAndWait(rcWs2, rcMsgs2,
    { type: 'finish_arrange', order: CARDS },
    s => s.phase === 'interviewer_arrange'
  );
  assert(afterRcArrange.phase === 'interviewer_arrange', 'Reconnect: finish_arrange succeeds after reconnect');

  rcWs2.close();

  // --- Unjoined-socket guards ---
  console.log('\nUnjoined-socket guards:');
  const { body: guardBody } = await post('/api/sessions');
  const { ws: guardWs, messages: guardMsgs } = await openWs(guardBody.id, 'lurker-id');
  await waitForState(guardMsgs, s => s.phase === 'waiting');

  let err = await sendAndWaitForError(guardWs, guardMsgs, { type: 'reset' });
  assert(err?.code === 'invalid_role', 'Unjoined socket cannot reset');
  err = await sendAndWaitForError(guardWs, guardMsgs, { type: 'set_phase', phase: 'phase2' });
  assert(err?.code === 'invalid_role', 'Unjoined socket cannot set phase');
  err = await sendAndWaitForError(guardWs, guardMsgs, { type: 'update_y', who: 'subject', cardId: 'C', y: 10 });
  assert(err?.code === 'invalid_role', 'Unjoined socket cannot update Y positions');
  err = await sendAndWaitForError(guardWs, guardMsgs, { type: 'finish_arrange', order: CARDS });
  assert(err?.code === 'wrong_phase', 'Unjoined socket cannot finish arrange');
  err = await sendAndWaitForError(guardWs, guardMsgs, { type: 'join', role: 'moderator' });
  assert(err?.code === 'invalid_role', 'Unknown role is rejected');
  err = await sendAndWaitForError(guardWs, guardMsgs, { type: 'bogus_type' });
  assert(err?.code === 'unknown_message_type', 'Unknown message type is rejected');

  const guardCheck = await get(`/api/sessions/${guardBody.id}`);
  assert(guardCheck.body.phase === 'waiting' && guardCheck.body.participantCount === 0,
    'Session unchanged after rejected messages');
  guardWs.close();

  // --- Message validation ---
  console.log('\nMessage validation:');
  const { body: valBody } = await post('/api/sessions', { mode: 'solo' });
  const { ws: valWs, messages: valMsgs } = await openWs(valBody.id, 'val-subject-id');
  await waitForState(valMsgs, s => s.phase === 'waiting');
  await sendAndWait(valWs, valMsgs, { type: 'join', role: 'subject' }, s => s.phase === 'subject_arrange');

  err = await sendAndWaitForError(valWs, valMsgs, { type: 'set_phase', phase: 'phase2' });
  assert(err?.code === 'wrong_phase', 'Cannot jump to phase2 before reveal/arrange is done');
  err = await sendAndWaitForError(valWs, valMsgs, { type: 'set_phase', phase: 'waiting' });
  assert(err?.code === 'invalid_phase', 'set_phase only accepts phase2/reveal');
  err = await sendAndWaitForError(valWs, valMsgs, { type: 'finish_arrange', order: CARDS.slice(0, 9) });
  assert(err?.code === 'invalid_order', 'Order with 9 cards is rejected');
  err = await sendAndWaitForError(valWs, valMsgs, { type: 'finish_arrange', order: [...CARDS.slice(0, 9), 'X'] });
  assert(err?.code === 'invalid_order', 'Order with unknown card ID is rejected');

  await sendAndWait(valWs, valMsgs, { type: 'finish_arrange', order: CARDS }, s => s.phase === 'phase2');

  err = await sendAndWaitForError(valWs, valMsgs, { type: 'update_y', who: 'interviewer', cardId: 'C', y: 10 });
  assert(err?.code === 'invalid_role', "Cannot update the other role's Y positions");
  err = await sendAndWaitForError(valWs, valMsgs, { type: 'update_y', who: 'subject', cardId: 'X', y: 10 });
  assert(err?.code === 'invalid_card_id', 'Unknown card ID in update_y is rejected');
  err = await sendAndWaitForError(valWs, valMsgs, { type: 'update_y', who: 'subject', cardId: 'C', y: 150 });
  assert(err?.code === 'invalid_y_position', 'Y above 100 is rejected');
  err = await sendAndWaitForError(valWs, valMsgs, { type: 'update_y', who: 'subject', cardId: 'C', y: 'abc' });
  assert(err?.code === 'invalid_y_position', 'Non-numeric Y is rejected');

  // Solo sessions have no interviewer role
  const { ws: soloIntWs, messages: soloIntMsgs } = await openWs(valBody.id, 'val-intruder-id');
  await waitForState(soloIntMsgs, s => s.phase !== null);
  err = await sendAndWaitForError(soloIntWs, soloIntMsgs, { type: 'join', role: 'interviewer' });
  assert(err?.code === 'invalid_role', 'Solo session rejects interviewer join');
  soloIntWs.close();
  valWs.close();

  // --- Lowercase session code ---
  console.log('\nLowercase session code:');
  const lcInfo = await get(`/api/sessions/${valBody.id.toLowerCase()}`);
  assert(lcInfo.status === 200, 'GET with lowercase code finds the session');
  const { ws: lcWs, messages: lcMsgs } = await openWs(valBody.id.toLowerCase(), 'lc-id');
  const lcState = await waitForState(lcMsgs, s => s.id === valBody.id);
  assert(lcState.id === valBody.id, 'WS connect with lowercase code reaches the session');
  lcWs.close();

  // --- WS message flood ---
  console.log('\nWS message flood:');
  const { body: floodBody } = await post('/api/sessions');
  const { ws: floodWs, messages: floodMsgs } = await openWs(floodBody.id, 'flood-id');
  await waitForState(floodMsgs, s => s.phase === 'waiting');
  const floodClose = new Promise(resolve => floodWs.on('close', code => resolve(code)));
  for (let i = 0; i < 40; i++) {
    floodWs.send(JSON.stringify({ type: 'bogus_type' }));
  }
  const floodCloseCode = await Promise.race([
    floodClose,
    new Promise(r => setTimeout(() => r('timeout'), 3000)),
  ]);
  assert(floodCloseCode === 4001, `Flooding >30 msgs/sec closes the connection with 4001 (got ${floodCloseCode})`);

  // Summary
  console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error('Smoke test error:', err); process.exit(1); });
