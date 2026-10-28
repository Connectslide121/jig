import { Settings2, Undo2 } from "lucide-react";
import { useState } from "react";
import type { ChatItem } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { Badge, Button } from "../../ui";
import { notify } from "../../workbench/toasts";

type ChangeItem = Extract<ChatItem, { kind: "change" }>;

/** Claude changed Jig's configuration from this chat: what changed, and Undo. */
export function ChangeCard({ item, sessionId }: { item: ChangeItem; sessionId: string }) {
  const [busy, setBusy] = useState(false);
  const undo = async () => {
    setBusy(true);
    try {
      await call("sessions.undoChange", { sessionId, itemId: item.id });
    } catch (error) {
      notify({ title: "Couldn't undo", message: errorMessage(error), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-line bg-raised px-3 py-2 text-xs"
      data-testid="change-card"
    >
      <Settings2 className="mt-0.5 size-3.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-fg">{item.summary}</div>
        {item.details.length > 0 && (
          <ul className="selectable mt-1 flex flex-col gap-0.5 font-mono text-2xs text-muted">
            {item.details.map((d) => (
              <li key={d} className="truncate" title={d}>
                {d}
              </li>
            ))}
          </ul>
        )}
      </div>
      {item.undone ? (
        <Badge>Undone</Badge>
      ) : item.undo ? (
        <Button
          size="sm"
          variant="ghost"
          icon={Undo2}
          busy={busy}
          onClick={() => void undo()}
          data-testid="change-undo"
        >
          Undo
        </Button>
      ) : null}
    </div>
  );
}
