# Moving Motivators — CHAMPFROGS

A two-player web tool for the Management 3.0 Moving Motivators exercise. Supports an interviewer and subject working through the exercise on separate devices in real time.

## How it works

**Phase 1 — Importance**

Each player independently drags the 10 CHAMPFROGS cards into order from left (least important) to right (most important). Arrangements are hidden from the other player until both have submitted. The reveal shows both rows side by side — interviewer on top, subject on bottom — for discussion.

**Phase 2 — Realisation**

The subject's cards are placed on a 2D board. The x-axis preserves their Phase 1 importance ranking. The y-axis is free: drag cards up (realised) or down (prevented by the role). A toggle reveals the interviewer's cards in the same space, allowing both perspectives to be compared and adjusted during discussion.

## Running locally

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Start the server (terminal 1)
cd server && npm start

# Start the client dev server (terminal 2)
cd client && npm run dev
```

Open `http://localhost:5173` in two browser windows (or on two devices on the same network, replacing localhost with your machine's IP).

One player creates a session and shares the 4-letter code. Both players choose their role (Subject / Interviewer) before joining.

## Running with Docker

```bash
docker compose up --build
```

Open `http://localhost:3000` on both devices.

## Deploying

The Docker image is self-contained and runs on any platform that supports Node.js 26 or Docker. Push to Railway, Render, Fly.io, or similar:

```bash
# Example: Railway
railway up
```

Set the `PORT` environment variable if the platform requires it (most do this automatically). No database or external services required.

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
