import { useEffect, useState } from "react";
import { call } from "../../lib/host";

/** Profile pictures by id, asked once per window (D-263). */
const photos = new Map<string, Promise<string | null>>();

function photoOf(id: string): Promise<string | null> {
  let photo = photos.get(id);
  if (!photo) {
    photo = call("meetings.photo", { id }).catch(() => null);
    photos.set(id, photo);
  }
  return photo;
}

/**
 * A person's Microsoft profile picture over their initials, filling the avatar it sits in (which
 * keeps its size, so nothing moves when the picture arrives). Nothing when there is no picture.
 * `id`: a Teams participant id (`8:orgid:…`), an Entra object id, or "local" for you.
 */
export function PersonPhoto({ id }: { id?: string }) {
  const [src, setSrc] = useState<string | null>();
  useEffect(() => {
    if (!id) return;
    let live = true;
    void photoOf(id).then((p) => live && setSrc(p));
    return () => {
      live = false;
    };
  }, [id]);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="absolute inset-0 size-full rounded-full object-cover"
    />
  );
}
