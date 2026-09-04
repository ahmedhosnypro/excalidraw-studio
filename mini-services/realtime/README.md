# Realtime collaboration service

Socket.io relay for live collaboration on shared drawings.

- **Port 3003** — socket.io, engine path `/`. Browsers connect through the
  gateway with the `XTransformPort=3003` query parameter
  (`io({ path: "/", query: { XTransformPort: 3003 } })`).
- **Port 3004** (localhost only) — internal notify endpoint used by the
  Next.js GraphQL layer to push "comment added" events into share rooms.
  Authenticated with the shared `REALTIME_INTERNAL_SECRET`.

## Rooms & events

One room per active share token (`share:<token>`), shared by the owner
editor and any number of guests:

| Event             | Direction            | Purpose                                        |
| ----------------- | -------------------- | ---------------------------------------------- |
| `rt:join`         | client → server      | Join with `{ token, role, name }`               |
| `rt:presence`     | server → room        | Participant list (id, role, name, color)       |
| `rt:cursor`       | both (relayed)       | Live cursor positions in scene coordinates     |
| `rt:viewport`     | owner → guests       | Owner pan/zoom (viewers in "follow" mode)      |
| `rt:scene-saved`  | owner → guests       | Owner autosaved — viewers refetch the scene    |
| `rt:comment-added`| internal API → room  | New comment (owner badge/toast, viewer refetch)|

## Run

```bash
cd mini-services/realtime
bun install
bun run dev        # bun --hot index.ts (auto-restarts on changes)
```

The app server picks the notify endpoint up from `REALTIME_INTERNAL_URL`
(default `http://127.0.0.1:3004`) and `REALTIME_INTERNAL_SECRET` — see the
root `.env.example`.
