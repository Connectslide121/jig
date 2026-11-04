import { useChatGptStatus } from "../stores/providers";

/**
 * Whether ChatGPT can run chats now (the Codex CLI installed and signed in, D-330), for an add-on that
 * offers it: undefined while Jig asks, then `ready` and a line saying why not. Asked again after a
 * sign-in on Get Started.
 */
export function useChatGptReady(): { ready: boolean; detail: string } | undefined {
  const status = useChatGptStatus();
  return status && { ready: status.ready, detail: status.detail };
}
