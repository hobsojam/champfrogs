// End-to-end smoke test: two WS clients walk through the full session flow
const http = require('node:http');
const { WebSocket } = require('ws');

const BASE = 'http://localhost:3000';
const WS_BASE = 'ws://localhost:3000';

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

  // Summary
  console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error('Smoke test error:', err); process.exit(1); });
