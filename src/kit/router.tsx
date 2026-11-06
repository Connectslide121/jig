import { type AnchorHTMLAttributes, useSyncExternalStore } from "react";

const read = () => {
  const h = window.location.hash.replace(/^#/, "");
  return h.startsWith("/") ? h.split("?")[0] || "/" : "/";
};
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

/** The current hash route ("/" when none). Hash routes work from a folder opened without a server. */
export const useRoute = () => useSyncExternalStore(subscribe, read, () => "/");

export function navigate(path: string) {
  if (read() !== path) window.location.hash = path;
}

export function Link({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a href={`#${to}`} {...props} />;
}
