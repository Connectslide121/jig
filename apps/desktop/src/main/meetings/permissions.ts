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
