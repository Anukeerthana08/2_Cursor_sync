# Real-Time Multiplayer Cursor & Reaction Sync

## The Problem

The assignment asks for something most of us take for granted every time we use Figma, Google Docs, or any live collaborative tool: seeing other people's cursors move on your screen in real time. The catch is you're not allowed to use any of the libraries that normally do this for you, no Socket.IO, no Yjs, no PartyKit. You have to build the actual sync engine yourself: the message format, the server that relays it, and the logic that makes remote movement look smooth instead of jumpy.

So the real problem isn't "draw a dot on a canvas." It's: how do you take a stream of unreliable, irregularly-timed network updates and turn them into something that feels live?

## My Approach

I broke this into three separate problems and solved each one deliberately, rather than trying to wing a single "sync everything" solution:

**1. Don't flood the network.**
A mouse fires 60–120 position events per second. Sending every single one would be wasteful and wouldn't actually make things smoother, it would just add load. Instead, I sample the latest cursor position and send it on a fixed interval (every 50ms, so 20 updates/sec). This is a deliberate trade-off: slightly less "raw" data, but the interpolation layer (next point) more than makes up for it visually.

**2. Make movement smooth even with gaps.**
Because updates arrive every 50ms rather than continuously, if I just redrew each cursor exactly where the latest message said, it would look like it's teleporting. So I keep the *last two* known positions for every remote client, and on every animation frame I calculate where the cursor should be *right now* by interpolating between those two points based on how much time has passed. This is the same basic idea multiplayer games use to make network play look smooth, you're always drawing a believable "in-between" position rather than waiting for or snapping to the next real update.

**3. Handle the network being unreliable, because it will be.**
Messages can arrive out of order, a tab can be closed without warning, and a connection can just silently drop. So every cursor/reaction message carries a sequence number, and I discard anything that arrives out of order. The server listens for the WebSocket's close and error events to detect disconnects and immediately tells everyone else in the room that client is gone. On the client side, if the connection drops, it automatically tries to reconnect and rejoin the same room without duplicating the user's own cursor.

## Why This Approach

I could have reached for a heavier, more "clever" solution, extrapolation, adaptive bitrate throttling, conflict resolution for simultaneous actions, but I intentionally kept this focused. The assignment is testing whether I understand "what these sync libraries actually do under the hood", not whether I can build the most feature complete real-time engine possible. A correct, well-explained, smooth 2-action demo is a stronger signal than a half-working attempt at ten features. So I optimized for getting the core loop protocol, throttling, interpolation, failure handling, genuinely right, rather than spreading effort thin.

## Tech Stack

**Server:** Node.js + TypeScript, using the raw `ws` package (a thin WebSocket library, not a sync framework). No database , all room and presence state lives in memory, since persistence wasn't a requirement.

**Client:** React + TypeScript, scaffolded with Vite, using the browser's native `WebSocket` API directly. Rendering is done on a plain HTML5 Canvas, no drawing libraries.

I picked this stack because the assignment explicitly bans sync/state libraries but doesn't restrict UI frameworks, so React let me focus my effort on the actually hard part (the protocol and interpolation) instead of hand rolling UI state management too.

## How to Run It

Clone the repo and install dependencies for both halves of the project:

git clone https://github.com/Anukeerthana08/2_Cursor_sync.git
cd 2_Cursor_sync
cd server && npm install
cd ../client && npm install

Then start both sides in two separate terminals:

Terminal 1:
cd server
npm run dev

Terminal 2:
cd client
npm run dev

Open the local URL the client prints (usually `http://localhost:5173`) in your browser. To test the multiplayer behavior properly, open that same URL in 3–5 separate tabs, you should see every tab's cursor moving in every other tab, and clicking anywhere should trigger a reaction visible everywhere. Closing a tab should make its cursor disappear from the rest within a couple of seconds.

To join a specific room instead of the default one, add `?room=your-room-name` to the URL.

## Protocol Design

Every message exchanged between client and server is typed and validated, if something malformed or unrecognized comes through, it's dropped rather than crashing anything.

| Message | Direction | Shape | Purpose |
|---|---|---|---|
| `join` | client → server | `{ type: 'join', roomId, clientId }` | Enter a room |
| `cursor` | client → server → others | `{ type: 'cursor', clientId, x, y, seq }` | Report position |
| `reaction` | client → server → others | `{ type: 'reaction', clientId, x, y, emoji, seq }` | One-off tap event |
| `leave` | server → remaining clients | `{ type: 'leave', clientId }` | Someone disconnected |
| `presence` | server → client | `{ type: 'presence', clients: string[] }` | Current room roster |

The server never sends a client's own message back to itself, only to everyone else in the room.

## Interpolation Strategy

I store the last two known positions (with timestamps) for every remote client. On each animation frame, I calculate a position between those two points based on how much time has elapsed, effectively always drawing a believable "right now" position instead of the last received "then" position. If a client goes quiet for more than a second, I just hold its cursor still rather than guessing further into the unknown.

The trade-off here is a small, barely perceptible delay (roughly one update interval, ~50ms) in exchange for motion that looks continuous instead of choppy. Given how small that delay is, it was an easy call.

## Failure Handling

| Situation | What happens |
|---|---|
| Tab closed | Server catches the `close` event, removes the client, tells everyone else |
| Network drops | Client detects it, retries the connection, rejoins the same room without duplicating itself |
| Out-of-order message | Discarded if its sequence number is older than the last one already applied |
| Malformed message | Rejected on validation, connection stays alive |

## Architecture

Browser mousemove → throttle (50ms) → WebSocket send → server validates and broadcasts to the room (excluding sender) → other clients receive, check sequence, buffer for interpolation → Canvas redraws every animation frame.

I kept a strict separation between the pieces so any one of them can change independently:
- `connection.ts` only knows about the WebSocket itself — connecting, sending, receiving, reconnecting.
- `protocol.ts` only defines and validates message shapes.
- `interpolation.ts` only does the position-smoothing math.
- `render.ts` only draws to the canvas.

That means adding a new action type later would only touch `protocol.ts` and `render.ts` — the transport layer wouldn't need to change at all.

## Limitations

- No persistence — if the server restarts, all room and cursor state is gone.
- No authentication — anyone with the room name can join.
- Not built for horizontal scaling — this runs as a single server process.
- No mobile touch support.

## Time Spent

* 2 hours across 3 days

## Screenshots

Client:

<img width="740" height="325" alt="Terminal_client" src="https://github.com/user-attachments/assets/a90606e6-b425-4490-86ec-cb557fcfff8c" />

Server:

<img width="859" height="167" alt="Terminal_server" src="https://github.com/user-attachments/assets/066c2283-9c18-4988-ba4b-115848ea9428" />

Cursor LocalHost:

<img width="1710" height="622" alt="Cursor_2" src="https://github.com/user-attachments/assets/d6f3f9cd-d3d6-4d8e-8bed-f8e1c6929146" />

<img width="1703" height="476" alt="Cursor_1" src="https://github.com/user-attachments/assets/966827a0-93df-4a47-8734-46add0a9dab3" />



