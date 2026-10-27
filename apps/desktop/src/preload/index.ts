import { contextBridge, ipcRenderer } from "electron";
import { type CallResponse, CHANNEL_CALL, CHANNEL_EVENT, type JigBridge } from "../shared/ipc";

// One IPC listener for all host events; subscribers are kept here (many views listen at once).
const listeners = new Map<string, Set<(payload: unknown) => void>>();
ipcRenderer.on(CHANNEL_EVENT, (_event, topic: string, payload: unknown) => {
  for (const listener of listeners.get(topic) ?? []) listener(payload);
});

const bridge: JigBridge = {
  invoke: (method, args) => ipcRenderer.invoke(CHANNEL_CALL, method, args) as Promise<CallResponse<unknown>>,
  on(topic, listener) {
    const set = listeners.get(topic) ?? new Set();
    const wrapped = listener as (payload: unknown) => void;
    set.add(wrapped);
    listeners.set(topic, set);
    return () => {
      set.delete(wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("jig", bridge);
