const CARD_IDS = ['C', 'H', 'A', 'M', 'P', 'F', 'R', 'O', 'G', 'S'];

const sessions = new Map();

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (sessions.has(code));
  return code;
}

function createSession() {
  const id = generateCode();
  const session = {
    id,
    phase: 'waiting',
    participants: [],
    subject: {
      order: shuffle(CARD_IDS),
      yPositions: Object.fromEntries(CARD_IDS.map(id => [id, 50])),
    },
    interviewer: {
      order: shuffle(CARD_IDS),
      yPositions: Object.fromEntries(CARD_IDS.map(id => [id, 50])),
    },
    showInterviewer: false,
    lastActivityAt: Date.now(),
  };
  sessions.set(id, session);
  return session;
}

function getSession(id) {
  return sessions.get(id);
}

function getAllSessions() {
  return Array.from(sessions.values());
}

function markActivity(session) {
  session.lastActivityAt = Date.now();
}

function addParticipant(sessionId, participant) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const existing = session.participants.find(p => p.id === participant.id);
  if (existing) {
    existing.role = participant.role;
    markActivity(session);
    return;
  }
  session.participants.push(participant);
  markActivity(session);
}

function removeParticipant(sessionId, participantId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.participants = session.participants.filter(p => p.id !== participantId);
}

function setPhase(sessionId, phase) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.phase = phase;
  markActivity(session);
}

function setSubjectOrder(sessionId, order) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.subject.order = order;
  markActivity(session);
}

function setInterviewerOrder(sessionId, order) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.interviewer.order = order;
  markActivity(session);
}

function updateYPosition(sessionId, who, cardId, y) {
  const session = sessions.get(sessionId);
  if (!session) return;
  if (who === 'subject') {
    session.subject.yPositions[cardId] = y;
  } else {
    session.interviewer.yPositions[cardId] = y;
  }
  markActivity(session);
}

function setShowInterviewer(sessionId, show) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.showInterviewer = show;
  markActivity(session);
}

function resetSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.phase = 'waiting';
  session.participants = [];
  session.subject = {
    order: shuffle(CARD_IDS),
    yPositions: Object.fromEntries(CARD_IDS.map(id => [id, 50])),
  };
  session.interviewer = {
    order: shuffle(CARD_IDS),
    yPositions: Object.fromEntries(CARD_IDS.map(id => [id, 50])),
  };
  session.showInterviewer = false;
  markActivity(session);
}

function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

module.exports = {
  CARD_IDS,
  createSession,
  getSession,
  getAllSessions,
  addParticipant,
  removeParticipant,
  setPhase,
  setSubjectOrder,
  setInterviewerOrder,
  updateYPosition,
  setShowInterviewer,
  resetSession,
  deleteSession,
};
