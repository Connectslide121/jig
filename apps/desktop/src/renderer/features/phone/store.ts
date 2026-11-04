import { create } from "zustand";
import type { PhoneState } from "../../../shared/phone";
import { call } from "../../lib/host";

/** Jig on your phone (D-337): the host's state, kept current by `phone.changed`. */
export const usePhone = create<{ state: PhoneState | undefined }>(() => ({ state: undefined }));

let started = false;
export function startPhone(): void {
  if (started) return;
  started = true;
  window.jig.on("phone.changed", (state) => usePhone.setState({ state }));
  void call("phone.state")
    .then((state) => usePhone.setState({ state }))
    .catch(() => undefined);
}
