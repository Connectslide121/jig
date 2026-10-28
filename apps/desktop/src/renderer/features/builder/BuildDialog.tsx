import { Sparkles } from "lucide-react";
import { useState } from "react";
import { create } from "zustand";
import type { BuildOrigin } from "../../../shared/builds";
import { useAddons } from "../../addons/loader";
import { call, errorMessage } from "../../lib/host";
import { Button, Dialog, Select, Textarea } from "../../ui";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";

interface Open {
  goal: string;
  addonId?: string;
  origin: BuildOrigin;
}

const useDialog = create<{ open: Open | undefined }>(() => ({ open: undefined }));

export function openBuildDialog(open: Open): void {
  useDialog.setState({ open });
}

/** Starts a build and opens its tab. */
export async function startBuild(goal: string, origin: BuildOrigin, targetAddonId?: string): Promise<void> {
  try {
    const job = await call("builds.start", { goal, origin, targetAddonId });
    workbench.openTab("jig.build", { buildId: job.id });
  } catch (error) {
    notify({ title: "Couldn't start the build", message: errorMessage(error), tone: "danger" });
  }
}

function Form({ open }: { open: Open }) {
  const addons = useAddons((s) => s.addons);
  const [goal, setGoal] = useState(open.goal);
  const [addonId, setAddonId] = useState(open.addonId ?? "");
  const close = () => useDialog.setState({ open: undefined });
  const submit = () => {
    close();
    void startBuild(goal.trim(), open.origin, addonId || undefined);
  };
  return (
    <Dialog
      open
      onClose={close}
      title="Build something"
      width="md"
      testId="build-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={Sparkles}
            disabled={!goal.trim()}
            onClick={submit}
            data-testid="build-submit"
          >
            Build
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm text-muted">
          Describe the tool or change. Jig tries the lightest thing first — a layout or settings change, then
          an add-on (changing an existing one when it fits), and only then its own code. You'll see a preview
          before anything changes.
        </div>
        <Textarea
          rows={5}
          value={goal}
          placeholder="e.g. A button in the status bar that runs the API's tests and shows if they pass"
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && goal.trim()) submit();
          }}
          data-testid="build-goal"
        />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">About an existing add-on (optional):</span>
          <Select
            value={addonId}
            onChange={(e) => setAddonId(e.target.value)}
            aria-label="Add-on"
            className="w-56"
          >
            <option value="">Let Jig decide</option>
            {addons.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Dialog>
  );
}

export function BuildDialogHost() {
  const open = useDialog((s) => s.open);
  return open ? <Form open={open} /> : null;
}
