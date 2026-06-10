# champfrogs — Project Context

## Project Overview

A self-hosted, real-time web tool for running the Moving Motivators activity. A session has one subject (the person being coached) and optionally one interviewer. The subject arranges 10 motivator cards by order of importance; the interviewer does the same independently. At reveal they compare side-by-side. In Phase 2 both parties drag cards up and down a Y-axis to score recent changes in motivation. Solo mode skips the interviewer entirely.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express 5, `ws`, `express-rate-limit` |
| Frontend | Svelte 5 (runes), Vite |
| Real-time | WebSockets (native, no Socket.io) |
| Deployment | Docker (single container, single port) |

No database. No external services. Session state is in-memory and ephemeral.

## Project Structure

```
champfrogs/
├── Dockerfile
├── docker-compose.yml
├── shared/
│   └── errors.json             # WS close codes + message error strings (shared)
├── server/
│   ├── package.json            # express, express-rate-limit, uuid, ws
│   ├── index.js                # Express + WebSocket server, port 3000
│   ├── handlers.js             # WebSocket message handlers
│   ├── sessions.js             # In-memory session state (Map)
│   ├── sanitize.js             # State sanitisation per role before broadcast
│   ├── validate.js             # Input sanitisation helpers (stripTags, shortText)
│   └── smoke.js                # End-to-end smoke test (no framework)
└── client/
    ├── package.json            # svelte, vite, @sveltejs/vite-plugin-svelte
    ├── vite.config.js          # /api + /ws proxy to :3000 in dev
    ├── index.html
    └── src/
        ├── main.js
        ├── App.svelte          # Main app: routing, WS state, all phase logic
        ├── ws.js               # WS client: connect/disconnect/send + session reactive state
        └── lib/
            ├── cards.js            # Card definitions (id, name, color, bg, description)
            ├── JoinForm.svelte     # Session creation / join screen
            ├── MotivatorCard.svelte
            ├── ArrangeRow.svelte   # Drag-to-order row for arrange phases
            ├── RevealView.svelte   # Side-by-side order comparison at reveal
            └── Phase2Board.svelte  # Y-axis drag board for phase 2
```

## Architecture

```
┌─────────────────────────────────────┐
│             Docker Container        │
│                                     │
│  Express (HTTP + static files)      │
│    └── WS upgrade → ws server       │
│                                     │
│  In-memory: Map<sessionId, Session> │
└─────────────────────────────────────┘
```

The Svelte app is compiled at Docker build time and served as static files by Express. WebSocket connections share port 3000 via HTTP upgrade.

## Session State Shape

```js
{
  id: string,            // 4-char uppercase code, e.g. 'ABCD'
  mode: 'paired' | 'solo',
  phase: 'waiting' | 'subject_arrange' | 'interviewer_arrange' | 'reveal' | 'phase2',
  participants: [{ id: string, role: 'subject' | 'interviewer' }],
  subject:     { order: string[], yPositions: { [cardId]: number } },
  interviewer: { order: string[], yPositions: { [cardId]: number } },
  showInterviewer: boolean,
  lastActivityAt: number,
}
```

The 10 card IDs are `C H A M P F R O G S` (one letter each, mnemonic for the card names).

### Phase Flow

```
waiting
  └─ subject joins ──→ subject_arrange
       └─ subject submits ──→ interviewer_arrange (paired)
       └─ subject submits ──→ phase2             (solo)
             └─ interviewer submits ──→ reveal
                   └─ set_phase ↔ phase2
```

Reset returns any phase to `waiting` and clears `participants`.

## Sanitisation Rules

`sanitize.js` filters session state before it is sent to a client. Never send data a role shouldn't see.

| Phase | What is included |
|---|---|
| `waiting` | base only (id, mode, phase, participants, connectedRoles, showInterviewer) |
| `subject_arrange` | base + `subjectOrder` (null for non-subject) |
| `interviewer_arrange` | base + `interviewerOrder` (null for non-interviewer) |
| `reveal` | base + both orders |
| `phase2` | base + full `subject` and `interviewer` objects |

`connectedRoles` is a string array derived from live `sessionSockets` — it reflects who is currently connected, not just who has joined. Use it for "is the other person here?" UI; use `participants` for "has this role ever joined?"

## WebSocket Message Protocol

All messages are JSON. Inbound (client → server):

| type | Payload | Notes |
|---|---|---|
| `join` | `{ role }` | `role` must be `subject` or `interviewer`; solo sessions reject `interviewer` |
| `finish_arrange` | `{ order: string[] }` | Must contain all 10 card IDs exactly once |
| `set_phase` | `{ phase }` | Only `reveal` ↔ `phase2`; must be joined |
| `update_y` | `{ who, cardId, y }` | `who` must equal `ws.role`; `y` is 0–100; phase2 only |
| `toggle_interviewer` | `{ show: boolean }` | Show/hide interviewer cards overlay; must be joined |
| `reset` | — | Returns to `waiting`, clears participants; must be joined |

Outbound (server → client):

| type | Payload |
|---|---|
| `state` | Full sanitised session state |
| `error` | `{ code: string, message: string }` |
| `session_expired` | (no payload) — sent before closing an expired session |

Error codes live in `shared/errors.json`:
- WS close codes (`WEBSOCKET_ERRORS`): 4001 rate limit, 4002 session ID required, 4003 not found, 4004 full
- Message error strings (`WEBSOCKET_MESSAGE_ERRORS`): `invalid_role`, `role_taken`, `invalid_order`, `wrong_phase`, `invalid_phase`, `invalid_card_id`, `invalid_y_position`, `invalid_json`, `internal_server_error`, `unknown_message_type`

## WebSocket Connection

URL: `/ws?sessionId=XXXX&participantId=UUID`

Properties set on `ws` in `handleConnection`:

| Property | Set when | Value |
|---|---|---|
| `ws.participantId` | on connect | from query param, or a fresh uuid |
| `ws.role` | on connect (restored) or after `join` | `null` \| `'subject'` \| `'interviewer'` |
| `ws.sessionId` | on connect | the session this WS belongs to |
| `ws.clientIp` | on connect | for rate limiting |

`ws.role` is restored immediately on reconnect if the participant is already in `session.participants`. All handler guards check `ws.role` — a WS that has not joined (role is null) cannot call any handler except `join`.

## Development Commands

Run server and client in separate terminals:

```bash
# Terminal 1 — backend
cd server && npm install && node index.js

# Terminal 2 — frontend (Vite dev server with API + WS proxy)
cd client && npm install && npm run dev
```

Vite proxies `/api` and `/ws` to `localhost:3000` so the dev server works against the local Node backend without CORS issues.

Verify the production build before opening a PR:

```bash
cd client && npm run build
```

Do not commit generated static bundles (`client/dist`). Docker and CI recreate them from source.

## Testing

The smoke test exercises the full paired flow, solo flow, post-reset re-join, and WS reconnect against a running server:

```bash
# Start the server first (cd server && node index.js), then:
node server/smoke.js

# Point at a different server:
BASE_URL=http://localhost:3099 node server/smoke.js
```

There are no unit tests or component tests currently.

## Docker

```bash
# Build and run
docker build -t champfrogs .
docker run -p 3000:3000 champfrogs

# Or with compose
docker compose up
```

The Dockerfile is a two-stage build:
1. `builder` stage: Node 26 alpine, builds the Svelte client (`npm run build`)
2. `runner` stage: Node 26 alpine, installs server prod deps only, copies compiled client into `server/public`

Static files are served from `STATIC_DIR` (defaults to `./public` relative to `server/`).

## Conventions

- Plain JavaScript throughout — no TypeScript
- Svelte 5 runes syntax throughout — `$state`, `$derived`, `$effect`. Do not use Svelte 4 stores (`writable`, `readable`, `derived` from `svelte/store`)
- No comments unless the WHY is non-obvious
- No external cloud dependencies — all runtime deps must be npm packages only
- Sanitise state before every broadcast — never send data a role shouldn't see
- All inbound WebSocket messages must be validated before acting on them
- Every handler must check `ws.role` (join guard) before doing anything; `ws.role === null` means the client hasn't joined and should receive an `invalid_role` error
- `participants` represents membership (immutable once joined; only `resetSession` clears it). `sessionSockets` represents live connections. Do not confuse the two
- `update_y` must verify `ws.role === data.who` — a participant can only move their own cards

## Dependency Changes

When adding or removing npm packages, do all installs and uninstalls in one pass, then verify the lock file is clean before committing:

```bash
# Good — single pass
npm install pkg-a pkg-b && npm uninstall pkg-c

# If you've made multiple separate npm calls, regenerate the lock file:
rm package-lock.json && npm install
```

Always commit both `package.json` and `package-lock.json` together.

The client CI steps use `npm install` rather than `npm ci`. The lock file is generated on Windows and does not contain Linux-specific optional packages that `npm ci` on Linux requires.

## Git Workflow

- Feature branches: `feat/<short-description>`, fix branches: `fix/<short-description>`, PRs targeting `master`
- Never commit directly to `master`
- Always include the co-author trailer in commit messages:
  ```
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```
- Never force-push to `master`

## Shell Tool Selection (Windows)

This project runs on Windows with PowerShell as the login shell.

**Decision rule — pick one tool per operation:**

| What you need | Use |
|---|---|
| `git`, `gh`, `npm`, `node`, `docker` | `Bash` tool (POSIX shell, same commands on any OS) |
| File ops: search, read, edit, write | Dedicated tools (`Grep`, `Read`, `Edit`, `Write`, `Glob`) — never `Bash` or `PowerShell` |
| Windows-only tasks (registry, COM, etc.) | `PowerShell` tool |
| Everything else | `Bash` tool first; fall back to `PowerShell` only if Bash fails |

Do **not** mix shells in a single logical operation.
