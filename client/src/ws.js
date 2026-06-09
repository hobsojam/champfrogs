import { writable } from 'svelte/store';
import { WEBSOCKET_ERRORS } from '../../shared/errors.json';

export const sessionState = writable(null);
export const wsError = writable(null);
export const fatalWsError = writable(null);
export const isSessionExpired = writable(false);

let socket = null;
let retryCount = 0;
let retryTimeout = null;
let currentSessionId = null;
let intentionalClose = false;

const PARTICIPANT_KEY = 'participantId';

const TERMINAL_CLOSE_MESSAGES = {
  [WEBSOCKET_ERRORS.SESSION_ID_REQUIRED.code]: WEBSOCKET_ERRORS.SESSION_ID_REQUIRED.description,
  [WEBSOCKET_ERRORS.SESSION_NOT_FOUND.code]: WEBSOCKET_ERRORS.SESSION_NOT_FOUND.description,
  [WEBSOCKET_ERRORS.SESSION_FULL.code]: WEBSOCKET_ERRORS.SESSION_FULL.description,
  [WEBSOCKET_ERRORS.RATE_LIMIT_EXCEEDED.code]: WEBSOCKET_ERRORS.RATE_LIMIT_EXCEEDED.description,
};

function setFatalError(message) {
  wsError.set(message);
  fatalWsError.set(message);
}

function getOrCreateParticipantId() {
  let id = sessionStorage.getItem(PARTICIPANT_KEY);
  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.trunc(Math.random() * 16);
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
    sessionStorage.setItem(PARTICIPANT_KEY, id);
  }
  return id;
}

export function connect(sessionId) {
  currentSessionId = sessionId;
  intentionalClose = false;
  retryCount = 0;
  wsError.set(null);
  fatalWsError.set(null);
  isSessionExpired.set(false);
  getOrCreateParticipantId();
  openConnection();
}

function openConnection() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const participantId = sessionStorage.getItem(PARTICIPANT_KEY);
  const url = `${protocol}//${location.host}/ws?sessionId=${encodeURIComponent(currentSessionId)}&participantId=${encodeURIComponent(participantId)}`;
  socket = new WebSocket(url);

  socket.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'state') {
        sessionState.set(msg.session);
      } else if (msg.type === 'error') {
        wsError.set(msg.message);
      } else if (msg.type === 'session_expired') {
        intentionalClose = true;
        isSessionExpired.set(true);
        setFatalError('This session has ended. Sessions expire after 24 hours of inactivity.');
      }
    } catch {
      // ignore malformed messages
    }
  });

  socket.addEventListener('close', (event) => {
    if (intentionalClose) return;
    const terminalMessage = TERMINAL_CLOSE_MESSAGES[event.code];
    if (terminalMessage) {
      setFatalError(terminalMessage);
      return;
    }
    if (retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 1000;
      retryTimeout = setTimeout(openConnection, delay);
      retryCount++;
    } else {
      setFatalError('Connection lost. Please refresh the page.');
    }
  });

  socket.addEventListener('error', () => {
    wsError.set('WebSocket error. Attempting to reconnect...');
  });
}

export function send(message) {
  if (socket?.readyState === WebSocket.OPEN) {
    wsError.set(null);
    socket.send(JSON.stringify(message));
  }
}

export function disconnect() {
  intentionalClose = true;
  sessionStorage.removeItem(PARTICIPANT_KEY);
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  sessionState.set(null);
  wsError.set(null);
  fatalWsError.set(null);
  isSessionExpired.set(false);
}
