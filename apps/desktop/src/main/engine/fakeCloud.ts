import type { ToolCallRequest, ToolCallResult } from "./toolCall";

/**
 * The fake engine's stand-in for Claude Code's cloud tools: two routines and two artifacts that the
 * RemoteTrigger and Artifact tools list, run, toggle and read. Shapes follow what those tools return.
 */
interface FakeRoutine {
  id: string;
  name: string;
  cron_expression: string;
  enabled: boolean;
  next_run_at: string;
  created_at: string;
  job_config: { ccr: { events: Array<{ data: { message: { content: string } } }> } };
  last_run?: { status: string; fired_at: string; session_id: string };
}

const at = (ms: number) => new Date(Date.now() + ms).toISOString();

function routines(): FakeRoutine[] {
  return [
    {
      id: "trig_fake_morning",
      name: "Morning PR review",
      cron_expression: "CRON_TZ=Europe/Stockholm 37 8 * * 1-5",
      enabled: true,
      next_run_at: at(14 * 3_600_000),
      created_at: at(-9 * 86_400_000),
      job_config: {
        ccr: {
          events: [
            { data: { message: { content: "Review my open pull requests and summarise what needs me." } } },
          ],
        },
      },
      last_run: { status: "SUCCEEDED", fired_at: at(-10 * 3_600_000), session_id: "session_fake_run1" },
    },
    {
      id: "trig_fake_deps",
      name: "Weekly dependency check",
      cron_expression: "0 6 * * 1",
      enabled: false,
      next_run_at: at(4 * 86_400_000),
      created_at: at(-30 * 86_400_000),
      job_config: {
        ccr: {
          events: [{ data: { message: { content: "Check for outdated npm packages and open a PR." } } }],
        },
      },
    },
  ];
}

export class FakeCloud {
  private triggers = routines();
  private runs = new Map<
    string,
    Array<{ session_id: string; status: string; fired_at: string; finished_at?: string }>
  >([
    [
      "trig_fake_morning",
      [
        {
          session_id: "session_fake_run1",
          status: "SUCCEEDED",
          fired_at: at(-10 * 3_600_000),
          finished_at: at(-9.9 * 3_600_000),
        },
      ],
    ],
  ]);

  call(request: ToolCallRequest): ToolCallResult {
    if (request.tool === "RemoteTrigger") return this.remoteTrigger(request.input);
    if (request.tool === "Artifact") return this.artifact(request.input);
    return { ok: false, text: `No such tool: ${request.tool}` };
  }

  private reply(status: number, body: unknown): ToolCallResult {
    const json = JSON.stringify(body);
    return { ok: status < 400, text: json, structured: { status, json } };
  }

  private remoteTrigger(input: Record<string, unknown>): ToolCallResult {
    const id = input.trigger_id as string | undefined;
    const trigger = this.triggers.find((t) => t.id === id);
    switch (input.action) {
      case "list":
        return this.reply(200, { data: this.triggers });
      case "create": {
        const body = (input.body ?? {}) as Partial<FakeRoutine> & { prompt?: string };
        const trigger: FakeRoutine = {
          id: `trig_fake_${this.triggers.length + 1}`,
          name: body.name ?? "New routine",
          cron_expression: body.cron_expression ?? "0 9 * * 1-5",
          enabled: true,
          next_run_at: at(86_400_000),
          created_at: at(0),
          job_config: { ccr: { events: [{ data: { message: { content: body.prompt ?? "" } } }] } },
        };
        this.triggers.push(trigger);
        return this.reply(200, trigger);
      }
      case "get":
        return trigger ? this.reply(200, trigger) : this.reply(404, { error: "not found" });
      case "run": {
        if (!trigger) return this.reply(404, { error: "not found" });
        const run = { session_id: `session_fake_${Date.now()}`, status: "RUNNING", fired_at: at(0) };
        this.runs.set(trigger.id, [run, ...(this.runs.get(trigger.id) ?? [])]);
        trigger.last_run = { status: "RUNNING", fired_at: run.fired_at, session_id: run.session_id };
        return this.reply(200, { session_id: run.session_id });
      }
      case "update": {
        if (!trigger) return this.reply(404, { error: "not found" });
        const body = (input.body ?? {}) as Partial<FakeRoutine>;
        Object.assign(trigger, body);
        return this.reply(200, trigger);
      }
      case "list_runs":
        return this.reply(200, { data: this.runs.get(id ?? "") ?? [] });
      case "get_run_log": {
        const owner = [...this.runs.entries()].find(([, runs]) =>
          runs.some((r) => r.session_id === input.session_id),
        )?.[0];
        const ran = this.triggers.find((t) => t.id === owner);
        return this.reply(200, {
          data: [
            {
              type: "user",
              text: ran?.job_config.ccr.events[0]?.data.message.content ?? "The routine's prompt",
            },
            {
              type: "assistant",
              text: "Two pull requests need your review: #41 (checkout) and #44 (tests).",
            },
          ],
        });
      }
      default:
        return this.reply(400, { error: `unsupported action ${String(input.action)}` });
    }
  }

  private artifact(input: Record<string, unknown>): ToolCallResult {
    const list = [
      {
        title: "Release notes",
        url: "https://claude.ai/artifact/fakeReleaseNotes",
        updatedAt: at(-86_400_000),
        rel: "mine",
      },
      {
        title: "Sprint dashboard",
        url: "https://claude.ai/artifact/fakeSprintBoard",
        updatedAt: at(-3 * 86_400_000),
        rel: "mine",
      },
    ];
    if (input.action === "list")
      return {
        ok: true,
        text: list.map((a) => `${a.title} ${a.url}`).join("\n"),
        structured: { artifacts: list },
      };
    if (input.action === "read") {
      const found = list.find((a) => a.url === input.url);
      if (!found) return { ok: false, text: "Not found" };
      const result = `<title>${found.title}</title><style>body{font-family:sans-serif;padding:24px}</style><h1>${found.title}</h1><p>Read from claude.ai by the fake engine.</p>`;
      return {
        ok: true,
        text: result,
        structured: {
          read: {
            url: found.url,
            bytes: result.length,
            code: 200,
            codeText: "OK",
            result,
            durationMs: 5,
            title: found.title,
          },
        },
      };
    }
    return { ok: false, text: `unsupported action ${String(input.action)}` };
  }
}
