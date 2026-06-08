const { WEBSOCKET_MESSAGE_ERRORS } = require('../shared/errors.json');
const {
  CARD_IDS,
  addParticipant,
  setPhase,
  setSubjectOrder,
  setInterviewerOrder,
  updateYPosition,
  setShowInterviewer,
  resetSession,
} = require('./sessions');

const VALID_ROLES = new Set(['subject', 'interviewer']);

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sendError(ws, code, message) {
  send(ws, { type: 'error', code, message });
  return false;
}

function handleJoin(ws, session, data) {
  const role = data.role;
  if (!VALID_ROLES.has(role)) {
    return sendError(ws, WEBSOCKET_MESSAGE_ERRORS.INVALID_ROLE, 'Role must be subject or interviewer');
  }

  const existing = session.participants.find(p => p.id === ws.participantId);
  if (existing && existing.role === role) {
    ws.role = role;
    return true;
  }

  const takenByOther = session.participants.find(p => p.role === role && p.id !== ws.participantId);
  if (takenByOther) {
    return sendError(ws, WEBSOCKET_MESSAGE_ERRORS.ROLE_TAKEN, `Role ${role} is already taken`);
  }

  addParticipant(session.id, { id: ws.participantId, role });
  ws.role = role;

  if (session.phase === 'waiting' && role === 'subject') {
    setPhase(session.id, 'subject_arrange');
  }

  return true;
}

function validateOrder(order) {
  if (!Array.isArray(order) || order.length !== CARD_IDS.length) return false;
  const set = new Set(order);
  if (set.size !== CARD_IDS.length) return false;
  return CARD_IDS.every(id => set.has(id));
}

function handleFinishArrange(ws, session, data) {
  if (session.phase === 'subject_arrange' && ws.role === 'subject') {
    if (!validateOrder(data.order)) {
      return sendError(ws, WEBSOCKET_MESSAGE_ERRORS.INVALID_ORDER, 'Order must contain all 10 card IDs exactly once');
    }
    setSubjectOrder(session.id, data.order);
    setPhase(session.id, 'interviewer_arrange');
    return true;
  }

  if (session.phase === 'interviewer_arrange' && ws.role === 'interviewer') {
    if (!validateOrder(data.order)) {
      return sendError(ws, WEBSOCKET_MESSAGE_ERRORS.INVALID_ORDER, 'Order must contain all 10 card IDs exactly once');
    }
    setInterviewerOrder(session.id, data.order);
    setPhase(session.id, 'reveal');
    return true;
  }

  return sendError(ws, WEBSOCKET_MESSAGE_ERRORS.WRONG_PHASE, 'Cannot finish arrange in current phase');
}

function handleSetPhase(ws, session, data) {
  const allowed = new Set(['phase2', 'reveal']);
  if (!allowed.has(data.phase)) {
    return sendError(ws, WEBSOCKET_MESSAGE_ERRORS.INVALID_PHASE, 'Invalid phase transition');
  }
  if (data.phase === 'phase2' && session.phase !== 'reveal') {
    return sendError(ws, WEBSOCKET_MESSAGE_ERRORS.WRONG_PHASE, 'Can only advance to phase2 from reveal');
  }
  if (data.phase === 'reveal' && session.phase !== 'phase2') {
    return sendError(ws, WEBSOCKET_MESSAGE_ERRORS.WRONG_PHASE, 'Can only return to reveal from phase2');
  }
  setPhase(session.id, data.phase);
  return true;
}

function handleUpdateY(ws, session, data) {
  if (session.phase !== 'phase2') {
    return sendError(ws, WEBSOCKET_MESSAGE_ERRORS.WRONG_PHASE, 'Y positions can only be updated in phase2');
  }
  const who = data.who;
  if (who !== 'subject' && who !== 'interviewer') {
    return sendError(ws, WEBSOCKET_MESSAGE_ERRORS.INVALID_ROLE, 'who must be subject or interviewer');
  }
  if (!CARD_IDS.includes(data.cardId)) {
    return sendError(ws, WEBSOCKET_MESSAGE_ERRORS.INVALID_CARD_ID, 'Invalid card ID');
  }
  const y = Number(data.y);
  if (!Number.isFinite(y) || y < 0 || y > 100) {
    return sendError(ws, WEBSOCKET_MESSAGE_ERRORS.INVALID_Y_POSITION, 'Y must be a number between 0 and 100');
  }
  updateYPosition(session.id, who, data.cardId, y);
  return true;
}

function handleToggleInterviewer(ws, session, data) {
  setShowInterviewer(session.id, !!data.show);
  return true;
}

function handleReset(ws, session) {
  resetSession(session.id);
  return true;
}

async function handleMessage(ws, session, data) {
  switch (data.type) {
    case 'join':             return handleJoin(ws, session, data);
    case 'finish_arrange':   return handleFinishArrange(ws, session, data);
    case 'set_phase':        return handleSetPhase(ws, session, data);
    case 'update_y':         return handleUpdateY(ws, session, data);
    case 'toggle_interviewer': return handleToggleInterviewer(ws, session, data);
    case 'reset':            return handleReset(ws, session);
    default:
      return sendError(ws, WEBSOCKET_MESSAGE_ERRORS.UNKNOWN_MESSAGE_TYPE, `Unknown message type: ${data.type}`);
  }
}

module.exports = { handleMessage };
