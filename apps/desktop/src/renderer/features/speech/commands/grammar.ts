/**
 * "Hey Jig" voice commands (D-278): what Jig understands on its own, without Claude. The same list
 * drives the matcher, the Voice commands page and "what can I say", so they never disagree.
 */

export type VoiceGroup = "chats" | "status" | "run" | "jig";

export const VOICE_GROUPS: Array<{ id: VoiceGroup; title: string; lead: string }> = [
  {
    id: "chats",
    title: "Chats",
    lead: "Open, switch and talk to chats. A chat opened by voice starts in Talk mode.",
  },
  {
    id: "status",
    title: "Checking in",
    lead: "Jig answers from what it already knows; nothing is sent to an AI provider.",
  },
  { id: "run", title: "Running things", lead: "Runs tests, scripts, workflows and pipelines directly." },
  { id: "jig", title: "Jig itself", lead: "The voice itself: notes, volume and listening." },
];

/** The names a command can take, filled from your own projects, chats, workflows and so on. */
export type VoiceSlot = "project" | "chat" | "repo" | "script" | "workflow" | "env" | "text";

export interface VoiceCommand {
  id: string;
  group: VoiceGroup;
  /** What it does, for the page ("Start a new chat"). */
  title: string;
  /** How to say it, for the page and "what can I say"; `<project>` marks a name. */
  say: string[];
  /** Tried in order on the cleaned words; named groups are the slots. */
  patterns: RegExp[];
  /** Read back and run only after a spoken "yes" (deploys, pulls). */
  confirm?: boolean;
}

const r = (source: string) => new RegExp(`^${source}$`);

/** In order: the first command whose pattern matches wins, so the specific ones come first. */
export const VOICE_COMMANDS: VoiceCommand[] = [
  // Chats
  {
    id: "chat.new",
    group: "chats",
    title: "Start a new chat",
    say: ["new chat", "new chat in <project>"],
    patterns: [
      r(
        "(?:open |start |make |create )?(?:a )?new chat(?: (?:in|for|on) (?:the )?(?<project>.+?)(?: project)?)?",
      ),
      r("(?:start|open) a chat (?:in|for|on) (?:the )?(?<project>.+?)(?: project)?"),
    ],
  },
  {
    id: "chat.continue",
    group: "chats",
    title: "Continue your last chat",
    say: ["continue my last chat", "back to my last chat"],
    patterns: [r("(?:continue|resume|open|back to|go back to) (?:my |the )?(?:last|latest|previous) chat")],
  },
  {
    id: "chat.talk",
    group: "chats",
    title: "Talk mode in the open chat",
    say: ["talk mode", "talk to this chat"],
    patterns: [
      r("(?:start )?(?:talk|speech|voice) mode"),
      r("talk to (?:this|the open) chat"),
      r("start talking"),
    ],
  },
  {
    id: "chat.open",
    group: "chats",
    title: "Talk to a chat",
    say: ["talk to <chat>", "open chat <chat>"],
    patterns: [
      r("talk to (?:the )?(?<chat>.+?)(?: chat)?"),
      r("open (?:the )?(?<chat>.+?) chat"),
      r("open chat (?<chat>.+)"),
    ],
  },
  {
    id: "project.switch",
    group: "chats",
    title: "Switch project",
    say: ["switch to <project>"],
    patterns: [r("(?:switch|go|change) to (?!sleep$)(?:the )?(?<project>.+?)(?: project)?")],
  },
  {
    id: "task.add",
    group: "chats",
    title: "Add a task to the queue",
    say: ["add a task <text>"],
    patterns: [r("(?:add|queue|put) (?:a )?task(?: to the queue)?(?: to| that says| saying)? (?<text>.+)")],
  },
  {
    id: "claude.ask",
    group: "chats",
    title: "Ask Claude (uses your plan)",
    say: ["ask Claude <text>"],
    patterns: [r("(?:ask|tell) claude(?: to| if| whether| about)? (?<text>.+)")],
  },
  // Checking in
  {
    id: "status.overview",
    group: "status",
    title: "What's happening",
    say: ["what's happening", "which chats are working"],
    patterns: [
      r("what is (?:happening|going on|up)"),
      r("(?:status|status update|give me an update|any news)"),
      r("(?:which|what) chats are (?:working|running|busy)"),
      r("is (?:anything|something|claude) (?:working|running)"),
    ],
  },
  {
    id: "status.lastAnswer",
    group: "status",
    title: "Read the last answer",
    say: ["read me the last answer", "what did Claude say"],
    patterns: [
      r("read (?:me )?(?:the )?(?:last|latest) (?:answer|reply|message|response)"),
      r("what did claude (?:say|answer|reply)"),
    ],
  },
  {
    id: "status.tasks",
    group: "status",
    title: "The task queue",
    say: ["what's in the queue"],
    patterns: [r("what is (?:in|on) (?:the )?(?:task )?queue"), r("how is the (?:task )?queue(?: going)?")],
  },
  {
    id: "status.tests",
    group: "status",
    title: "Test results",
    say: ["did the tests pass"],
    patterns: [
      r("(?:did|have) the tests (?:pass|passed|fail|failed|finish|finished)"),
      r("how are the tests(?: going)?"),
      r("test results"),
    ],
  },
  {
    id: "status.pipeline",
    group: "status",
    title: "Pipeline status",
    say: ["how's the pipeline", "how's the pipeline for <repo>"],
    patterns: [
      r(
        "how is the (?:pipeline|build|deploy|deployment)(?: (?:for|of|in) (?:the )?(?<repo>.+?))?(?: going)?",
      ),
      r("(?:did the (?:pipeline|build|deploy) (?:pass|finish|fail))(?: (?:for|of|in) (?:the )?(?<repo>.+))?"),
      r("pipeline status(?: (?:for|of) (?<repo>.+))?"),
    ],
  },
  // Running things
  {
    id: "run.tests",
    group: "run",
    title: "Run the tests",
    say: ["run the tests", "run the tests in <repo>"],
    patterns: [r("run (?:the |all )?tests(?: (?:in|for|of) (?:the )?(?<repo>.+?))?")],
  },
  {
    id: "run.deploy",
    group: "run",
    title: "Deploy",
    say: ["deploy <repo> to stage", "deploy <repo> to production"],
    patterns: [r("deploy (?:the )?(?<repo>.+?) to (?:the )?(?<env>stage|staging|test|production|prod|live)")],
    confirm: true,
  },
  {
    id: "repo.pull",
    group: "run",
    title: "Pull the latest changes",
    say: ["pull <repo>", "pull the latest changes"],
    patterns: [
      r("pull (?:the )?(?:latest )?(?:changes)?(?: (?:in|for|of) (?:the )?(?<repo>.+?))?"),
      r("pull (?:the )?(?<repo>.+?)"),
    ],
    confirm: true,
  },
  {
    id: "repo.fetch",
    group: "run",
    title: "Fetch",
    say: ["fetch <repo>", "fetch everything"],
    patterns: [r("fetch (?:all|everything|all repos(?:itories)?)?"), r("fetch (?:the )?(?<repo>.+?)")],
  },
  {
    id: "run.workflow",
    group: "run",
    title: "Run a workflow",
    say: ["run <workflow>", "run the <workflow> workflow"],
    patterns: [r("run (?:the |my )?(?<workflow>.+?)(?: workflow)?")],
  },
  {
    id: "run.script",
    group: "run",
    title: "Start a script",
    say: ["start <script>", "start local"],
    patterns: [r("start (?:the |my )?(?<script>.+?)(?: script)?")],
  },
  // Jig itself
  {
    id: "note.save",
    group: "jig",
    title: "Save a project note",
    say: ["save a note <text>"],
    patterns: [
      r("(?:save|add|make|take|write) (?:a )?note(?: that| saying| to say)? (?<text>.+)"),
      r("remember that (?<text>.+)"),
    ],
  },
  {
    id: "voice.mute",
    group: "jig",
    title: "Mute Jig's voice",
    say: ["mute", "be quiet"],
    patterns: [r("(?:mute|be quiet|quiet|silence|shut up)(?: please)?")],
  },
  {
    id: "voice.unmute",
    group: "jig",
    title: "Unmute",
    say: ["unmute"],
    patterns: [r("(?:unmute|un mute|speak again|talk again)")],
  },
  {
    id: "voice.repeat",
    group: "jig",
    title: "Repeat that",
    say: ["repeat that", "say that again"],
    patterns: [r("(?:repeat(?: that)?|say (?:that|it) again|what did you say|pardon|sorry what)")],
  },
  {
    id: "voice.sleep",
    group: "jig",
    title: "Stop listening",
    say: ["stop listening"],
    patterns: [r("(?:stop listening|go to sleep|sleep|turn off (?:the )?(?:mic|microphone|listening))")],
  },
  {
    id: "voice.help",
    group: "jig",
    title: "What can I say",
    say: ["what can I say"],
    patterns: [r("(?:what can i (?:say|do|ask)|what can you do|help|list (?:the )?commands)")],
  },
];
