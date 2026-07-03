const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sweepInactiveSessions } = require('./index');
const { createSession, getSession } = require('./sessions');

function fakeSocket() {
  return {
    OPEN: 1,
    readyState: 1,
    sent: [],
    closed: null,
    send(raw) { this.sent.push(JSON.parse(raw)); },
    close(code, reason) { this.closed = { code, reason }; },
  };
}

test('stale sessions are deleted and their sockets notified and closed', () => {
  const stale = createSession();
  stale.lastActivityAt = Date.now() - 1000;
  const ws = fakeSocket();
  const sockets = new Map([[stale.id, new Set([ws])]]);

  sweepInactiveSessions(sockets, 500);

  assert.equal(getSession(stale.id), undefined, 'stale session removed');
  assert.equal(sockets.has(stale.id), false, 'socket set removed');
  assert.deepEqual(ws.sent, [{ type: 'session_expired' }]);
  assert.deepEqual(ws.closed, { code: 1001, reason: 'Session expired' });
});

test('active sessions survive the sweep', () => {
  const active = createSession();
  const ws = fakeSocket();
  const sockets = new Map([[active.id, new Set([ws])]]);

  sweepInactiveSessions(sockets, 60 * 60 * 1000);

  assert.ok(getSession(active.id), 'active session kept');
  assert.equal(ws.sent.length, 0);
  assert.equal(ws.closed, null);
});

test('closed sockets are not sent session_expired but are still closed', () => {
  const stale = createSession();
  stale.lastActivityAt = Date.now() - 1000;
  const ws = fakeSocket();
  ws.readyState = 3; // CLOSED
  const sockets = new Map([[stale.id, new Set([ws])]]);

  sweepInactiveSessions(sockets, 500);

  assert.equal(getSession(stale.id), undefined);
  assert.equal(ws.sent.length, 0, 'no message to a closed socket');
  assert.deepEqual(ws.closed, { code: 1001, reason: 'Session expired' });
});

test('stale session without sockets is simply deleted', () => {
  const stale = createSession();
  stale.lastActivityAt = Date.now() - 1000;

  sweepInactiveSessions(new Map(), 500);

  assert.equal(getSession(stale.id), undefined);
});
