import { CloudDownload, ExternalLink, Eye, LayoutTemplate, MessageSquare, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ChatArtifact, RemoteArtifact } from "../../../shared/artifacts";
import { call, errorMessage } from "../../lib/host";
import { Badge, Button, Empty, IconButton, Spinner } from "../../ui";
import type { TabProps } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { openArtifactOnline, openLocalArtifact, openRemoteArtifact } from "./actions";

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

function Row({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover" data-testid="artifact-row">
      <LayoutTemplate className="size-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-fg">{title}</div>
        <div className="truncate text-2xs text-muted">{detail}</div>
      </div>
      {children}
    </div>
  );
}

/**
 * Artifacts: the pages Claude publishes to claude.ai. The ones your chats published open from their
 * local page; the rest of your claude.ai artifacts load on request (Claude Code lists and reads them,
 * a small model call each, D-092).
 */
export function ArtifactsTab({ active }: TabProps) {
  const [fromChats, setFromChats] = useState<ChatArtifact[]>();
  const [remote, setRemote] = useState<{ at: string; artifacts: RemoteArtifact[] }>();
  const [remoteError, setRemoteError] = useState<string>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (active) void call("artifacts.fromChats").then(setFromChats);
  }, [active]);
  const loadRemote = useCallback((refresh = false) => {
    setLoading(true);
    setRemoteError(undefined);
    void call("artifacts.list", { refresh })
      .then(setRemote)
      .catch((e) => setRemoteError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);
  const fromChatUrls = new Set(fromChats?.map((a) => a.url));
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto" data-testid="artifacts">
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
        <LayoutTemplate className="size-4 text-accent" />
        <span className="text-sm font-semibold text-fg">Artifacts</span>
        <span className="text-xs text-hint">Pages Claude published to claude.ai</span>
      </header>
      <div className="mx-auto flex w-full max-w-[var(--jig-chat-width)] flex-col gap-6 p-4">
        <section className="flex flex-col gap-1">
          <div className="text-2xs font-semibold tracking-wide text-hint uppercase">From your chats</div>
          {!fromChats && <Spinner size="sm" />}
          {fromChats?.length === 0 && (
            <div className="text-xs text-muted">
              None yet. When Claude publishes a page in a chat (Claude Code's Artifact tool), it shows up
              here.
            </div>
          )}
          {fromChats?.map((a) => (
            <Row key={a.url} title={a.title} detail={`${a.chatTitle} · ${when(a.at)}`}>
              {a.path ? (
                <IconButton
                  icon={Eye}
                  size="sm"
                  label="Open in Jig"
                  onClick={() => openLocalArtifact(a.path!)}
                />
              ) : (
                <IconButton
                  icon={Eye}
                  size="sm"
                  label="Open in Jig"
                  onClick={() => void openRemoteArtifact(a.url, a.title)}
                />
              )}
              <IconButton
                icon={MessageSquare}
                size="sm"
                label="Open the chat"
                onClick={() => workbench.openTab("jig.chat", { sessionId: a.sessionId })}
              />
              <IconButton
                icon={ExternalLink}
                size="sm"
                label="Open on claude.ai"
                onClick={() => openArtifactOnline(a.url)}
              />
            </Row>
          ))}
        </section>
        <section className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-2xs font-semibold tracking-wide text-hint uppercase">
            On claude.ai
            {remote && (
              <IconButton icon={RefreshCw} size="sm" label="Refresh" onClick={() => loadRemote(true)} />
            )}
          </div>
          {!remote && !remoteError && (
            <div className="flex flex-col items-start gap-2 text-xs text-muted">
              Every artifact on your account, including ones made on claude.ai or shared with you. Claude Code
              lists them for Jig (a small model call on your plan).
              <Button
                size="sm"
                icon={CloudDownload}
                busy={loading}
                onClick={() => loadRemote()}
                data-testid="artifacts-load"
              >
                Load from claude.ai
              </Button>
            </div>
          )}
          {remoteError && (
            <Empty title="Couldn't list your artifacts">
              {remoteError} Artifacts need Claude Code signed in with your Claude subscription.
            </Empty>
          )}
          {remote?.artifacts.length === 0 && (
            <div className="text-xs text-muted">No artifacts on your account.</div>
          )}
          {remote?.artifacts.map((a) => (
            <Row
              key={a.url}
              title={a.title}
              detail={[when(a.updatedAt), fromChatUrls.has(a.url) ? "from a Jig chat" : ""]
                .filter(Boolean)
                .join(" · ")}
            >
              {a.shared && <Badge>shared with you</Badge>}
              <IconButton
                icon={Eye}
                size="sm"
                label="Open in Jig"
                data-testid="artifact-open"
                onClick={() => void openRemoteArtifact(a.url, a.title)}
              />
              <IconButton
                icon={ExternalLink}
                size="sm"
                label="Open on claude.ai"
                onClick={() => openArtifactOnline(a.url)}
              />
            </Row>
          ))}
        </section>
      </div>
    </div>
  );
}
