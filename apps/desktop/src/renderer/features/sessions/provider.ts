import {
  type ChatProvider,
  chatProvider,
  ENGINE_CAPABILITIES,
  type EngineCapabilities,
  type SessionMeta,
} from "../../../shared/engine";
import { useSessions } from "./store";

/** Who answers in a chat, in words ("Claude", "ChatGPT"): Codex chats run on your ChatGPT plan. */
export const CHAT_PROVIDER_NAMES: Record<ChatProvider, string> = { claude: "Claude", codex: "ChatGPT" };

/** What the chat's provider can do: controls it lacks are hidden, not shown dead (D-309). */
export const capabilitiesOf = (meta: Pick<SessionMeta, "provider">): EngineCapabilities =>
  ENGINE_CAPABILITIES[chatProvider(meta)];

export const providerName = (meta: Pick<SessionMeta, "provider">): string =>
  CHAT_PROVIDER_NAMES[chatProvider(meta)];

/** The same for a chat by id, for components that only know the id. */
export function useChatCapabilities(sessionId: string): EngineCapabilities {
  return useSessions((s) => ENGINE_CAPABILITIES[chatProvider(s.metas[sessionId] ?? {})]);
}

/**
 * A chat can still change provider while nothing has been sent (D-314): no turn, no queued message,
 * nothing in its transcript. After that it keeps its provider for life (D-309).
 */
export const canChangeProvider = (meta: SessionMeta, itemCount: number, queued: number): boolean =>
  !meta.kind && meta.turns === 0 && !meta.engineSessionId && itemCount === 0 && queued === 0;
