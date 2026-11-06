import { ChartColumn, ChevronDown, Clock, LogIn, MessageSquareX, MoreHorizontal, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { chatProvider, type SessionMeta } from "../../../shared/engine";
import type { ProjectInfo } from "../../../shared/projects";
import { updateConfig, useConfig } from "../../stores/config";
import { Badge, Button, cn, Empty, IconButton, openMenuAt, Spinner } from "../../ui";
import { MOTION_MS } from "../../ui/motion";
import { useProjects } from "../../workbench/projects";
import { runAction, type TabProps, useRegistry } from "../../workbench/registry";
import { formatShortcut } from "../../workbench/shortcuts";
import { TenantTagLabel } from "../azure/TenantTag";
import { ProjectSwatch } from "../projects/colors";
import { ChatChanges } from "./ChatChanges";
import { ChatDetailsDialog, ChatOverview } from "./ChatOverview";
import { BackgroundTasks, ChatWelcome, FindBar, TodoPanel } from "./ChatPanels";
import { Composer } from "./Composer";
import { ContextMeter } from "./ContextMeter";
import { fillComposer } from "./drafts";
import { resetTime } from "./LimitCard";
import { renameSession, sessionMenu } from "./menus";
import { canChangeProject, showProjectOf, switchChatProject } from "./project";
import { ChatIcon, STATUS_LABEL } from "./status";
import { holdTranscript, markSeen, useSessions } from "./store";
import { Transcript } from "./Transcript";

function LoginBanner() {
  const canOpen = useRegistry((s) => Boolean(s.actions["jig.claudeLogin"]));
  return (
    <div
      className="mx-6 mt-3 flex items-center gap-3 rounded-lg border border-warning bg-warning-soft p-3 text-sm"
      data-testid="login-banner"
    >
      <LogIn className="size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-fg">Claude Code isn't signed in</div>
        <div className="text-xs text-muted">
          Run <code className="font-mono">claude</code> in a terminal and type{" "}
          <code className="font-mono">/login</code>. You sign in with Anthropic directly — Jig never sees your
          login. Then send your message again.
        </div>
      </div>
      {canOpen && (
        <Button size="sm" variant="primary" onClick={() => runAction("jig.claudeLogin")}>
          Open terminal
        </Button>
      )}
    </div>
  );
}

export function ChatTab({ params, active, focused }: TabProps) {
  const id = String(params.sessionId ?? "");
  const meta = useSessions((s) => s.metas[id]);
  const transcript = useSessions((s) => s.transcripts[id]);
  const loaded = useSessions((s) => s.loaded);
  const project = useProjects((s) => s.projects.find((p) => p.id === meta?.projectId));
  const activeProjectId = useProjects((s) => s.activeId);
  const [finding, setFinding] = useState(false);
  const [details, setDetails] = useState(false);
  const overview = useConfig((s) => s.config?.chat.overview ?? true);
  const times = useConfig((s) => s.config?.chat.times ?? false);
  const showOverview = overview && Boolean(transcript?.items.length);
  // Keep the card mounted while its column slides shut, then drop it.
  const [overviewMounted, setOverviewMounted] = useState(showOverview);
  useEffect(() => {
    if (showOverview) {
      setOverviewMounted(true);
      return;
    }
    const t = setTimeout(() => setOverviewMounted(false), MOTION_MS);
    return () => clearTimeout(t);
  }, [showOverview]);
  const [match, setMatch] = useState<string>();
  const onMatch = useCallback((m: string | undefined) => setMatch(m), []);
  // The open tab keeps its chat's transcript loaded; closed, it may be let go (D-366).
  useEffect(() => (id ? holdTranscript(id) : undefined), [id]);
  // Bringing a chat to the front makes its project the active one (D-163): from the Chats list, a
  // tab, Home, a notification… Only when the chat comes to the front, so moving it to another project
  // or choosing a project while it stays open leaves the choice alone. A chat without a project
  // changes nothing.
  const known = Boolean(meta);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on coming to the front (and once the chat is known), not on every change of its project.
  useEffect(() => {
    if (focused) showProjectOf(meta?.projectId);
  }, [focused, id, known]);
  // A new chat nobody has written in yet follows the project you pick in the top bar (D-341), when it
  // is the one in front. Only a change of the active project moves it: bringing the chat to the front
  // makes its own project the active one (above), which never moves anything.
  const canMove = meta
    ? canChangeProject(meta, transcript?.items.length ?? 0, transcript?.queue.length ?? 0)
    : false;
  const lastActive = useRef(activeProjectId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on a change of the active project only.
  useEffect(() => {
    const was = lastActive.current;
    lastActive.current = activeProjectId;
    if (!focused || !canMove || !activeProjectId || was === activeProjectId) return;
    if (meta?.projectId !== activeProjectId) void switchChatProject(id, activeProjectId);
  }, [activeProjectId]);
  // What you have seen: the tab's dot shows a finished turn you haven't looked at yet.
  useEffect(() => {
    if (active && meta) markSeen(id, meta.turns);
  }, [active, id, meta?.turns, meta]);
  // Ctrl+F finds in the chat you're working in.
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFinding(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);
  if (!meta)
    return loaded ? <Empty icon={MessageSquareX} title="This chat was deleted" /> : <Spinner center />;
  return (
    <div className="flex h-full flex-col" data-testid="chat" data-panel="chat">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
        <ChatIcon meta={meta} />
        <button
          type="button"
          className="min-w-0 truncate text-sm font-medium hover:underline"
          onDoubleClick={() => void renameSession(meta)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "F2") void renameSession(meta);
          }}
          title="Double-click (or Enter) to rename"
        >
          {meta.title}
        </button>
        {project && <ChatProject meta={meta} project={project} canMove={canMove} />}
        {meta.kind === "builder" && <Badge tone="accent">Builder</Badge>}
        <span className="min-w-0 truncate text-xs text-hint" data-testid="chat-status">
          {meta.limit?.state === "waiting" && meta.limit.resetsAt
            ? `Waiting for the limit · resumes ${resetTime(meta.limit.resetsAt)}`
            : meta.limit
              ? "Limit reached"
              : STATUS_LABEL[meta.status]}
        </span>
        {/* The spacer is the tenant label's slot: it appears at its right end and nothing moves. */}
        <div className="flex min-w-0 flex-1 justify-end">
          <TenantTagLabel tag={meta.azureTenant} />
        </div>
        <ContextMeter meta={meta} />
        {meta.authSource === "api_key" && <Badge tone="warning">API key billing</Badge>}
        <ChatViewSwitch />
        <IconButton
          icon={Clock}
          label={times ? "Hide the times" : "Show the time of every message and step"}
          size="sm"
          active={times}
          aria-pressed={times}
          data-testid="chat-times-toggle"
          onClick={() => void updateConfig({ chat: { times: !times } })}
        />
        <IconButton
          icon={ChartColumn}
          label={overview ? "Hide the chat overview" : "Show the chat overview"}
          size="sm"
          active={overview}
          aria-pressed={overview}
          data-testid="chat-overview-toggle"
          onClick={() => void updateConfig({ chat: { overview: !overview } })}
        />
        <IconButton
          icon={Search}
          label={`Find in this chat (${formatShortcut("Mod+F")})`}
          size="sm"
          data-testid="find-open"
          onClick={() => setFinding(true)}
        />
        <IconButton
          icon={MoreHorizontal}
          label="Chat options"
          size="sm"
          onClick={(e) =>
            openMenuAt(
              e.currentTarget,
              [
                {
                  label: "Chat overview…",
                  icon: ChartColumn,
                  onSelect: () => setDetails(true),
                  testId: "session-overview",
                },
                ...sessionMenu(meta),
              ],
              true,
            )
          }
        />
      </header>
      {finding && transcript && (
        <FindBar
          items={transcript.items}
          onMatch={onMatch}
          onClose={() => {
            setFinding(false);
            setMatch(undefined);
          }}
        />
      )}
      {meta.needsLogin && <LoginBanner />}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col" data-testid="chat-conversation">
          {transcript ? (
            transcript.items.length === 0 ? (
              <ChatWelcome
                title={`New chat${project ? ` in ${project.name}` : ""}`}
                cwd={meta.cwd}
                starters={project?.starters}
                provider={chatProvider(meta)}
                onPick={(text) => fillComposer(id, text)}
              />
            ) : (
              <Transcript
                items={transcript.items}
                sessionId={id}
                active={active}
                highlight={match}
                working={meta.status === "working"}
              />
            )
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          )}
          <div className="flex shrink-0 flex-col gap-1.5 pt-1.5 empty:hidden">
            {transcript && <TodoPanel items={transcript.items} />}
            <BackgroundTasks meta={meta} />
          </div>
          <ChatChanges key={id} meta={meta} items={transcript?.items ?? []} />
          <Composer
            meta={meta}
            queue={transcript?.queue ?? []}
            parked={transcript?.parked ?? []}
            active={Boolean(focused)}
          />
        </div>
        <div
          className={cn("jig-side-slide box-content shrink-0 pt-3", showOverview ? "w-52 pr-3" : "w-0 pr-0")}
          aria-hidden={!showOverview}
          inert={!showOverview}
          data-testid="chat-overview-slot"
        >
          {transcript && overviewMounted && (
            <ChatOverview meta={meta} items={transcript.items} onDetails={() => setDetails(true)} />
          )}
        </div>
      </div>
      <ChatDetailsDialog
        meta={meta}
        items={transcript?.items ?? []}
        open={details}
        onClose={() => setDetails(false)}
      />
    </div>
  );
}

/**
 * The chat's project beside its title. Until the first message it is a picker that moves the chat
 * to another project (D-341); afterwards the same box as plain text, its chevron slot kept empty, so
 * nothing beside it moves when the chat starts.
 */
function ChatProject({
  meta,
  project,
  canMove,
}: {
  meta: SessionMeta;
  project: ProjectInfo;
  canMove: boolean;
}) {
  const content = (
    <>
      <ProjectSwatch color={project.color} />
      <span className="truncate">{project.name}</span>
      <ChevronDown className={cn("size-3.5 shrink-0 text-muted", !canMove && "invisible")} />
    </>
  );
  const box = "flex h-7 min-w-0 shrink items-center gap-1.5 rounded-md px-1.5 text-xs text-muted";
  if (!canMove)
    return (
      <span className={box} data-testid="chat-project">
        {content}
      </span>
    );
  const pick = (at: HTMLElement) => {
    const { projects } = useProjects.getState();
    openMenuAt(at, [
      { heading: "Start this chat in" },
      ...projects.map((p) => ({
        label: p.name,
        checked: p.id === meta.projectId,
        leading: <ProjectSwatch color={p.color} />,
        testId: `chat-project-item-${p.name}`,
        onSelect: () => {
          if (p.id === meta.projectId) return;
          // The chat in front decides the active project (D-163): the top bar follows it.
          void switchChatProject(meta.id, p.id).then((moved) => moved && showProjectOf(p.id));
        },
      })),
    ]);
  };
  return (
    <button
      type="button"
      aria-haspopup="menu"
      className={cn(box, "hover:bg-hover hover:text-fg")}
      title="Start this chat in another project: its folder, model and permissions follow"
      data-testid="chat-project"
      onClick={(e) => pick(e.currentTarget)}
    >
      {content}
    </button>
  );
}

/** Compact or Detailed: how chats show Claude's work (D-159), for every chat. */
function ChatViewSwitch() {
  const view = useConfig((s) => s.config?.chat.view ?? "compact");
  return (
    <div
      className="flex items-center rounded-md border border-line p-0.5"
      role="group"
      aria-label="Chat view"
    >
      {(
        [
          { value: "compact", label: "Compact", title: "Each run of steps folds into one line" },
          {
            value: "detailed",
            label: "Detailed",
            title: "Every command, read, edit and thought as its card",
          },
        ] as const
      ).map((m) => (
        <button
          key={m.value}
          type="button"
          aria-pressed={view === m.value}
          title={m.title}
          data-testid={`chat-view-${m.value}`}
          onClick={() => void updateConfig({ chat: { view: m.value } })}
          className={cn(
            "h-5 rounded-sm px-1.5 text-2xs",
            view === m.value ? "bg-active text-fg" : "text-muted hover:text-fg",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
