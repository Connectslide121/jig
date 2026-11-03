import { useEffect, useState } from "react";
import { call } from "../../lib/host";
import { cn, Tooltip } from "../../ui";

/** Profile pictures by e-mail, asked of the host once per window (D-291); null = initials. */
const photos = new Map<string, Promise<string | null>>();

/** Someone's Microsoft profile picture by e-mail / user principal name, or null. Cached. */
export function personPhoto(email: string): Promise<string | null> {
  const key = email.trim().toLowerCase();
  if (!key) return Promise.resolve(null);
  let photo = photos.get(key);
  if (!photo) {
    photo = call("people.photo", { email: key }).catch(() => null);
    photos.set(key, photo);
  }
  return photo;
}

/** "Ann Demo" → "AD", "ann.demo@contoso.com" → "AD". */
export function personInitials(name: string): string {
  const words = name.split(/[\s.@_-]+/).filter(Boolean);
  if (!words.length) return "";
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

/** `sm` sits in a line of small text (a card's footer), `md` beside an input (the same height). */
const SIZES = { sm: "size-5 text-2xs", md: "size-7 text-xs" } as const;

/**
 * A person as a round avatar: their Microsoft profile picture (from the meeting sign-in) over their
 * initials. Always the same size, also while the picture loads, and an empty slot of that size when
 * there is nobody (`name` empty), so rows keep their alignment. Hover: name and e-mail.
 */
export function PersonAvatar({
  name,
  email,
  size = "sm",
  className,
  "data-testid": testId,
}: {
  name?: string;
  email?: string;
  size?: keyof typeof SIZES;
  className?: string;
  "data-testid"?: string;
}) {
  const [src, setSrc] = useState<string | null>();
  useEffect(() => {
    setSrc(undefined);
    if (!email) return;
    let live = true;
    void personPhoto(email).then((p) => live && setSrc(p));
    return () => {
      live = false;
    };
  }, [email]);
  const slot = cn("relative flex shrink-0 rounded-full", SIZES[size], className);
  if (!name && !email) return <span aria-hidden data-testid={testId} className={slot} />;
  const label = name || email || "";
  return (
    <Tooltip
      content={
        <span className="flex flex-col">
          <span className="font-medium">{label}</span>
          {email && email !== label ? <span className="text-muted">{email}</span> : null}
        </span>
      }
    >
      <span
        role="img"
        data-testid={testId}
        aria-label={email && email !== label ? `${label} (${email})` : label}
        className={cn(
          slot,
          "items-center justify-center overflow-hidden bg-accent-soft font-semibold text-accent",
        )}
      >
        {personInitials(label)}
        {src ? (
          <img
            src={src}
            alt=""
            draggable={false}
            className="absolute inset-0 size-full rounded-full object-cover"
          />
        ) : null}
      </span>
    </Tooltip>
  );
}
