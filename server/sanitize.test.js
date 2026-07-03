const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeSession } = require('./sanitize');

function makeSession(phase) {
  return {
    id: 'ABCD',
    mode: 'paired',
    phase,
    participants: [
      { id: 'p1', role: 'subject', secretField: 'leak-me' },
      { id: 'p2', role: 'interviewer' },
    ],
    subject: { order: ['C', 'H'], yPositions: { C: 10 } },
    interviewer: { order: ['H', 'C'], yPositions: { C: 90 } },
    showInterviewer: false,
    lastActivityAt: 12345,
  };
}

const ROLES = ['subject', 'interviewer', null];

test('base fields are present for every phase and role', () => {
  for (const phase of ['waiting', 'subject_arrange', 'interviewer_arrange', 'reveal', 'phase2']) {
    for (const role of ROLES) {
      const s = sanitizeSession(makeSession(phase), role, ['subject']);
      assert.equal(s.id, 'ABCD');
      assert.equal(s.mode, 'paired');
      assert.equal(s.phase, phase);
      assert.deepEqual(s.connectedRoles, ['subject']);
      assert.equal(s.showInterviewer, false);
    }
  }
});

test('participants are stripped to id and role only', () => {
  const s = sanitizeSession(makeSession('waiting'), 'subject', []);
  assert.deepEqual(s.participants, [
    { id: 'p1', role: 'subject' },
    { id: 'p2', role: 'interviewer' },
  ]);
});

test('lastActivityAt is never exposed', () => {
  for (const phase of ['waiting', 'subject_arrange', 'interviewer_arrange', 'reveal', 'phase2']) {
    for (const role of ROLES) {
      const s = sanitizeSession(makeSession(phase), role, []);
      assert.equal('lastActivityAt' in s, false, `${phase}/${role} leaks lastActivityAt`);
    }
  }
});

test('waiting: no order data for any role', () => {
  for (const role of ROLES) {
    const s = sanitizeSession(makeSession('waiting'), role, []);
    assert.equal('subjectOrder' in s, false);
    assert.equal('interviewerOrder' in s, false);
    assert.equal('subject' in s, false);
    assert.equal('interviewer' in s, false);
  }
});

test('subject_arrange: only the subject sees their order', () => {
  const session = makeSession('subject_arrange');
  assert.deepEqual(sanitizeSession(session, 'subject', []).subjectOrder, ['C', 'H']);
  assert.equal(sanitizeSession(session, 'interviewer', []).subjectOrder, null);
  assert.equal(sanitizeSession(session, null, []).subjectOrder, null);
  for (const role of ROLES) {
    assert.equal('interviewerOrder' in sanitizeSession(session, role, []), false);
  }
});

test('interviewer_arrange: only the interviewer sees their order', () => {
  const session = makeSession('interviewer_arrange');
  assert.deepEqual(sanitizeSession(session, 'interviewer', []).interviewerOrder, ['H', 'C']);
  assert.equal(sanitizeSession(session, 'subject', []).interviewerOrder, null);
  assert.equal(sanitizeSession(session, null, []).interviewerOrder, null);
  for (const role of ROLES) {
    assert.equal('subjectOrder' in sanitizeSession(session, role, []), false);
  }
});

test('reveal: both orders visible to every role', () => {
  const session = makeSession('reveal');
  for (const role of ROLES) {
    const s = sanitizeSession(session, role, []);
    assert.deepEqual(s.subjectOrder, ['C', 'H']);
    assert.deepEqual(s.interviewerOrder, ['H', 'C']);
  }
});

test('phase2: both full player objects visible to every role', () => {
  const session = makeSession('phase2');
  for (const role of ROLES) {
    const s = sanitizeSession(session, role, []);
    assert.deepEqual(s.subject, { order: ['C', 'H'], yPositions: { C: 10 } });
    assert.deepEqual(s.interviewer, { order: ['H', 'C'], yPositions: { C: 90 } });
  }
});

test('unknown phase falls back to base fields only', () => {
  const s = sanitizeSession(makeSession('bogus'), 'subject', []);
  assert.equal('subjectOrder' in s, false);
  assert.equal('interviewerOrder' in s, false);
  assert.equal('subject' in s, false);
  assert.equal('interviewer' in s, false);
});
