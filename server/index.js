const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { WEBSOCKET_ERRORS, WEBSOCKET_MESSAGE_ERRORS } = require('../shared/errors.json');
const { createSession, getSession, getAllSessions, removeParticipant, deleteSession } = require('./sessions');
const { handleMessage } = require('./handlers');
const { sanitizeSession } = require('./sanitize');

const PORT = process.env.PORT || 3000;
const STATIC_DIR = process.env.STATIC_DIR || './public';
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const WS_CONNECTION_LIMIT_PER_IP = Number.parseInt(process.env.WS_CONNECTION_LIMIT_PER_IP, 10) || 10;

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.set('Strict-Transport-Security', 'max-age=31536000');
  }
  res.set('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'");
  next();
});

app.use(express.static(path.resolve(STATIC_DIR)));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.API_RATE_LIMIT_MAX ? Number.parseInt(process.env.API_RATE_LIMIT_MAX, 10) : 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const createSessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.SESSION_RATE_LIMIT_MAX ? Number.parseInt(process.env.SESSION_RATE_LIMIT_MAX, 10) : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sessions created, please try again later' },
});

const staticFallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);

app.post('/api/sessions', createSessionLimiter, (req, res) => {
  const mode = req.body?.mode === 'solo' ? 'solo' : 'paired';
  const session = createSession(mode);
  res.json({ id: session.id });
});

app.get('/api/sessions/:id', (req, res) => {
  const session = getSession(req.params.id.toUpperCase());
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const activeSockets = sessionSockets.get(session.id) || new Set();
  const roles = [...activeSockets].filter(ws => ws.readyState === 1).map(ws => ws.role).filter(Boolean);
  res.json({
    id: session.id,
    phase: session.phase,
    participantCount: session.participants.length,
    roles,
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/{*path}', staticFallbackLimiter, (req, res) => {
  res.sendFile(path.resolve(STATIC_DIR, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcastState(session, sockets) {
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      const sanitized = sanitizeSession(session, ws.role || null);
      ws.send(JSON.stringify({ type: 'state', session: sanitized }));
    }
  }
}

const sessionSockets = new Map();
const wsConnectionCountsByIp = new Map();
const wsMessageTimestamps = new WeakMap();

function clientIpFor(req) {
  if (TRUST_PROXY) {
    const forwardedFor = req.headers?.['x-forwarded-for'];
    const firstForwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0];
    if (firstForwardedIp?.trim()) return firstForwardedIp.trim();
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

function incrementWsConnectionCount(ip) {
  wsConnectionCountsByIp.set(ip, (wsConnectionCountsByIp.get(ip) || 0) + 1);
}

function decrementWsConnectionCount(ip) {
  const count = wsConnectionCountsByIp.get(ip);
  if (!count) return;
  if (count === 1) {
    wsConnectionCountsByIp.delete(ip);
  } else {
    wsConnectionCountsByIp.set(ip, count - 1);
  }
}

function closeWithError(ws, error) {
  ws.close(error.code, error.description);
}

function handleConnection(ws, req) {
  const url = new URL(req.url, 'http://localhost');
  const sessionId = url.searchParams.get('sessionId')?.toUpperCase();
  const participantId = url.searchParams.get('participantId');
  const clientIp = clientIpFor(req);

  if (!sessionId) {
    closeWithError(ws, WEBSOCKET_ERRORS.SESSION_ID_REQUIRED);
    return;
  }

  const session = getSession(sessionId);
  if (!session) {
    closeWithError(ws, WEBSOCKET_ERRORS.SESSION_NOT_FOUND);
    return;
  }

  if ((wsConnectionCountsByIp.get(clientIp) || 0) >= WS_CONNECTION_LIMIT_PER_IP) {
    closeWithError(ws, WEBSOCKET_ERRORS.RATE_LIMIT_EXCEEDED);
    return;
  }

  ws.clientIp = clientIp;
  ws.participantId = participantId || uuidv4();
  ws.sessionId = sessionId;
  ws.role = null;

  // Restore role for reconnecting participants
  const existing = session.participants.find(p => p.id === ws.participantId);
  if (existing) {
    ws.role = existing.role;
  }

  incrementWsConnectionCount(clientIp);

  if (!sessionSockets.has(sessionId)) {
    sessionSockets.set(sessionId, new Set());
  }
  sessionSockets.get(sessionId).add(ws);

  ws.send(JSON.stringify({ type: 'state', session: sanitizeSession(session, ws.role) }));

  let messageChain = Promise.resolve();

  ws.on('message', (raw) => {
    const now = Date.now();
    const timestamps = wsMessageTimestamps.get(ws) || [];
    const recent = timestamps.filter(t => now - t < 1000);
    if (recent.length >= 30) {
      closeWithError(ws, WEBSOCKET_ERRORS.RATE_LIMIT_EXCEEDED);
      return;
    }
    wsMessageTimestamps.set(ws, [...recent, now]);

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', code: WEBSOCKET_MESSAGE_ERRORS.INVALID_JSON, message: 'Invalid JSON' }));
      return;
    }

    messageChain = messageChain.then(async () => {
      const currentSession = getSession(sessionId);
      if (!currentSession) {
        closeWithError(ws, WEBSOCKET_ERRORS.SESSION_NOT_FOUND);
        return;
      }

      console.log(`[WS] ${ws.participantId} (${ws.role}) in ${sessionId}: ${data.type}`);

      const stateChanged = await handleMessage(ws, currentSession, data);
      if (!stateChanged) return;

      const updatedSession = getSession(sessionId);
      const sockets = sessionSockets.get(sessionId) || new Set();
      broadcastState(updatedSession, sockets);
    }).catch((err) => {
      console.error(`[WS] Error (${ws.participantId ?? 'unknown'}):`, err.message);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', code: WEBSOCKET_MESSAGE_ERRORS.INTERNAL_SERVER_ERROR, message: 'Internal server error' }));
      }
    });
  });

  ws.on('close', () => {
    decrementWsConnectionCount(ws.clientIp);
    const sockets = sessionSockets.get(sessionId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) sessionSockets.delete(sessionId);
    }
    const currentSession = getSession(sessionId);
    if (currentSession) {
      removeParticipant(sessionId, ws.participantId);
      const remaining = sessionSockets.get(sessionId);
      if (remaining && remaining.size > 0) {
        broadcastState(getSession(sessionId), remaining);
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Socket error (${ws.participantId ?? 'unknown'}):`, err.message);
  });
}

wss.on('connection', handleConnection);
wss.on('error', (err) => console.error('[WSS] Server error:', err.message));

const SESSION_TTL_MS = (Number.parseInt(process.env.SESSION_TTL_HOURS) || 24) * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

function sweepInactiveSessions(sockets, ttlMs = SESSION_TTL_MS) {
  const cutoff = Date.now() - ttlMs;
  for (const session of getAllSessions()) {
    if (session.lastActivityAt < cutoff) {
      const sessionWs = sockets.get(session.id);
      if (sessionWs) {
        for (const ws of sessionWs) {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'session_expired' }));
          }
          ws.close(1001, 'Session expired');
        }
        sockets.delete(session.id);
      }
      deleteSession(session.id);
    }
  }
}

if (require.main === module) {
  setInterval(() => sweepInactiveSessions(sessionSockets), SWEEP_INTERVAL_MS).unref();
  server.listen(PORT, () => {
    console.log(`Champfrogs server listening on port ${PORT}`);
  });
}

module.exports = {
  app,
  broadcastState,
  handleConnection,
  sessionSockets,
  sweepInactiveSessions,
  wsConnectionCountsByIp,
};
