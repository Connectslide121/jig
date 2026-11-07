/**
 * A Telegram Bot API on 127.0.0.1 for e2e tests (Jig on your phone, D-350): records what Jig sends,
 * hands it what "the phone" writes and taps. Start Jig with `JIG_TELEGRAM_API` set to its `url`.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export const TOKEN = `123456789:${"A".repeat(35)}`;
export const ME = 42;

/** A Telegram Bot API on 127.0.0.1: records what Jig sends, hands it what "the phone" writes. */
export async function fakeTelegram(opts: { topics?: boolean } = {}) {
  let nextTopic = 900;
  const sent: Array<Record<string, unknown>> = [];
  const edits: Array<Record<string, unknown>> = [];
  const queue: Array<Record<string, unknown>> = [];
  const photos: number[] = [];
  const topics: Array<Record<string, unknown>> = [];
  const deleted: number[] = [];
  const voices: string[] = [];
  const captions = new Set<number>();
  let nextUpdate = 1;
  let nextMessage = 1;
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const method = req.url?.split("/").pop();
      if (req.url?.startsWith(`/file/bot${TOKEN}/`)) return res.end(Buffer.from("OggS fake voice"));
      if (method === "sendVoice" && req.url?.startsWith(`/bot${TOKEN}/`)) {
        voices.push(body);
        return res.end(JSON.stringify({ ok: true, result: { message_id: nextMessage++ } }));
      }
      if (method === "sendPhoto" && req.url?.startsWith(`/bot${TOKEN}/`)) {
        photos.push(body.length);
        // A captioned picture (a card with a screenshot) is a message too: its caption and buttons.
        const field = (name: string) =>
          new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`).exec(body)?.[1];
        const caption = field("caption");
        const markup = field("reply_markup");
        const message_id = nextMessage++;
        captions.add(message_id);
        if (caption)
          sent.push({
            text: caption,
            photo: true,
            message_id,
            ...(markup ? { reply_markup: JSON.parse(markup) } : {}),
          });
        return res.end(JSON.stringify({ ok: true, result: { message_id } }));
      }
      const params = body ? JSON.parse(body) : {};
      const reply = (result: unknown) => res.end(JSON.stringify({ ok: true, result }));
      if (!req.url?.startsWith(`/bot${TOKEN}/`)) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ ok: false, description: "Unauthorized" }));
      }
      if (method === "getMe")
        return reply({
          id: 1,
          is_bot: true,
          first_name: "Shop",
          username: "shop_bot",
          has_topics_enabled: opts.topics ?? false,
        });
      if (method === "getFile") return reply({ file_id: params.file_id, file_path: "voice/file_1.oga" });
      if (method === "createForumTopic") {
        topics.push(params);
        return reply({ message_thread_id: nextTopic++, name: params.name });
      }
      if (method === "deleteForumTopic") {
        deleted.push(params.message_thread_id);
        return reply(true);
      }
      if (method === "sendMessage") {
        const message_id = nextMessage++;
        sent.push({ ...params, message_id });
        return reply({ message_id });
      }
      if (method === "editMessageText") {
        if (captions.has(params.message_id)) {
          res.statusCode = 400;
          return res.end(
            JSON.stringify({
              ok: false,
              description: "Bad Request: there is no text in the message to edit",
            }),
          );
        }
        edits.push(params);
        return reply(true);
      }
      if (method === "editMessageCaption") {
        edits.push({ ...params, text: params.caption });
        return reply(true);
      }
      if (method === "getUpdates") {
        const ready = () => queue.filter((u) => (u.update_id as number) >= (params.offset ?? 0));
        for (let i = 0; i < 10 && !ready().length; i++) await new Promise((r) => setTimeout(r, 100));
        return reply(ready());
      }
      return reply(true);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const now = () => Math.floor(Date.now() / 1000);
  const from = { id: ME, is_bot: false, first_name: "Alex" };
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    sent,
    edits,
    photos,
    topics,
    deleted,
    voices,
    say: () =>
      queue.push({
        update_id: nextUpdate++,
        message: {
          message_id: 1000 + nextUpdate,
          date: now(),
          chat: { id: ME, type: "private" },
          from,
          voice: { file_id: "v1", duration: 2, mime_type: "audio/ogg" },
        },
      }),
    inThread: (thread: number) =>
      sent.filter((m) => m.message_thread_id === thread).map((m) => String(m.text)),
    texts: () => sent.map((m) => String(m.text)),
    write: (text: string, replyTo?: number, thread?: number) =>
      queue.push({
        update_id: nextUpdate++,
        message: {
          message_id: 1000 + nextUpdate,
          date: now(),
          chat: { id: ME, type: "private" },
          from,
          text,
          ...(thread ? { message_thread_id: thread, is_topic_message: true } : {}),
          ...(replyTo
            ? { reply_to_message: { message_id: replyTo, date: now(), chat: { id: ME, type: "private" } } }
            : {}),
        },
      }),
    tap: (data: string) => queue.push({ update_id: nextUpdate++, callback_query: { id: "cb", from, data } }),
    close: () => new Promise((r) => server.close(r)),
  };
}
