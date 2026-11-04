import { useState } from "react";
import type { QuitQuestion } from "../../../shared/quit";
import { Icon } from "../../addons/icons";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { Button, Dialog } from "../../ui";
import { notify } from "../../workbench/toasts";

/**
 * Jig was about to quit and something asks first (D-343): a meeting, a running timer… One row per
 * reason, with its own buttons (each runs, then Jig quits), and Cancel (the default) or Quit anyway.
 */
export function QuitDialogHost() {
  const [question, setQuestion] = useState<QuitQuestion>();
  const [busy, setBusy] = useState<string>();
  useHostEvent("quit.ask", (q) => {
    setBusy(undefined);
    setQuestion(q);
  });
  const update = question?.purpose === "update";

  const decide = async (choice: { quit: boolean; reason?: string; action?: string }, key = "quit") => {
    if (!choice.quit) {
      setQuestion(undefined);
      void call("quit.decide", choice);
      return;
    }
    setBusy(key);
    try {
      await call("quit.decide", choice);
      setQuestion(undefined);
    } catch (error) {
      notify({ title: "That didn't work", message: errorMessage(error), tone: "danger" });
    } finally {
      setBusy(undefined);
    }
  };
  const cancel = () => void decide({ quit: false });

  return (
    <Dialog
      open={Boolean(question)}
      onClose={cancel}
      title={update ? "Restart Jig to install the update?" : "Quit Jig?"}
      width="md"
      testId="quit-dialog"
      footer={
        <>
          <Button onClick={cancel} data-autofocus disabled={Boolean(busy)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={busy === "quit"}
            disabled={Boolean(busy)}
            onClick={() => void decide({ quit: true })}
          >
            {update ? "Restart anyway" : "Quit anyway"}
          </Button>
        </>
      }
    >
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {question?.reasons.map((reason) => (
          <li key={reason.key} className="flex items-start gap-3 px-3 py-2.5" data-testid="quit-reason">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface text-muted">
              <Icon name={reason.icon ?? "puzzle"} className="size-4" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-xs text-muted">{reason.source}</span>
              <span className="font-medium text-fg">{reason.message}</span>
              {reason.detail && <span className="text-muted">{reason.detail}</span>}
              {reason.actions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {reason.actions.map((action) => {
                    const key = `${reason.key}/${action.id}`;
                    return (
                      <Button
                        key={action.id}
                        size="sm"
                        busy={busy === key}
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void decide({ quit: true, reason: reason.key, action: action.id }, key)
                        }
                      >
                        {action.label}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
