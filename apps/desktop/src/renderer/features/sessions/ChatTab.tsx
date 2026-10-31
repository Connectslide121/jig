import { ChartColumn, LogIn, MessageSquareX, MoreHorizontal, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { updateConfig, useConfig } from "../../stores/config";
import { Badge, Button, cn, Empty, IconButton, openMenuAt, Spinner } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { runAction, type TabProps, useRegistry } from "../../workbench/registry";
import { formatShortcut } from "../../workbench/shortcuts";
import { ChatDetailsDialog, ChatOverview } from "./ChatOverview";
import { BackgroundTasks, ChatWelcome, FindBar, TodoPanel } from "./ChatPanels";
import { Composer } from "./Composer";
import { ContextMeter } from "./ContextMeter";
import { fillComposer } from "./drafts";
import { renameSession, sessionMenu } from "./menus";
import { showProjectOf } from "./project";
import { STATUS_LABEL, StatusDot } from "./status";
import { ensureTranscript, markSeen, useSessions } from "./store";
import { formatTokens, Transcript } from "./Transcript";

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
  const [finding, setFinding] = useState(false);
  const [details, setDetails] = useState(false);
  const overview = useConfig((s) => s.config?.chat.overview ?? true);
  const [match, setMatch] = useState<string>();
  const onMatch = useCallback((m: string | undefined) => setMatch(m), []);
  useEffect(() => {
    if (id) void ensureTranscript(id).catch(() => {});
  }, [id]);
  // Bringing a chat to the front makes its project the active one (D-163): from the Chats list, a
  // tab, Home, a notification… Only when the chat comes to the front, so moving it to another project
  // or choosing a project while it stays open leaves the choice alone. A chat without a project
  // changes nothing.
  const known = Boolean(meta);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on coming to the front (and once the chat is known), not on every change of its project.
  useEffect(() => {
    if (focused) showProjectOf(meta?.projectId);
  }, [focused, id, known]);
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
  const tokens =
    meta.usage.inputTokens +
    meta.usage.cacheReadTokens +
    meta.usage.cacheWriteTokens +
    meta.usage.outputTokens;
  return (
    <div className="flex h-full flex-col" data-testid="chat">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
        <StatusDot status={meta.status} />
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
        {project && <span className="truncate text-xs text-muted">{project.name}</span>}
        {meta.kind === "builder" && <Badge tone="accent">Builder</Badge>}
        <span className="text-xs text-hint" data-testid="chat-status">
          {STATUS_LABEL[meta.status]}
        </span>
        <div className="flex-1" />
        <ContextMeter meta={meta} />
        {meta.authSource === "api_key" && <Badge tone="warning">API key billing</Badge>}
        {meta.turns > 0 && (
          <span
            className="whitespace-nowrap text-2xs text-hint"
            title="Tokens used in this chat, and Claude Code's cost estimate"
          >
            {formatTokens(tokens)} tokens{meta.costUsd > 0 ? ` · ≈ $${meta.costUsd.toFixed(2)}` : ""}
          </span>
        )}
        <ChatViewSwitch />
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
                onPick={(text) => fillComposer(id, text)}
              />
            ) : (
              <Transcript items={transcript.items} sessionId={id} active={active} highlight={match} />
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
          <Composer meta={meta} queue={transcript?.queue ?? []} active={Boolean(focused)} />
        </div>
        <div className="box-content w-52 shrink-0 pt-3 pr-3" data-testid="chat-overview-slot">
          {overview && transcript && transcript.items.length > 0 && (
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
