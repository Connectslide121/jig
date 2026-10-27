import type { JigBridge } from "../apps/desktop/src/shared/ipc";

declare global {
  interface Window {
    jig: JigBridge;
  }
}
