/**
 * Server-side bridge to the realtime mini-service: pushes events into share
 * rooms via the service's localhost-only internal endpoint. Fire-and-forget —
 * realtime is an enhancement, never a failure path (the persisted data is
 * already safe when this runs).
 */

const REALTIME_INTERNAL_URL = process.env.REALTIME_INTERNAL_URL ?? "http://127.0.0.1:3004";
const REALTIME_INTERNAL_SECRET = process.env.REALTIME_INTERNAL_SECRET ?? "dev-realtime-secret";

export interface RealtimeCommentEvent {
  token: string;
  authorName: string;
  isGuest: boolean;
  body: string;
}

async function postInternalNotify(body: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${REALTIME_INTERNAL_URL}/internal/notify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": REALTIME_INTERNAL_SECRET,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Realtime service down or restarting — the feature still works without it.
  }
}

export async function notifyRealtimeCommentAdded(event: RealtimeCommentEvent): Promise<void> {
  await postInternalNotify({
    token: event.token,
    event: "comment-added",
    payload: {
      authorName: event.authorName,
      isGuest: event.isGuest,
      body: event.body,
    },
  });
}

/** A comment's reactions changed — live viewers refetch the thread list. */
export async function notifyRealtimeReactions(token: string): Promise<void> {
  await postInternalNotify({ token, event: "reactions", payload: {} });
}

/** The file's scene changed server-side (e.g. version restore) — viewers refetch. */
export async function notifyRealtimeSceneSaved(token: string, fileId: string): Promise<void> {
  await postInternalNotify({ token, event: "scene-saved", payload: { fileId } });
}
