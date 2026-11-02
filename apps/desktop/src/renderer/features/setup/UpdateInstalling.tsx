import { DoorClosed, PackageOpen, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { UpdateInfo } from "../../../shared/setup";
import { useHostEvent } from "../../lib/host";
import { Dialog, Spinner } from "../../ui";

const STEPS = [
  { icon: DoorClosed, text: "Jig closes in a moment." },
  { icon: PackageOpen, text: "The Jig installer opens and shows its progress." },
  { icon: RotateCcw, text: "Jig opens again when it's done." },
];

/** While an update installs, says what happens next, so Jig closing isn't a surprise (D-252). */
export function UpdateInstallingHost() {
  const [info, setInfo] = useState<UpdateInfo>();
  useHostEvent("updates.state", (state) => setInfo(state.download === "installing" ? state : undefined));
  return (
    <Dialog
      open={Boolean(info)}
      onClose={() => setInfo(undefined)}
      title={`Installing Jig ${info?.latest ?? ""}`.trim()}
      width="md"
      testId="update-installing"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-fg">
          <span className="flex size-5 shrink-0 items-center justify-center">
            <Spinner size="sm" />
          </span>
          Getting the installer ready…
        </div>
        <ol className="flex flex-col gap-2">
          {STEPS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2 text-sm text-muted">
              <span className="flex size-5 shrink-0 items-center justify-center">
                <Icon className="size-4" aria-hidden />
              </span>
              {text}
            </li>
          ))}
        </ol>
      </div>
    </Dialog>
  );
}
