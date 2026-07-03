# Moving Motivators — CHAMPFROGS

A two-player web tool for the Management 3.0 Moving Motivators exercise. Supports an interviewer and subject working through the exercise on separate devices in real time.

**Live demo:** https://champfrogs.onrender.com — runs on Render's free tier, so the first load after a quiet period takes ~30–60 seconds while the instance wakes up.

## How it works

**Phase 1 — Importance**

Each player independently drags the 10 CHAMPFROGS cards into order from left (least important) to right (most important). Arrangements are hidden from the other player until both have submitted. The reveal shows both rows side by side — interviewer on top, subject on bottom — for discussion.

**Phase 2 — Realisation**

The subject's cards are placed on a 2D board. The x-axis preserves their Phase 1 importance ranking. The y-axis is free: drag cards up (realised) or down (prevented by the role). A toggle reveals the interviewer's cards in the same space — both sets remain draggable, allowing either participant to adjust positions as the discussion develops.

## Running locally

**Single machine (two browser windows):**

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Start the server (terminal 1)
cd server && npm start

# Start the client dev server (terminal 2)
cd client && npm run dev
```

Open `http://localhost:5173` in two browser windows. One player creates a session and shares the 4-letter code. Both players choose their role (Subject / Interviewer) before joining.

**Two devices on the same network:**

The Vite dev server only proxies from the local machine, so use the Docker setup for two-device testing:

```bash
docker compose up --build
```

Open `http://<your-machine-ip>:3000` on both devices.

## Testing

**Unit tests** — sanitization matrix, order validation, session expiry:

```bash
cd server && npm test
```

**Smoke test** — 64 end-to-end checks against a running server, covering the full session lifecycle: HTTP API, built client assets, WebSocket flow, phase transitions, role-based state sanitization, authorization guards, message validation, rate limiting, solo mode, reconnect, and reset:

```bash
cd server && npm start         # in one terminal
node smoke.js                  # in another
```

**Browser E2E** — Playwright drives the built client through the paired and solo flows (requires `npm run build` in `client` first):

```bash
cd client && npx playwright install chromium   # once
npx playwright test
```

Note: card drag-and-drop still requires manual verification in a browser; the E2E tests submit the default arrangement.

## Deploying

The demo instance runs on Render's free tier, defined by `render.yaml`: in Render choose New → Blueprint, select this repo, and confirm. Merges to `master` auto-deploy.

The Docker image is otherwise self-contained and runs on any platform that supports Node.js 26 or Docker (Railway, Fly.io, or similar). Set the `PORT` environment variable if the platform requires it (most do this automatically), and `TRUST_PROXY=true` behind a TLS-terminating proxy so rate limiting sees real client IPs. No database or external services required.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | 3000 | HTTP and WebSocket port |
| `STATIC_DIR` | ./public | Built client files |
| `SESSION_TTL_HOURS` | 24 | Hours of inactivity before session expiry |
| `TRUST_PROXY` | false | Trust `X-Forwarded-For` (set to `true` behind a reverse proxy) |
| `WS_CONNECTION_LIMIT_PER_IP` | 10 | Max concurrent WebSocket connections per IP |
| `API_RATE_LIMIT_MAX` | 100 | API requests per 15 minutes |
| `SESSION_RATE_LIMIT_MAX` | 20 | Session creations per hour |

## Device requirements

The app is designed for laptops and tablets (768px+ wide). It does not work on phones.

Phase 1 requires 10 cards to be arranged side-by-side in a single row. Even at minimum card size this needs roughly 660px of horizontal space — narrower viewports overflow with no scroll. Phase 2 uses fixed-size cards at percentage positions across the board width, so edge cards are clipped on narrow screens.

Both participants should use a laptop or tablet.

## The CHAMPFROGS motivators

| Letter | Motivator | Description |
|---|---|---|
| C | Curiosity | Lots of things to investigate and think about |
| H | Honor | Personal values reflected in how you work |
| A | Acceptance | People approve of what you do and who you are |
| M | Mastery | Work challenges you but within your abilities |
| P | Power | Room to influence what happens around you |
| F | Freedom | Independent in your work and responsibilities |
| R | Relatedness | Good social contacts with people at work |
| O | Order | Enough rules and policies for stability |
| G | Goal | Purpose in life reflected in your work |
| S | Status | Position recognized by the people around you |

## License

MIT © 2026 James Hobson
