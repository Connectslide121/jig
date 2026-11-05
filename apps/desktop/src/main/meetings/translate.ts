import { homedir } from "node:os";
import { aiChoice } from "../../shared/aiFeatures";
import type { MeetingCaption } from "../../shared/meetings";
import {
  batchPrompt,
  parseBatch,
  TRANSLATE_INSTRUCTIONS,
  takeBatch,
  type WaitingCaption,
} from "../../shared/translationQueue";
import { getConfig } from "../config";
import { getEngine } from "../engine";
import { type Completer, sessionEnv } from "../engine/types";
import { oneShot } from "../providers";

/**
 * Claude translates live captions when Teams can't (D-277): Teams' own translation needs Teams
 * Premium. Finished captions wait in a queue and go together, up to six per request, and ones that
 * waited over 20 s are skipped and left as spoken, so the translation stays live (D-384). With
 * Claude a request goes to one warm Claude Code process with no tools (the code completion's
 * `completer`), on a fast model; with ChatGPT picked in Settings → AI features (D-297) each request
 * is one `codex exec` call (no warm Codex process yet), slower, so more lines get skipped. Only
 * while you have picked a language, and only for the meeting you're in.
 */

export interface TranslatedCaption {
  meetingId: string;
  captionId: string;
  source: string;
  text: string;
  language: string;
}

export interface TranslatorEvents {
  translated(result: TranslatedCaption): Promise<void>;
  /** Captions that won't be translated: skipped to keep up, or the request failed or left them out. */
  untranslated(captions: WaitingCaption[], why: "skipped" | "failed"): Promise<void>;
  /** Said once per run of failures, not for every request. */
  failed(error: unknown): void;
}

export class CaptionTranslator {
  private completer?: { model: string; value: Completer };
  private waiting: WaitingCaption[] = [];
  private running = false;
  /** Bumped by `stop`: requests already sent are dropped when they answer. */
  private generation = 0;
  private failed = false;

  constructor(private readonly events: TranslatorEvents) {}

  /** Queues a finished caption; translations come back in the order captions were said. */
  translate(meetingId: string, caption: MeetingCaption, language: string): void {
    this.waiting.push({ meetingId, captionId: caption.id, text: caption.text, language, at: Date.now() });
    if (!this.running) void this.pump();
  }

  /** Stops translating: the language was cleared or the meeting ended. */
  stop(): void {
    this.generation++;
    this.waiting = [];
    this.failed = false;
    this.completer?.value.close();
    this.completer = undefined;
  }

  private async pump(): Promise<void> {
    this.running = true;
    try {
      while (this.waiting.length) {
        const generation = this.generation;
        const { batch, skipped } = takeBatch(this.waiting, Date.now());
        this.waiting = [];
        if (skipped.length) await this.events.untranslated(skipped, "skipped").catch(() => undefined);
        if (batch.length) await this.request(batch, generation);
      }
    } finally {
      this.running = false;
    }
  }

  private async request(batch: WaitingCaption[], generation: number): Promise<void> {
    try {
      const { provider, model } = aiChoice(getConfig(), "meetingTranslation");
      const prompt = batchPrompt(
        batch.map((b) => b.text),
        batch[0]!.language,
      );
      const answer =
        provider === "claude"
          ? await this.claude(model).ask(prompt)
          : await oneShot(provider, model, prompt, 60_000, {
              cwd: homedir(),
              system: TRANSLATE_INSTRUCTIONS,
            });
      if (generation !== this.generation) return;
      const texts = parseBatch(answer, batch.length);
      const missing = batch.filter((_, i) => !texts[i]);
      if (missing.length < batch.length) this.failed = false;
      for (const [i, b] of batch.entries()) {
        const text = texts[i];
        if (text)
          await this.events.translated({
            meetingId: b.meetingId,
            captionId: b.captionId,
            source: b.text,
            text,
            language: b.language,
          });
      }
      if (missing.length) await this.events.untranslated(missing, "failed");
    } catch (error) {
      if (generation !== this.generation) return;
      await this.events.untranslated(batch, "failed").catch(() => undefined);
      if (!this.failed) {
        this.failed = true;
        this.events.failed(error);
      }
    }
  }

  private claude(model: string): Completer {
    const { engine } = getConfig();
    if (this.completer?.model !== model) {
      this.completer?.value.close();
      this.completer = {
        model,
        value: getEngine().completer({
          cwd: homedir(),
          model,
          appendSystemPrompt: TRANSLATE_INSTRUCTIONS,
          env: sessionEnv(process.env, engine.allowApiKey),
          claudePath: engine.claudePath,
        }),
      };
    }
    return this.completer.value;
  }
}
