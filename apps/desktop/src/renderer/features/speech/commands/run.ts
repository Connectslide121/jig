import type { SessionMeta } from "../../../../shared/engine";
import { call } from "../../../lib/host";
import { useProjects } from "../../../workbench/projects";
import { workbench } from "../../../workbench/store";
import { newSession } from "../../sessions/actions";
import { ensureTranscript, useSessions } from "../../sessions/store";
import { speakableText } from "../speak";
import { VOICE_COMMANDS, VOICE_GROUPS } from "./grammar";
import { matchName, type ParsedCommand } from "./match";
import { useWakeVoice } from "./state";
import { requestTalk } from "./talk";

/** What Jig says after a command, and what it does next (D-278). */
export interface VoiceReply {
  say: string;
  /** Asks first: `question` is said, and `run` runs after a spoken yes. */
  confirm?: { question: string; run: () => Promise<VoiceReply> };
  /** Runs after Jig has said its answer (opening Talk mode, which takes the microphone). */
  after?: () => void;
  /** Jig waits for an answer without "Hey Jig". */
  listen?: boolean;
}

const addon = <T>(id: string, method: string, args?: unknown) =>
  call("addons.call", { id, method, args }) as Promise<T>;

const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function activeProject(): { id: string; name: string } | undefined {
  const { projects, activeId } = useProjects.getState();
  return projects.find((p) => p.id === activeId);
}

/** The project you named, or the active one. */
function projectFor(spoken: string | undefined): { id: string; name: string } | undefined | null {
  if (!spoken) return activeProject();
  return matchName(spoken, useProjects.getState().projects, (p) => p.name) ?? null;
}

const NO_PROJECT: VoiceReply = { say: "Pick a project first. Say: switch to, and its name." };
const unknownProject = (spoken: string): VoiceReply => ({ say: `I don't know a project called ${spoken}.` });

function chats(): SessionMeta[] {
  return Object.values(useSessions.getState().metas)
    .filter((m) => !m.archived && m.kind !== "builder")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function activeChat(): string | undefined {
  const tab = workbench.activeTab();
  return tab?.type === "jig.chat" && typeof tab.params.sessionId === "string"
    ? tab.params.sessionId
    : undefined;
}

function talkTo(meta: SessionMeta, say: string): VoiceReply {
  return {
    say,
    after: () => {
      workbench.openTab("jig.chat", { sessionId: meta.id });
      requestTalk(meta.id);
    },
  };
}

const chatName = (meta: SessionMeta) => meta.title || "your chat";

// ── Add-on data, typed as far as voice needs it ────────────────────────────

interface Pipeline {
  key: string;
  name: string;
  repoName: string;
  defaultBranch: string;
  params: Array<{ name: string; label: string; values: string[] }>;
}
interface Run {
  status: string;
  result: string;
  branch: string;
}
interface Repo {
  name: string;
  path: string;
  behind: number;
  dirty: boolean;
}
interface TestRun {
  label: string;
  status: string;
  passed: number;
  failed: number;
}

async function pipelinesFor(spoken: string | undefined): Promise<Pipeline[] | VoiceReply> {
  const found = await addon<{ pipelines: Pipeline[] }>("pipelines", "pipelines");
  if (!found.pipelines.length) return { say: "I didn't find any pipelines for your repositories." };
  if (!spoken) return found.pipelines;
  const repo = matchName(spoken, found.pipelines, (p) => p.repoName);
  if (repo) return found.pipelines.filter((p) => p.repoName === repo.repoName);
  const byName = matchName(spoken, found.pipelines, (p) => p.name);
  return byName ? [byName] : { say: `I didn't find a pipeline for ${spoken}.` };
}

function runState(run: Run | null | undefined): string {
  if (!run) return "hasn't run yet";
  if (run.status !== "completed") return `is running on ${run.branch}`;
  return run.result === "succeeded" ? "passed" : run.result === "canceled" ? "was cancelled" : "failed";
}

const ENV: Record<string, string[]> = {
  stage: ["stage", "staging", "test"],
  production: ["production", "prod", "live"],
};

/** The pipeline parameter that chooses where to deploy, and the value for `env` ("stage"…). */
function deployValue(pipeline: Pipeline, env: string): { name: string; value: string } | undefined {
  const words = Object.values(ENV).find((w) => w.includes(env)) ?? [env];
  for (const param of pipeline.params) {
    if (!/deploy|environment|\benv\b|target|stage/i.test(`${param.name} ${param.label}`)) continue;
    const value = param.values.find((v) => words.some((w) => v.toLowerCase().includes(w)));
    if (value) return { name: param.name, value };
  }
  return undefined;
}

async function reposFor(spoken: string | undefined): Promise<Repo[] | VoiceReply> {
  const repos = await addon<Repo[]>("repos", "overview");
  if (!spoken) {
    const project = activeProject();
    const mine = project ? repos.filter((r) => matchName(project.name, [r], (x) => x.name)) : [];
    return mine.length
      ? mine
      : repos.length === 1
        ? repos
        : { say: "Which repository? Say pull, and its name." };
  }
  const repo = matchName(spoken, repos, (r) => r.name);
  return repo ? [repo] : { say: `I don't know a repository called ${spoken}.` };
}

const isReply = (value: unknown): value is VoiceReply =>
  typeof value === "object" && value !== null && "say" in value && !Array.isArray(value);

/** Runs a command Jig understood and says how it went. Nothing here calls Claude. */
export async function runCommand({ command, slots }: ParsedCommand): Promise<VoiceReply> {
  switch (command.id) {
    // ── Chats ──
    case "chat.new": {
      const project = projectFor(slots.project);
      if (project === null) return unknownProject(slots.project!);
      if (!project) return NO_PROJECT;
      const id = await newSession(project.id);
      if (!id) return { say: "I couldn't start a chat." };
      return { say: `New chat in ${project.name}. Talk to Jig now.`, after: () => requestTalk(id) };
    }
    case "chat.continue": {
      const last = chats()[0];
      return last ? talkTo(last, `Back to ${chatName(last)}.`) : { say: "You have no chats yet." };
    }
    case "chat.open": {
      const meta = matchName(slots.chat ?? "", chats(), (m) => m.title, 0.5);
      return meta
        ? talkTo(meta, `Opening ${chatName(meta)}.`)
        : { say: `I didn't find a chat called ${slots.chat}.` };
    }
    case "chat.talk": {
      const id = activeChat();
      const meta = id ? useSessions.getState().metas[id] : undefined;
      return meta ? talkTo(meta, "Talk mode.") : { say: "No chat is open. Say: new chat." };
    }
    case "project.switch": {
      const project = projectFor(slots.project);
      if (!project) return unknownProject(slots.project ?? "");
      await call("projects.setActive", { id: project.id });
      return { say: `Switched to ${project.name}.` };
    }
    case "task.add": {
      const project = activeProject();
      if (!project) return NO_PROJECT;
      await addon("tasks", "add", { projectId: project.id, prompts: [slots.text], newChat: true });
      return { say: `Added to the ${project.name} task queue.` };
    }
    case "claude.ask": {
      const project = activeProject();
      if (!project) return NO_PROJECT;
      const id = await newSession(project.id);
      if (!id) return { say: "I couldn't start a chat." };
      return { say: "Asking Jig.", after: () => requestTalk(id, slots.text) };
    }
    // ── Checking in ──
    case "status.overview": {
      const all = chats();
      const working = all.filter((m) => m.status === "working" || m.status === "starting");
      const waiting = all.filter((m) => m.status === "needs_you");
      if (!working.length && !waiting.length) return { say: "All quiet. No chat is working." };
      const parts: string[] = [];
      if (working.length)
        parts.push(`${plural(working.length, "chat")} working: ${list(working.slice(0, 3).map(chatName))}`);
      if (waiting.length)
        parts.push(
          `${list(waiting.slice(0, 3).map(chatName))} ${waiting.length === 1 ? "needs" : "need"} you`,
        );
      return { say: `${parts.join(". ")}.` };
    }
    case "status.lastAnswer": {
      const id = activeChat() ?? chats()[0]?.id;
      if (!id) return { say: "You have no chats yet." };
      await ensureTranscript(id);
      const items = useSessions.getState().transcripts[id]?.items ?? [];
      const last = [...items].reverse().find((i) => i.kind === "assistant" && !i.streaming);
      if (last?.kind !== "assistant") return { say: "Jig hasn't answered in that chat yet." };
      return { say: speakableText(last.text) || "Its last answer is only code. Look at the screen for it." };
    }
    case "status.tasks": {
      const project = activeProject();
      if (!project) return NO_PROJECT;
      const queue = await addon<{ tasks: Array<{ status: string; title: string }>; running?: boolean }>(
        "tasks",
        "list",
        { projectId: project.id },
      );
      const left = queue.tasks.filter((t) => t.status === "queued" || t.status === "running");
      if (!left.length) return { say: `The ${project.name} queue is empty.` };
      const now = queue.tasks.find((t) => t.status === "running");
      return {
        say: `${plural(left.length, "task")} left in ${project.name}.${now ? ` Working on: ${now.title}.` : queue.running ? "" : " The queue is paused."}`,
      };
    }
    case "status.tests": {
      const project = activeProject();
      if (!project) return NO_PROJECT;
      const repos = await addon<Array<{ path: string; name: string }>>("tests", "suites", {
        projectId: project.id,
      });
      const lines: string[] = [];
      for (const repo of repos) {
        const last = (await addon<TestRun[]>("tests", "history", { repo: repo.path }))[0];
        if (!last) continue;
        lines.push(
          last.status === "running"
            ? `${last.label} is running`
            : last.status === "passed"
              ? `${last.label} passed`
              : `${last.label} ${last.status}, ${plural(last.failed, "failure")}`,
        );
      }
      return { say: lines.length ? `${lines.slice(0, 4).join(". ")}.` : "No tests have run here yet." };
    }
    case "status.pipeline": {
      const found = await pipelinesFor(slots.repo ?? activeProject()?.name);
      if (isReply(found)) return found;
      const { runs } = await addon<{ runs: Record<string, Run | null> }>("pipelines", "latest", {
        keys: found.slice(0, 5).map((p) => p.key),
      });
      return {
        say: `${found
          .slice(0, 5)
          .map((p) => `${p.name} ${runState(runs[p.key])}`)
          .join(". ")}.`,
      };
    }
    // ── Running things ──
    case "run.tests": {
      const project = activeProject();
      if (!project) return NO_PROJECT;
      const repos = await addon<Array<{ path: string; name: string; suites: Array<{ id: string }> }>>(
        "tests",
        "suites",
        { projectId: project.id },
      );
      const repo = slots.repo
        ? matchName(slots.repo, repos, (r) => r.name)
        : repos.find((r) => r.suites.length);
      const suite = repo?.suites[0];
      if (!repo || !suite)
        return {
          say: slots.repo ? `I didn't find tests in ${slots.repo}.` : "I didn't find any tests here.",
        };
      await addon("tests", "run", { repo: repo.path, suiteId: suite.id });
      return { say: `Running the tests in ${repo.name}. Ask me later: did the tests pass.` };
    }
    case "run.deploy": {
      const found = await pipelinesFor(slots.repo);
      if (isReply(found)) return found;
      const env = slots.env ?? "stage";
      const target = found.map((p) => ({ p, value: deployValue(p, env) })).find((x) => x.value);
      if (!target?.value) return { say: `I didn't find a pipeline that deploys ${slots.repo} to ${env}.` };
      const { p, value } = target;
      return {
        say: "",
        confirm: {
          question: `Run ${p.name} on ${p.defaultBranch} with ${value.value}? Say yes to start.`,
          run: async () => {
            const run = await addon<{ number: string }>("pipelines", "queue", {
              key: p.key,
              branch: p.defaultBranch,
              values: { [value.name]: value.value },
            });
            return { say: `Started ${p.name}, run ${run.number}.` };
          },
        },
      };
    }
    case "repo.pull":
    case "repo.fetch": {
      const found = await reposFor(slots.repo);
      if (isReply(found)) return found;
      const names = list(found.map((r) => r.name));
      if (command.id === "repo.fetch") {
        for (const repo of found) await addon("repos", "fetch", { path: repo.path });
        return { say: `Fetched ${names}.` };
      }
      const dirty = found.filter((r) => r.dirty).map((r) => r.name);
      return {
        say: "",
        confirm: {
          question: `Pull ${names}?${dirty.length ? ` ${list(dirty)} ${dirty.length === 1 ? "has" : "have"} changes you haven't committed.` : ""} Say yes to pull.`,
          run: async () => {
            for (const repo of found) await addon("repos", "pull", { path: repo.path });
            return { say: `Pulled ${names}.` };
          },
        },
      };
    }
    case "run.workflow": {
      const project = activeProject();
      if (!project) return NO_PROJECT;
      const workflows = await addon<Array<{ id: string; name: string }>>("workflows", "list", {
        projectId: project.id,
      });
      const workflow = matchName(slots.workflow ?? "", workflows, (w) => w.name, 0.5);
      if (!workflow) return { say: `I didn't find a workflow called ${slots.workflow}.` };
      const result = await addon<string>("workflows", "toolRun", {
        chat: { projectId: project.id },
        workflow: workflow.id,
      });
      const first =
        String(result ?? "")
          .split("\n")
          .find((l) => l.trim()) ?? "";
      return { say: `${workflow.name}: ${speakableText(first) || "done"}.` };
    }
    case "run.script": {
      const project = activeProject();
      if (!project) return NO_PROJECT;
      const { scripts, groups } = await call("scripts.list", { projectId: project.id });
      const group = matchName(slots.script ?? "", groups, (g) => g.name);
      if (group) {
        await call("scripts.runGroup", { projectId: project.id, groupId: group.id });
        return { say: `Started ${group.name}.` };
      }
      const script = matchName(slots.script ?? "", scripts, (s) => s.name);
      if (!script) return { say: `I didn't find a script called ${slots.script}.` };
      await call("scripts.run", { projectId: project.id, scriptId: script.id });
      return { say: `Started ${script.name}.` };
    }
    // ── Jig itself ──
    case "note.save": {
      const project = activeProject();
      if (!project) return NO_PROJECT;
      await addon("notes", "add", { projectId: project.id, text: slots.text });
      return { say: `Saved in the ${project.name} notes.` };
    }
    case "voice.mute":
      useWakeVoice.setState({ muted: true });
      return { say: "" };
    case "voice.unmute":
      useWakeVoice.setState({ muted: false });
      return { say: "I'm back." };
    case "voice.help":
      return {
        say: VOICE_GROUPS.map(
          (g) =>
            `${g.title}: ${list(
              VOICE_COMMANDS.filter((c) => c.group === g.id).map((c) =>
                c.say[0]!.replace("<text>", "something").replace(
                  /<(\w+)>/g,
                  (_, w: string) => `a ${w === "repo" ? "repository" : w}`,
                ),
              ),
            )}.`,
        ).join(" "),
      };
    default:
      return { say: "I know that one, but I can't do it yet." };
  }
}
