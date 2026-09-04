/**
 * Server-side bridge to the realtime mini-service: pushes "comment added"
 * notifications into share rooms via the service's localhost-only internal
 * endpoint. Fire-and-forget — realtime is an enhancement, never a failure
 * path (the comment itself is already persisted when this runs).
 */

const REALTIME_INTERNAL_URL = process.env.REALTIME_INTERNAL_URL ?? "http://127.0.0.1:3004";
const REALTIME_INTERNAL_SECRET = process.env.REALTIME_INTERNAL_SECRET ?? "dev-realtime-secret";

export interface RealtimeCommentEvent {
  token: string;
  authorName: string;
  isGuest: boolean;
  body: string;
}

export async function notifyRealtimeCommentAdded(event: RealtimeCommentEvent): Promise<void> {
  try {
    await fetch(`${REALTIME_INTERNAL_URL}/internal/notify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": REALTIME_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        token: event.token,
        event: "comment-added",
        payload: {
          authorName: event.authorName,
          isGuest: event.isGuest,
          body: event.body,
        },
      }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Realtime service down or restarting — comments still work without it.
  }
}
