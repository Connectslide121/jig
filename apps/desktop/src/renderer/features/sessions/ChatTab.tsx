import { ChevronDown, LogIn, MessageSquareX, MoreHorizontal, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PERMISSION_MODE_LABELS } from "../../../shared/engine";
import { Badge, Button, Empty, IconButton, openMenuAt, Spinner } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { runAction, type TabProps, useRegistry } from "../../workbench/registry";
import { UsageRing } from "../usage";
import { BackgroundTasks, ChatWelcome, FindBar, TodoPanel } from "./ChatPanels";
import { Composer } from "./Composer";
import { ContextMeter } from "./ContextMeter";
import { fillComposer } from "./drafts";
import { modelLabel, openModelMenu, permissionMenu, renameSession, sessionMenu } from "./menus";
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

export function ChatTab({ params, active }: TabProps) {
  const id = String(params.sessionId ?? "");
  const meta = useSessions((s) => s.metas[id]);
  const transcript = useSessions((s) => s.transcripts[id]);
  const loaded = useSessions((s) => s.loaded);
  const project = useProjects((s) => s.projects.find((p) => p.id === meta?.projectId));
  const [finding, setFinding] = useState(false);
  const [match, setMatch] = useState<string>();
  const onMatch = useCallback((m: string | undefined) => setMatch(m), []);
  useEffect(() => {
    if (id) void ensureTranscript(id).catch(() => {});
  }, [id]);
  // What you have seen: the tab's dot shows a finished turn you haven't looked at yet.
  useEffect(() => {
    if (active && meta) markSeen(id, meta.turns);
  }, [active, id, meta?.turns, meta]);
  // Ctrl+F finds in the chat that is showing.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFinding(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
  if (!meta) return loaded ? <Empty icon={MessageSquareX} title="This chat was deleted" /> : <Spinner />;
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
          title="Double-click to rename"
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
        {meta.authSource !== "api_key" && <UsageRing />}
        {meta.turns > 0 && (
          <span
            className="text-2xs text-hint"
            title="Tokens used in this chat, and Claude Code's cost estimate"
          >
            {formatTokens(tokens)} tokens{meta.costUsd > 0 ? ` · ≈ $${meta.costUsd.toFixed(2)}` : ""}
          </span>
        )}
        <button
          type="button"
          data-testid="model-menu"
          onClick={(e) => void openModelMenu(e.currentTarget, meta)}
          className="flex h-6 items-center gap-1 rounded-md px-2 text-xs text-muted hover:bg-hover hover:text-fg"
          title={meta.activeModel ? `Claude Code reports: ${meta.activeModel}` : undefined}
        >
          {modelLabel(meta)} <ChevronDown className="size-3" />
        </button>
        <button
          type="button"
          data-testid="permission-menu"
          onClick={(e) => openMenuAt(e.currentTarget, permissionMenu(meta), true)}
          className="flex h-6 items-center gap-1 rounded-md px-2 text-xs text-muted hover:bg-hover hover:text-fg"
        >
          {PERMISSION_MODE_LABELS[meta.permissionMode]} <ChevronDown className="size-3" />
        </button>
        <IconButton
          icon={Search}
          label="Find in this chat (Ctrl+F)"
          size="sm"
          data-testid="find-open"
          onClick={() => setFinding(true)}
        />
        <IconButton
          icon={MoreHorizontal}
          label="Chat options"
          size="sm"
          onClick={(e) => openMenuAt(e.currentTarget, sessionMenu(meta), true)}
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
      <Composer meta={meta} queue={transcript?.queue ?? []} active={active} />
    </div>
  );
}
