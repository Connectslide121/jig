import { ChevronDown, LogIn, MessageSquareX, MoreHorizontal } from "lucide-react";
import { useEffect } from "react";
import { PERMISSION_MODE_LABELS } from "../../../shared/engine";
import { Badge, Button, Empty, IconButton, openMenuAt, Spinner } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { runAction, type TabProps, useRegistry } from "../../workbench/registry";
import { Composer } from "./Composer";
import { modelLabel, modelMenu, permissionMenu, renameSession, sessionMenu } from "./menus";
import { STATUS_LABEL, StatusDot } from "./status";
import { ensureTranscript, useSessions } from "./store";
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
  useEffect(() => {
    if (id) void ensureTranscript(id).catch(() => {});
  }, [id]);
  if (!meta) return loaded ? <Empty icon={MessageSquareX} title="This session was deleted" /> : <Spinner />;
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
        {meta.authSource === "api_key" && <Badge tone="warning">API key billing</Badge>}
        {meta.turns > 0 && (
          <span
            className="text-2xs text-hint"
            title="Tokens used in this session, and Claude Code's cost estimate"
          >
            {formatTokens(tokens)} tokens{meta.costUsd > 0 ? ` · ≈ $${meta.costUsd.toFixed(2)}` : ""}
          </span>
        )}
        <button
          type="button"
          data-testid="model-menu"
          onClick={(e) => openMenuAt(e.currentTarget, modelMenu(meta), true)}
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
          icon={MoreHorizontal}
          label="Session options"
          size="sm"
          onClick={(e) => openMenuAt(e.currentTarget, sessionMenu(meta), true)}
        />
      </header>
      {meta.needsLogin && <LoginBanner />}
      {transcript ? (
        transcript.items.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-muted">
            <div>
              <div className="text-base font-medium text-fg">
                New session{project ? ` in ${project.name}` : ""}
              </div>
              <div className="mt-1">
                Claude Code runs in {meta.cwd} with your CLAUDE.md files, skills and MCP servers.
              </div>
            </div>
          </div>
        ) : (
          <Transcript items={transcript.items} sessionId={id} active={active} />
        )
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      )}
      <Composer meta={meta} queue={transcript?.queue ?? []} active={active} />
    </div>
  );
}
