import { contextBridge, ipcRenderer } from "electron";
import { type CallResponse, CHANNEL_CALL, CHANNEL_EVENT, type JigBridge } from "../shared/ipc";

const bridge: JigBridge = {
  invoke: (method, args) => ipcRenderer.invoke(CHANNEL_CALL, method, args) as Promise<CallResponse<unknown>>,
  on(topic, listener) {
    const wrapped = (_event: unknown, eventTopic: string, payload: Parameters<typeof listener>[0]) => {
      if (eventTopic === topic) listener(payload);
    };
    ipcRenderer.on(CHANNEL_EVENT, wrapped);
    return () => {
      ipcRenderer.removeListener(CHANNEL_EVENT, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("jig", bridge);
