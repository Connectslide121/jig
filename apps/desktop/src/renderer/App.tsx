import { useEffect, useState } from "react";
import type { AppInfo } from "../shared/ipc";
import { call } from "./lib/host";
import { useThemeController } from "./lib/theme";
import { DialogHost, MenuHost } from "./ui";

export function App() {
  useThemeController();
  const [info, setInfo] = useState<AppInfo>();
  useEffect(() => {
    void call("app.info").then(setInfo);
  }, []);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2" data-testid="app-root">
      <h1 className="text-2xl font-semibold">Jig</h1>
      <p className="text-muted">{info ? `v${info.version} · ${info.engine} engine` : "Loading…"}</p>
      <MenuHost />
      <DialogHost />
    </div>
  );
}
