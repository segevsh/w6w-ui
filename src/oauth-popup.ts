/**
 * Open an OAuth 2.0 authorize URL in a popup and resolve when the callback
 * page posts a `w6w: "oauth-result"` message back to the opener.
 *
 * The server-rendered callback page (see the w6w server) posts one of:
 *   { w6w: "oauth-result", ok: true,  connectionId: string }
 *   { w6w: "oauth-result", ok: false, error: string }
 *
 * Rejects if:
 *   - The popup was blocked (`window.open` returned null).
 *   - The user closed the popup without completing the flow.
 *   - The server signaled failure.
 */
export interface OAuthPopupResult {
  connectionId: string;
}

const POPUP_FEATURES = "width=560,height=720,menubar=no,toolbar=no,location=no";

export function startOAuthPopup(authorizationUrl: string): Promise<OAuthPopupResult> {
  return new Promise((resolve, reject) => {
    const popup = window.open(authorizationUrl, "w6w-oauth", POPUP_FEATURES);
    if (!popup) {
      reject(new Error("Popup blocked — allow popups for this site and try again."));
      return;
    }

    let done = false;
    const cleanup = () => {
      done = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(pollHandle);
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { w6w?: string; ok?: boolean; connectionId?: string; error?: string }
        | undefined;
      if (data?.w6w !== "oauth-result") return;
      cleanup();
      try {
        popup.close();
      } catch {
        /* popup may already be closed */
      }
      if (data.ok && typeof data.connectionId === "string") {
        resolve({ connectionId: data.connectionId });
      } else {
        reject(new Error(data.error ?? "OAuth flow failed."));
      }
    };
    window.addEventListener("message", onMessage);

    // If the user closes the popup without completing the flow the message
    // never arrives; detect that with a low-freq poll and reject cleanly.
    const pollHandle = window.setInterval(() => {
      if (done) return;
      if (popup.closed) {
        cleanup();
        reject(new Error("OAuth popup was closed before the flow completed."));
      }
    }, 500);
  });
}
