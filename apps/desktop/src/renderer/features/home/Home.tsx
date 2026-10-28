import {
  ArrowUp,
  BookOpen,
  CalendarClock,
  FileText,
  FolderGit2,
  FolderOpen,
  GitBranch,
  LayoutTemplate,
  type LucideIcon,
  MessageSquare,
  MoreHorizontal,
  Settings2,
  Sparkles,
  Split,
  SquareTerminal,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProjectInfo } from "../../../shared/projects";
import { call, errorMessage } from "../../lib/host";
import { Badge, Button, cn, IconButton, Kbd, openMenuAt, Select } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { runAction, useRegistry } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { openAbout } from "../about";
import { openAttemptsDialog } from "../attempts/AttemptsDialog";
import { projectTextClass } from "../projects/colors";
import { openProjectDialog } from "../projects/ProjectDialog";
import { projectMenu } from "../projects/projectMenu";
import { useDashboardWidgets } from "../projects/widgets";
import { newSession } from "../sessions/actions";
import { STATUS_LABEL, StatusDot } from "../sessions/status";
import { useSessions } from "../sessions/store";

/** First things people ask Claude in a project; a click puts it in the box. */
const STARTERS = [
  "Explain how this project is organised",
  "Review my uncommitted changes for bugs",
  "Write tests for the code I changed",
  "Create a CLAUDE.md for this project",
];

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** Starts a chat in the project and sends the message right away. */
async function startChat(projectId: string, text: string, cwd?: string): Promise<void> {
  const id = await newSession(projectId, cwd);
  if (!id) return;
  try {
    await call("sessions.send", { id, text });
  } catch (error) {
    notify({ title: "Not sent", message: errorMessage(error), tone: "danger" });
  }
}

function QuickAction({
  icon: Icon,
  label,
  hint,
  onClick,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ? `${label} (${hint})` : label}
      data-testid={testId}
      className="flex min-w-0 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-left hover:border-line-strong hover:bg-hover"
    >
      <Icon className="size-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{label}</span>
    </button>
  );
}

/**
 * Home of a project: what you see when no tab is open (and the project dashboard). Starting work is
 * one box away; recent chats, the usual next steps and the add-ons' widgets are below it.
 */
export function Home({ project }: { project: ProjectInfo }) {
  const [text, setText] = useState("");
  // The folder the chat starts in: the project's default workspace unless you pick another.
  const [cwd, setCwd] = useState(project.path);
  useEffect(() => setCwd(project.path), [project.path]);
  const workspaces = useProjects((s) => s.workspaces);
  const starters = project.starters?.length ? project.starters : STARTERS;
  const box = useRef<HTMLTextAreaElement>(null);
  const widgets = useDashboardWidgets();
  const hasGit = useRegistry((s) => Boolean(s.views["addon.git.git"]));
  const metas = useSessions((s) => s.metas);
  const recent = Object.values(metas)
    .filter((m) => m.projectId === project.id && m.kind !== "builder" && !m.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);
  const send = () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    void startChat(project.id, value, cwd === project.path ? undefined : cwd);
  };
  const repoCount = project.repos.length;
  return (
    <div className="h-full overflow-y-auto" data-testid="home">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className={cn("truncate text-2xl font-semibold", projectTextClass(project.color))}>
              {project.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="selectable truncate font-mono">{project.path}</span>
              {repoCount > 0 && (
                <Badge tone="info">
                  <FolderGit2 className="mr-1 size-3" /> {repoCount} repositories
                </Badge>
              )}
              {!project.exists && <Badge tone="danger">folder not found</Badge>}
            </div>
          </div>
          <IconButton
            icon={Settings2}
            label="Project settings"
            data-testid="home-project-settings"
            onClick={() => openProjectDialog(project.id)}
          />
          <IconButton
            icon={FolderOpen}
            label="Open the folder"
            onClick={() => void call("app.openPath", { path: project.path })}
          />
          <IconButton
            icon={MoreHorizontal}
            label="Project options"
            onClick={(e) => openMenuAt(e.currentTarget, projectMenu(project), true)}
          />
        </header>

        <section className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-raised p-3 focus-within:border-focus">
            <textarea
              ref={box}
              rows={3}
              value={text}
              autoFocus
              data-testid="home-input"
              placeholder={`What should Claude do in ${project.name}?`}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              className="min-h-16 w-full resize-none bg-transparent text-base text-fg outline-none placeholder:text-hint"
            />
            <div className="flex items-center gap-2">
              <Select
                aria-label="Folder the chat starts in"
                title="Folder the chat starts in"
                className="h-7 max-w-56 text-xs"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                data-testid="home-folder"
              >
                {workspaces.map((w) => (
                  <optgroup key={w.id} label={w.path === project.path ? `${w.name} (default)` : w.name}>
                    <option value={w.path}>{w.name}</option>
                    {w.repos.map((r) => (
                      <option key={r.path} value={r.path}>
                        {w.name}/{r.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
              <span className="hidden text-2xs text-hint lg:inline">
                <Kbd>Enter</Kbd> starts a chat · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line
              </span>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                icon={Split}
                title="The same task in 2–4 parallel chats, each in its own copy of the repository"
                onClick={() => openAttemptsDialog({ task: text, projectId: project.id })}
              >
                Try several ways…
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={ArrowUp}
                disabled={!text.trim()}
                onClick={send}
                data-testid="home-send"
              >
                Start chat
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {starters.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setText(s);
                  box.current?.focus();
                }}
                className="flex h-7 items-center gap-1.5 rounded-full border border-line px-3 text-xs text-muted hover:border-accent hover:text-fg"
              >
                <Sparkles className="size-3 text-accent" />
                {s}
              </button>
            ))}
          </div>
        </section>

        {recent.length > 0 && (
          <section className="flex flex-col gap-1" data-testid="home-recent">
            <div className="flex items-center gap-2 text-2xs font-semibold tracking-wide text-hint uppercase">
              Recent chats
              <button
                type="button"
                className="normal-case tracking-normal text-accent hover:underline"
                onClick={() => workbench.showView("jig.sessions")}
              >
                All chats
              </button>
            </div>
            {recent.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => workbench.openTab("jig.chat", { sessionId: m.id })}
                className="flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-hover"
              >
                <StatusDot status={m.status} />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{m.title}</span>
                {m.status !== "idle" && (
                  <span className={cn("text-2xs", m.status === "needs_you" ? "text-warning" : "text-muted")}>
                    {STATUS_LABEL[m.status]}
                  </span>
                )}
                <span className="shrink-0 text-2xs text-hint">{ago(m.updatedAt)}</span>
              </button>
            ))}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <div className="text-2xs font-semibold tracking-wide text-hint uppercase">Next steps</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <QuickAction
              icon={MessageSquare}
              label="New chat"
              hint="Ctrl+N"
              onClick={() => void newSession(project.id)}
              testId="home-new-chat"
            />
            {hasGit && (
              <QuickAction
                icon={GitBranch}
                label="Review changes"
                hint="Ctrl+Shift+G"
                onClick={() => workbench.showView("addon.git.git")}
              />
            )}
            <QuickAction
              icon={SquareTerminal}
              label="Run a script…"
              onClick={() => runAction("addon.scripts.run")}
            />
            <QuickAction icon={FileText} label="Write my standup" onClick={() => runAction("jig.standup")} />
            <QuickAction icon={CalendarClock} label="Routines" onClick={() => runAction("jig.routines")} />
            <QuickAction icon={LayoutTemplate} label="Artifacts" onClick={() => runAction("jig.artifacts")} />
            <QuickAction icon={Wand2} label="Build a tool for Jig…" onClick={() => runAction("jig.build")} />
            <QuickAction icon={BookOpen} label="What Jig can do" onClick={() => openAbout()} />
          </div>
        </section>

        {widgets.length > 0 && (
          <section className={cn("grid grid-cols-1 gap-3", widgets.length > 1 && "lg:grid-cols-2")}>
            {widgets.map(({ id, render }) => (
              <div key={id}>{render(project)}</div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
