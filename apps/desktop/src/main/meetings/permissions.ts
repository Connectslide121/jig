/**
 * What Jig's own pages may ask for: the microphone and camera (dictation, talking, meetings), and
 * writing text to the clipboard (every Copy button). Everything else is refused.
 */
export function ownPagePermission(permission: string): boolean {
  return permission === "media" || permission === "clipboard-sanitized-write";
}

/** Media is available to the first-party main frame only, never a file preview or embedded page. */
export function ownMediaUrl(
  value: string | undefined,
  devUrl = process.env.JIG_RENDERER_URL,
  meetingOrigin?: string,
): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol === "jig-app:" && url.hostname === "app" && !url.username && !url.password) return true;
    return Boolean(
      (devUrl && url.origin === new URL(devUrl).origin) || (meetingOrigin && url.origin === meetingOrigin),
    );
  } catch {
    return false;
  }
}
