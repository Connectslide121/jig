import { FolderOpen, RefreshCw, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { EvidenceNote, WorkedState } from "../../../shared/learning";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { useConfig } from "../../stores/config";
import { Badge, Button, Card, confirmDialog, IconButton, Spinner } from "../../ui";
import { notify } from "../../workbench/toasts";
import { CodeEditor } from "../preview/CodeEditor";

const CATEGORY: Record<EvidenceNote["category"], string> = {
  "manual-work": "by hand",
  "outside-jig": "outside Jig",
  frustration: "frustration",
  chore: "chore",
  preference: "preference",
  other: "note",
};

const KIND: Record<string, string> = {
  prompt: "Messages to Claude",
  "session.tool": "Claude's tool calls",
  "terminal.command": "Terminal commands",
  "script.run": "Scripts started",
  "addon.action": "Add-on actions",
  git: "Git actions",
  "project.switch": "Project switches",
  friction: "Friction (stops, rewinds, denials, corrections, failing scripts)",
  evidence: "Notes from chats",
  "ai.lines": "Files Claude wrote in",
};

type Knowledge = {
  profile: string;
  profileExists: boolean;
  notes: EvidenceNote[];
  activity: Array<{ kind: string; count: number }>;
};

/**
 * "What Jig knows about me" (Learning 2): the profile (editable), the notes Claude saved from chats
 * (deletable), the activity of the last 4 weeks by kind, and "How you worked". All local.
 */
export function KnowledgeTab() {
  const [data, setData] = useState<Knowledge>();
  const [draft, setDraft] = useState<string>();
  const [worked, setWorked] = useState<WorkedState>();
  const info = useConfig((s) => s.info);
  const load = useCallback(() => {
    void call("learning.knowledge").then(setData);
  }, []);
  useEffect(load, [load]);
  useHostEvent("learning.knowledgeChanged", load);
  useEffect(() => {
    void call("learning.worked", {})
      .then(setWorked)
      .catch(() => {});
  }, []);
  if (!data) return <Spinner className="m-4" />;
  const dirty = draft !== undefined && draft !== data.profile;
  const save = async () => {
    if (draft === undefined) return;
    try {
      await call("learning.setProfile", { text: draft });
      setDraft(undefined);
      notify({ title: "Profile saved", tone: "success" });
    } catch (error) {
      notify({ title: "Couldn't save", message: errorMessage(error), tone: "danger" });
    }
  };
  return (
    <div className="h-full overflow-y-auto" data-testid="knowledge-tab">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <div>
          <h1 className="text-lg font-semibold text-fg">What Jig knows about me</h1>
          <p className="text-sm text-muted">
            Everything Jig uses to suggest tools, workflows and tips. It stays on this computer; only the
            weekly reflection and check-ins send a summary to Claude. Edit or delete anything.
          </p>
        </div>

        <Card className="flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-fg">Profile</h2>
            {!data.profileExists && !dirty && <Badge>Not written yet</Badge>}
            <Button
              size="sm"
              variant={dirty ? "primary" : "ghost"}
              icon={Save}
              disabled={!dirty}
              onClick={() => void save()}
              data-testid="profile-save"
            >
              Save
            </Button>
          </div>
          <div className="h-72 overflow-hidden rounded-md border border-line" data-testid="profile-editor">
            <CodeEditor
              path="profile.md"
              value={data.profile}
              onChange={setDraft}
              onSave={() => void save()}
            />
          </div>
          <p className="text-xs text-hint">
            Suggestions propose additions ("Add to my profile"); check-ins and chats can add to it too, with
            Undo.
          </p>
        </Card>

        <Card className="flex flex-col gap-1 p-4" data-testid="knowledge-notes">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-fg">Notes from chats ({data.notes.length})</h2>
            {data.notes.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                onClick={async () => {
                  if (
                    await confirmDialog({
                      title: "Delete every note?",
                      confirmLabel: "Delete",
                      danger: true,
                    })
                  )
                    await call("learning.clearNotes");
                }}
              >
                Delete all
              </Button>
            )}
          </div>
          {data.notes.length === 0 && (
            <p className="text-sm text-muted">
              When you mention work you do by hand or outside Jig, Claude notes it here (you see a card in the
              chat).
            </p>
          )}
          {data.notes.map((n) => (
            <div
              key={n.id}
              className="group flex items-start gap-2 py-1 text-sm"
              data-testid="knowledge-note"
            >
              <Badge className="mt-0.5 shrink-0">{CATEGORY[n.category]}</Badge>
              <span className="min-w-0 flex-1 text-fg">{n.text}</span>
              <span className="shrink-0 text-xs text-hint">{new Date(n.at).toLocaleDateString()}</span>
              <IconButton
                icon={X}
                size="sm"
                label="Delete the note"
                onClick={() => void call("learning.removeNote", { id: n.id })}
                data-testid="knowledge-note-delete"
              />
            </div>
          ))}
        </Card>

        <Card className="flex flex-col gap-1 p-4">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-fg">Activity (last 4 weeks)</h2>
            <Button
              size="sm"
              variant="ghost"
              icon={FolderOpen}
              onClick={() => info && void call("app.openPath", { path: `${info.jigHome}/activity` })}
            >
              Open folder
            </Button>
          </div>
          {data.activity.length === 0 && <p className="text-sm text-muted">Nothing recorded yet.</p>}
          {data.activity.map((a) => (
            <div key={a.kind} className="flex gap-3 text-sm">
              <span className="flex-1 text-muted">{KIND[a.kind] ?? a.kind}</span>
              <span className="text-fg">{a.count}</span>
            </div>
          ))}
          <p className="mt-1 text-xs text-hint">
            Secrets are masked and pastes kept only as their kind. Settings → Learning pauses recording,
            excludes words or folders, and deletes it all.
          </p>
        </Card>

        <Card className="flex flex-col gap-1 p-4" data-testid="knowledge-worked">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-fg">How you worked (last 7 days)</h2>
            <IconButton
              icon={RefreshCw}
              size="sm"
              label="Measure again"
              onClick={() => void call("learning.worked", { refresh: true }).then(setWorked)}
            />
          </div>
          <p className="text-sm text-muted">
            {worked?.text ||
              "No commits of yours in the last 7 days. Lines Claude writes are told apart from lines you write when you commit."}
          </p>
        </Card>
      </div>
    </div>
  );
}
