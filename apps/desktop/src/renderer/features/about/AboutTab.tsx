import { type AddonManifest, MANIFEST_KEY, SLOTS, type SlotId } from "@jig/sdk";
import {
  BookOpen,
  ChevronDown,
  Eye,
  FileCode,
  FolderGit2,
  FolderPlus,
  Gauge,
  GitBranch,
  Globe,
  Keyboard,
  Lightbulb,
  ListChecks,
  type LucideIcon,
  MessageSquare,
  Palette,
  Puzzle,
  Settings2,
  Sparkles,
  Split,
  SquareTerminal,
  Tag,
  UserRound,
  Wand2,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SkillInfo } from "../../../shared/about";
import { PROTECTED_SETTINGS } from "../../../shared/config";
import { useAddons } from "../../addons/loader";
import { call } from "../../lib/host";
import { Badge, Button, Card, CodeBlock, cn, JigLogo, Kbd } from "../../ui";
import { addProject, openSettings } from "../../workbench/actions";
import { Pane } from "../../workbench/Pane";
import { useProjects } from "../../workbench/projects";
import { runAction, type TabProps, useRegistry } from "../../workbench/registry";
import { formatShortcut } from "../../workbench/shortcuts";
import { workbench } from "../../workbench/store";
import { openBuildDialog } from "../builder/BuildDialog";
import { newSession } from "../sessions/actions";
import { BUILD_EXAMPLES, CONFIGURE_EXAMPLES, CONFIGURE_TOOLS, SLOT_EXAMPLES } from "./content";
import browserShot from "./shots/browser.jpg";
import build from "./shots/build.jpg";
import chat from "./shots/chat.jpg";
import configure from "./shots/configure.jpg";
import dashboard from "./shots/dashboard.jpg";
import filesShot from "./shots/files.jpg";
import git from "./shots/git.jpg";
import knowledgeShot from "./shots/knowledge.jpg";
import releasesShot from "./shots/releases.jpg";
import settings from "./shots/settings.jpg";
import suggestions from "./shots/suggestions.jpg";
import usage from "./shots/usage.jpg";
import workflowsShot from "./shots/workflows.jpg";

const SECTIONS: Array<{ id: string; title: string; icon: LucideIcon }> = [
  { id: "overview", title: "Overview", icon: BookOpen },
  { id: "chats", title: "Chats", icon: MessageSquare },
  { id: "workspaces", title: "Projects & workspaces", icon: FolderGit2 },
  { id: "claude-extras", title: "Claude around your work", icon: Sparkles },
  { id: "attempts", title: "Try several ways", icon: Split },
  { id: "browser", title: "Claude's browser", icon: Globe },
  { id: "files", title: "Files & editing", icon: FileCode },
  { id: "previews", title: "Previews", icon: Eye },
  { id: "git", title: "Git", icon: GitBranch },
  { id: "releases", title: "Releases", icon: Tag },
  { id: "terminals", title: "Terminals & scripts", icon: SquareTerminal },
  { id: "configure", title: "Claude configures Jig", icon: Settings2 },
  { id: "build", title: "Build your own tools", icon: Wand2 },
  { id: "slots", title: "Extension slots", icon: Puzzle },
  { id: "addons", title: "Your add-ons", icon: Puzzle },
  { id: "skills", title: "Skills & Claude Code", icon: Sparkles },
  { id: "appearance", title: "Themes & icons", icon: Palette },
  { id: "learning", title: "Suggestions", icon: Lightbulb },
  { id: "workflows", title: "Workflows", icon: ListChecks },
  { id: "knowledge", title: "What Jig knows about me", icon: UserRound },
  { id: "usage", title: "Plan usage", icon: Gauge },
  { id: "shortcuts", title: "Keyboard shortcuts", icon: Keyboard },
];

/** Which slots a manifest uses (a context menu counts for its own slot only). */
export function slotsUsed(manifest: AddonManifest | undefined): Set<SlotId> {
  const used = new Set<SlotId>();
  if (!manifest) return used;
  const c = manifest.contributes as Record<string, unknown>;
  for (const slot of Object.keys(SLOTS) as SlotId[]) {
    const value = c[MANIFEST_KEY[slot]];
    if (slot.startsWith("context.")) {
      if (manifest.contributes.menus.some((m) => m.slot === slot)) used.add(slot);
    } else if (Array.isArray(value) ? value.length > 0 : value !== undefined) used.add(slot);
  }
  return used;
}

function tryInChat(text: string): void {
  void newSession(undefined, undefined, text);
}

/** A screenshot; click it to see it as large as the window allows. */
function Shot({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Click to enlarge"
        className="block w-full cursor-zoom-in overflow-hidden rounded-lg border border-line bg-canvas shadow-popover transition-opacity hover:opacity-90"
      >
        <img src={src} alt={alt} className="block w-full" loading="lazy" />
      </button>
      {open &&
        createPortal(
          <button
            type="button"
            aria-label="Close"
            data-testid="about-lightbox"
            onClick={() => setOpen(false)}
            className="no-drag fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-scrim p-6 backdrop-blur-sm"
          >
            <img
              src={src}
              alt={alt}
              className="max-h-full max-w-full rounded-lg border border-line shadow-popover"
            />
          </button>,
          document.body,
        )}
    </>
  );
}

function Section({
  id,
  title,
  lead,
  shot,
  children,
}: {
  id: string;
  title: string;
  lead: ReactNode;
  shot?: { src: string; alt: string };
  children?: ReactNode;
}) {
  const icon = SECTIONS.find((s) => s.id === id)?.icon ?? BookOpen;
  const Icon = icon;
  return (
    <section
      id={`about-${id}`}
      data-section={id}
      className="scroll-mt-4 border-t border-line py-8 first:border-t-0"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Icon className="size-4" />
        </span>
        {title}
      </h2>
      <div className="mt-2 max-w-2xl text-sm text-muted">{lead}</div>
      {shot && (
        <div className="mt-4">
          <Shot {...shot} />
        </div>
      )}
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="grid gap-x-6 gap-y-1.5 text-sm text-fg sm:grid-cols-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <Card className="p-3">
      <div className="text-2xl font-semibold text-fg">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </Card>
  );
}

function Overview() {
  const projects = useProjects((s) => s.projects);
  const addons = useAddons((s) => s.addons);
  const repos = projects.reduce((n, p) => n + (p.repos?.length ?? 0), 0);
  return (
    <section id="about-overview" data-section="overview" className="pb-8">
      <div className="flex gap-6 rounded-xl border border-line bg-accent-soft p-6">
        <div className="min-w-0 flex-1">
          <div className="text-2xs font-semibold tracking-wide text-accent uppercase">What Jig can do</div>
          <h1 className="mt-1 text-2xl font-semibold text-fg">Your workbench around Claude Code</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Chats with the real Claude Code, all your repositories, git, terminals and scripts in one window —
            and tools you build yourself by asking for them. Claude can even change Jig's settings for you.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {projects.length === 0 && (
              <Button
                variant="primary"
                icon={FolderPlus}
                onClick={() => void addProject()}
                data-testid="about-add-project"
              >
                Add project…
              </Button>
            )}
            <Button
              variant={projects.length ? "primary" : "secondary"}
              icon={MessageSquare}
              disabled={projects.length === 0}
              onClick={() => void newSession()}
            >
              New chat
            </Button>
            <Button
              icon={Wand2}
              onClick={() => openBuildDialog({ goal: "", origin: "tools" })}
              data-testid="about-build"
            >
              Build something…
            </Button>
            <Button variant="ghost" onClick={() => void workbench.openTab("jig.setup")}>
              Check your setup
            </Button>
          </div>
        </div>
        <JigLogo variant="icon" className="size-20" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="about-stats">
        <Stat value={projects.length} label={`projects · ${repos} repos`} />
        <Stat value={addons.filter((a) => a.enabled).length} label="add-ons on" />
        <Stat value={Object.keys(SLOTS).length} label="extension slots" />
        <Stat value={CONFIGURE_TOOLS.length} label="tools Claude gets for Jig" />
      </div>
    </section>
  );
}

function BuildLevels() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {BUILD_EXAMPLES.map((level, i) => (
        <Card key={level.level} className="flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <Badge tone="accent">{i + 1}</Badge>
            <span className="text-sm font-medium text-fg">{level.level}</span>
          </div>
          <div className="text-xs text-muted">{level.what}</div>
          <div className="mt-auto flex flex-col gap-1.5 pt-1">
            {level.goals.map((goal) => (
              <button
                key={goal}
                type="button"
                data-testid="about-build-example"
                onClick={() => openBuildDialog({ goal, origin: "tools" })}
                className="rounded-md border border-line bg-surface px-2 py-1 text-left text-xs text-fg hover:border-accent hover:bg-hover"
              >
                <Wand2 className="mr-1 inline size-3 text-accent" />
                {goal}
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function SlotGrid() {
  const addons = useAddons((s) => s.addons);
  const [open, setOpen] = useState<SlotId>();
  const users = (slot: SlotId) => addons.filter((a) => slotsUsed(a.manifest).has(slot));
  return (
    <div className="grid gap-2 md:grid-cols-2" data-testid="about-slots">
      {(Object.keys(SLOTS) as SlotId[]).map((slot) => {
        const using = users(slot);
        const expanded = open === slot;
        return (
          <Card
            key={slot}
            className={cn("p-0", expanded && "md:col-span-2")}
            data-testid={`about-slot-${slot}`}
          >
            <button
              type="button"
              className="flex w-full items-start gap-2 p-3 text-left hover:bg-hover"
              onClick={() => setOpen(expanded ? undefined : slot)}
              aria-expanded={expanded}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs text-accent">{slot}</code>
                  {using.length > 0 && <Badge tone="success">{using.length} in use</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-muted">{SLOTS[slot]}</div>
              </div>
              <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-hint", expanded && "rotate-180")} />
            </button>
            {expanded && (
              <div className="flex flex-col gap-2 border-t border-line p-3">
                <div className="text-xs text-fg">
                  <span className="text-muted">Good for: </span>
                  {SLOT_EXAMPLES[slot].idea}
                </div>
                <div className="text-xs text-muted">
                  In <code className="font-mono">addon.json</code> under{" "}
                  <code className="font-mono">contributes.{MANIFEST_KEY[slot]}</code>:
                </div>
                <CodeBlock code={SLOT_EXAMPLES[slot].snippet} lang="json" />
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {using.length ? (
                    <>
                      Used by
                      {using.map((a) => (
                        <Badge key={a.id}>{a.name}</Badge>
                      ))}
                    </>
                  ) : (
                    "None of your add-ons uses it yet."
                  )}
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    icon={Wand2}
                    onClick={() =>
                      openBuildDialog({
                        goal: `Something in the ${slot} slot: ${SLOT_EXAMPLES[slot].idea}`,
                        origin: "tools",
                      })
                    }
                  >
                    Build something here
                  </Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function AddonList() {
  const addons = useAddons((s) => s.addons);
  return (
    <div className="grid gap-2 md:grid-cols-2" data-testid="about-addons">
      {addons.map((a) => (
        <Card key={a.id} className="flex flex-col gap-1.5 p-3">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{a.name}</span>
            <Badge tone={a.source === "user" ? "accent" : "neutral"}>
              {a.source === "user" ? "yours" : "built-in"}
            </Badge>
            {!a.enabled && <Badge tone="warning">off</Badge>}
          </div>
          {a.manifest?.description && <div className="text-xs text-muted">{a.manifest.description}</div>}
          <div className="flex flex-wrap gap-1">
            {[...slotsUsed(a.manifest)].map((slot) => (
              <code key={slot} className="rounded-sm bg-surface px-1 font-mono text-2xs text-hint">
                {slot}
              </code>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ConfigureExamples() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 md:grid-cols-2">
        {CONFIGURE_EXAMPLES.map((text) => (
          <div
            key={text}
            className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2"
          >
            <span className="min-w-0 flex-1 text-sm text-fg">“{text}”</span>
            <Button size="sm" data-testid="about-try" onClick={() => tryInChat(text)}>
              Try in a chat
            </Button>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted">The tools Claude gets in every chat</div>
        <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
          {CONFIGURE_TOOLS.map((t) => (
            <div key={t.name} className="flex gap-2 text-xs">
              <code className="shrink-0 font-mono text-accent">{t.name}</code>
              <span className="text-muted">{t.what}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 text-xs text-muted">
          Reading is automatic; every change shows a card in the chat with <b>Undo</b>. Settings that decide
          billing or run programs (
          {PROTECTED_SETTINGS.map((p) => (
            <code key={p} className="mr-1 font-mono">
              {p}
            </code>
          ))}
          ) always ask you first.
        </div>
      </div>
    </div>
  );
}

function Skills() {
  const [skills, setSkills] = useState<SkillInfo[]>();
  const activeId = useProjects((s) => s.activeId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload for the new active project.
  useEffect(() => {
    let current = true;
    void call("about.skills")
      .then((s) => current && setSkills(s))
      .catch(() => current && setSkills([]));
    return () => {
      current = false;
    };
  }, [activeId]);
  return (
    <div className="flex flex-col gap-3" data-testid="about-skills">
      <Bullets
        items={[
          <>
            <b>CLAUDE.md</b> files of the project and your home folder are read as usual
          </>,
          <>
            <b>Skills</b> in <code className="font-mono">~/.claude/skills</code> and the project's{" "}
            <code className="font-mono">.claude/skills</code>
          </>,
          <>
            <b>MCP servers</b> and <b>plugins</b> you set up for Claude Code
          </>,
          <>
            <b>Your subscription</b> — you sign in to Claude Code yourself; Jig never sees your login
          </>,
        ]}
      />
      {skills === undefined ? null : skills.length === 0 ? (
        <div className="text-xs text-muted">
          No skills found yet. Ask Claude in a chat to write one for you.
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {skills.map((s) => (
            <Card key={`${s.scope}:${s.name}`} className="p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-fg">{s.name}</span>
                <Badge tone={s.scope === "project" ? "info" : "neutral"}>
                  {s.scope === "project" ? "project" : "yours"}
                </Badge>
              </div>
              {s.description && <div className="mt-1 text-xs text-muted">{s.description}</div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Shortcuts() {
  const actions = useRegistry((s) => s.actions);
  const list = Object.values(actions)
    .filter((a) => a.shortcut)
    .sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title));
  return (
    <div className="grid gap-x-6 gap-y-1 md:grid-cols-2" data-testid="about-shortcuts">
      {list.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => runAction(a.id)}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-hover"
        >
          <span className="min-w-0 flex-1 truncate text-fg">{a.title}</span>
          <Kbd>{formatShortcut(a.shortcut!)}</Kbd>
        </button>
      ))}
    </div>
  );
}

/** Highlights the section in view in the left list. */
function useScrollSpy(root: React.RefObject<HTMLDivElement | null>): string {
  const [current, setCurrent] = useState("overview");
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const update = () => {
      const top = el.getBoundingClientRect().top + 80;
      let best = "overview";
      for (const s of el.querySelectorAll<HTMLElement>("[data-section]"))
        if (s.getBoundingClientRect().top <= top) best = s.dataset.section!;
      setCurrent(best);
    };
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [root]);
  return current;
}

export function AboutTab({ params }: TabProps) {
  return <AboutPage section={typeof params.section === "string" ? params.section : undefined} />;
}

/** The page, as a tab or as the main area's welcome screen when no tab is open (`welcome`). */
export function AboutPage({ section, welcome }: { section?: string; welcome?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const current = useScrollSpy(scroller);
  const go = (id: string) =>
    scroller.current?.querySelector(`#about-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  // Opened at a section (e.g. from Settings → About).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the requested section changes.
  useEffect(() => {
    if (section) go(section);
  }, [section]);

  return (
    <div className="flex h-full" data-testid={welcome ? "main-empty" : "about"}>
      <Pane
        id="jig.about.nav"
        edge="right"
        defaultSize={200}
        min={150}
        max={320}
        label="Resize the section list"
      >
        <nav className="h-full overflow-y-auto border-r border-line bg-surface p-2">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              data-testid={`about-nav-${s.id}`}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
                current === s.id ? "bg-active text-fg" : "text-muted hover:bg-hover hover:text-fg",
              )}
            >
              <s.icon className="size-4 shrink-0" />
              <span className="truncate">{s.title}</span>
            </button>
          ))}
        </nav>
      </Pane>
      <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-6">
          <Overview />
          <Section
            id="chats"
            title="Chats"
            lead="Each chat is a real Claude Code session in a project, with your CLAUDE.md, skills, MCP servers and subscription. Run several at once; Jig shows which one needs you."
            shot={{ src: chat, alt: "A chat with a tool call and the composer" }}
          >
            <Bullets
              items={[
                "Paste screenshots, drop PDFs, Word, Excel and PowerPoint files",
                "Permission cards: allow once, always, or deny",
                "Queue messages while Claude works",
                "Model and permission mode per chat",
                "Tool calls with diffs and file previews",
                "Compact chats: each run of Claude's steps folds into one line; Detailed shows every card",
                "Your plan usage as bars in the status bar, always visible",
                "How full the context window is, with a breakdown on hover and Compact on click",
                "Claude Code's suggestion for your next message: click it, or Tab in the empty box",
                "Restore files to before any of your messages, and fork a chat to try another approach",
                "Open a chat you had in Claude Code (terminal, desktop app, IDE) and continue it here as a copy",
                "/ for Claude Code's commands and skills, @ for files, ! for shell commands, # to remember in CLAUDE.md",
                "↑ for earlier messages, Shift+Tab for modes, Ctrl+Enter to send while Claude works",
                "Todo lists, plans to approve, diffs on every edit, subagent progress and background tasks",
                "Edit and send again: rewind the chat (and the files) to before any message",
                "After a turn that changed files: Review, Walk me through or Undo, right there",
                "Tabs show a dot when a chat works, needs you or finished while you were elsewhere",
                "Claude Code's models with effort levels, MCP servers, extra folders, Find (Ctrl+F) and Export",
              ]}
            />
          </Section>
          <Section
            id="workspaces"
            title="Projects & workspaces"
            lead="Projects are yours: groups of chats with a default folder, a default Git repository, model and permission defaults, instructions for Claude and starter prompts. Workspaces are the folders Jig knows — a single repository or a whole folder of them."
            shot={{ src: dashboard, alt: "The dashboard of a workspace with four repositories" }}
          >
            <Bullets
              items={[
                "Drag chats between projects; pin the ones you keep coming back to",
                "Instructions per project, added to what Claude reads in its chats",
                "One Home per project with its starter prompts, recent chats and scripts",
                "A default repo per project for the Git view, others shown next to it when needed",
                "Files: the project's tree with git colours, a filter and Preview on click",
                "Links per project in your groups (Stage, Prod…): Azure resources, sites, Azure DevOps — or pick them from Azure",
                "Start a chat in any repo from its menu",
                "Repos overview with branch and changes",
              ]}
            />
          </Section>
          <Section
            id="claude-extras"
            title="Claude around your work"
            lead="Claude helps outside the chat too: tours of your changes, checks before you commit, a standup written from what you actually did, and tools made from things you did by hand."
          >
            <Bullets
              items={[
                "Walk me through the changes: steps in a sensible order, each next to its diff",
                "Check before committing: secrets, debug output, unfinished code",
                "Write: a commit message in your repository's style",
                "Turn this chat into a tool: the builder makes it a one-click tool",
                "Write my standup: Done / Next / Blockers from commits and chats",
                "Ask Claude about a failed script or any previewed file",
                "Routines (Tools → Routines): your Claude Code routines with their schedules, runs and logs; Run now, on/off, or ask Claude to make one",
                "Artifacts: pages Claude publishes open in Jig's Preview, from a chat or from your claude.ai account",
              ]}
            />
          </Section>
          <Section
            id="attempts"
            title="Try several ways"
            lead="Hand the same task to 2–4 Claude Code chats at once, each in its own git worktree and from a different angle: simplest, cleanest, most thorough, unconventional. Compare what they did, let Claude judge, and keep the best one in your working copy."
          >
            <Bullets
              items={[
                "The split button in the message box, or Tools → Try a task several ways…",
                "Live progress and changed files per attempt, with diffs",
                "Let Claude judge: a recommendation with strengths and weaknesses",
                "Keep this one applies it uncommitted and removes the rest",
              ]}
            />
          </Section>
          <Section
            id="browser"
            title="Claude's browser"
            lead="Claude checks its own web work in a real browser inside Jig: it opens your dev server, reads the page, clicks and types like a person, takes screenshots at phone, tablet and desktop sizes (they show in the chat) and reads the console. The page runs off-screen at its own size, so nothing pops up and the panel's size never limits Claude; the Claude's browser view shows it live, and you can take over with your mouse and keyboard."
            shot={{
              src: browserShot,
              alt: "Claude checking a shop page in its browser, with a screenshot in the chat",
            }}
          >
            <Bullets
              items={[
                "Ask a chat to “open the app and check the login form”",
                "Settings → Claude Code: Opus plans and Sonnet executes by default; change chat, subagent fallback, helper and tester models there",
                "Testing runs on a small model: chats hand it to the jig-tester helper (Haiku), and Tools → Test something… (or the flask in the browser view) starts a test chat on it",
                "Screenshots come back to Claude and show as thumbnails in the chat",
                "Console errors are counted in the view, and Claude reads them too",
                "Desktop, tablet and phone sizes for responsive checks",
                "Its own cookies and storage, apart from Jig; downloads and camera/location requests are refused",
              ]}
            />
          </Section>
          <Section
            id="files"
            title="Files & editing"
            lead="The project's files as a tree in the left sidebar (Ctrl+Shift+E), with git colours and a filter. Click a file to open it: code and text are editable right there, in your theme's colours, and Ctrl+S saves. Put two tabs side by side to read one while you edit the other."
            shot={{
              src: filesShot,
              alt: "The file tree, a file being edited and a Markdown preview beside it",
            }}
          >
            <Bullets
              items={[
                "Live: the tree follows changes on disk, from you or Claude",
                "If Claude changes a file you are editing, Jig asks: keep yours, load theirs, or see the diff",
                "Split view: right-click a tab → Open to the side, or drag it to the right edge",
                "Right-click a file to open it in VS Code or ask Claude about it",
              ]}
            />
          </Section>
          <Section
            id="previews"
            title="Previews"
            lead="Files open the way they're meant to be read: Markdown with Mermaid diagrams, HTML pages (sandboxed), PDFs, CSV and Excel as tables, JSON as a tree, notebooks, images, audio, video, Word and PowerPoint text, and highlighted code. A preview follows the file while Claude edits it."
          >
            <Bullets
              items={[
                "Right-click a file in Git → Preview, or the eye on a chat tool card",
                "Links between Markdown files open their preview",
                "Preview / Source switch, and Ask Claude about the file",
                "Two tabs side by side: right-click a tab → Open to the side, or drag it to the right edge",
                "Code and text files are editable right there: Ctrl+S saves, and Jig asks if Claude changed the file meanwhile",
                "A real editor: your theme's code colours, indentation guides, closing brackets, several cursors, folding, find and replace, go to line (Ctrl+G), word wrap and a status line (Settings → Editor)",
                "Markdown previews render safe embedded HTML, including centered headings and sized local images",
                "Tools → Preview a file… for anything else",
              ]}
            />
          </Section>
          <Section
            id="git"
            title="Git"
            lead="The repository you work in, plus any you show next to it (or all of them), with Repos below for every repository at a glance: stage, commit, push, pull, branches, history and diffs — side by side or inline, with image diffs. It updates live as files change and fetches in the background, so ahead/behind stays current. Write asks Claude for the commit message; right-click a file or repository to have Claude explain or review the changes. Click a line number in a diff to leave a review comment, then send them all to a chat."
            shot={{ src: git, alt: "The Git view with changes in several repositories" }}
          />
          <Section
            id="releases"
            title="Releases"
            shot={{
              src: releasesShot,
              alt: "A repository's release policy, its unreleased commits and a release drafted with Claude",
            }}
            lead="Versions, changelogs and release notes per repository, by rules you set once: Claude looks at the repository and proposes a release policy (or adopts the versioning you already have), saved in the repo so your team shares it. Then Jig keeps you at it, quietly and without AI: what's unreleased, deploys without a version, reminders. Releasing is one action."
          >
            <Bullets
              items={[
                "Planned releases, continuous (every prod deploy is a release) or not tracked — per repository",
                "Draft with Claude: the bump with a reason, the changelog and notes for each audience and language",
                "One action: version file, changelog, commit, tag and push, after you've seen every step",
                "What's live per environment, from pipeline runs or a Deployed button",
                "Git's Write follows the repository's commit convention",
              ]}
            />
          </Section>
          <Section
            id="terminals"
            title="Terminals & scripts"
            lead="Real terminals at the bottom. Jig finds the scripts of every repo (package.json, Makefile, …) so you can run, restart and stop them from one place, also in groups. When one fails, Ask Claude opens a chat with its output. When Claude starts a dev server or watcher, it runs in a terminal here (“Claude: …”) that you can see and stop."
          />
          <Section
            id="configure"
            title="Claude configures Jig"
            lead="Ask in any chat: change the theme, fonts, layout, turn add-ons on or off. Claude does it right away and you get an Undo button."
            shot={{ src: configure, alt: "Claude switching the theme, with an Undo card" }}
          >
            <ConfigureExamples />
          </Section>
          <Section
            id="build"
            title="Build your own tools"
            lead="Describe a tool and Jig's builder (a Claude Code session of its own) makes it: a layout change, or an add-on that plugs into the extension slots below. You see what changed and keep it or throw it away. Jig never edits its own code."
            shot={{ src: build, alt: "The builder with a finished add-on" }}
          >
            <BuildLevels />
          </Section>
          <Section
            id="slots"
            title="Extension slots"
            lead={
              <>
                Every place an add-on can plug into. Click one to see an example. Add-ons are folders in{" "}
                <code className="font-mono">~/.jig/addons</code> with an{" "}
                <code className="font-mono">addon.json</code>, React components and optional host code.
              </>
            }
          >
            <SlotGrid />
          </Section>
          <Section
            id="addons"
            title="Your add-ons"
            lead="What is installed now, and which slots each one uses."
          >
            <AddonList />
            <div className="mt-3">
              <Button size="sm" onClick={() => openSettings("addons")}>
                Manage add-ons…
              </Button>
            </div>
          </Section>
          <Section
            id="skills"
            title="Skills & Claude Code"
            lead="Jig runs the Claude Code you already have, so everything you set up for it works here too."
          >
            <Skills />
          </Section>
          <Section
            id="appearance"
            title="Themes & icons"
            lead="Jig Dark and Jig Light, any VS Code colour theme, and file icon themes such as Material Icon Theme. Open VSX search updates as you type. Font pickers offer bundled/system choices, custom names and Reset."
            shot={{ src: settings, alt: "Appearance settings" }}
          >
            <Button size="sm" icon={Palette} onClick={() => openSettings("appearance")}>
              Open appearance settings…
            </Button>
          </Section>
          <Section
            id="learning"
            title="Suggestions"
            lead="Jig notices what you do often (the same prompt, the same commands), what slows you down, and what you mention in chats, and suggests what would help — a tool, a workflow, a CLAUDE.md line, a routine, or a tip. Everything stays on your computer."
            shot={{ src: suggestions, alt: "The suggestions view" }}
          >
            <Bullets
              items={[
                "Claude notes manual work you mention in a chat (a card you can remove)",
                "Friction counts too: stops, rewinds, denied permissions, corrections, failing scripts",
                "Each suggestion has its own action: Build it, Draft a workflow, Add to CLAUDE.md, Make a routine…",
                "“Did it help?” a week after you act on one",
                "What Jig knows about me: your editable profile, the notes and the activity — delete anything",
                "How you worked: lines by Claude vs by hand in your commits, and how often each was changed again",
                "An empty profile? Jig offers a short interview chat where Claude asks, follows up and fills it in; plus an optional weekly check-in chat (off by default)",
                "Workflows: steps you repeat, per project — Jig does some, asks before others, leaves the rest to you; on a schedule, as a skill, or in the cloud",
                "Every repository's commits at a glance in Repos: what's to pull and push, each commit's files and diffs",
                "Pipelines of your repositories: the newest run and its stages, and a Run form with the branch, the YAML's parameters and a checkbox for each switch",
                "Notes for the chat you're in: what it waits on, where its work is, steps left, decisions — you and Claude write them, Claude reads them before it works",
              ]}
            />
          </Section>
          <Section
            id="workflows"
            title="Workflows"
            lead="The things you repeat — a release, a deploy, a Monday routine — as steps per project. Jig does the steps it can (commands, scripts, pipelines, a message to Claude), asks before others, and leaves the rest to you."
            shot={{
              src: workflowsShot,
              alt: "A release workflow half-way: two steps done by Jig, one waiting for you",
            }}
          >
            <Bullets
              items={[
                "Run step by step, with each command's output",
                "On a schedule while Jig is open: alone when Jig can do every step, otherwise it reminds you",
                "Export as a Claude Code skill, or Move to the cloud as a routine or a pipeline",
                "Suggestions draft workflows from what you tell Claude you do by hand",
              ]}
            />
          </Section>
          <Section
            id="knowledge"
            title="What Jig knows about me"
            lead="Everything Jig uses to suggest things, in one page you control: your profile (how you work), the notes Claude saved from your chats, your activity by kind, and how you worked this week — lines by Claude vs by hand. It stays on your computer; edit or delete anything."
            shot={{ src: knowledgeShot, alt: "The profile, notes from chats and activity" }}
          />
          <Section
            id="usage"
            title="Plan usage"
            lead="Your 5-hour session and weekly limits, as Claude Code reports them. Bars in the status bar; hover them for every window."
            shot={{ src: usage, alt: "The plan usage card" }}
          />
          <Section
            id="shortcuts"
            title="Keyboard shortcuts"
            lead="Everything is also in the Tools menu. Click one to run it."
          >
            <Shortcuts />
          </Section>
        </div>
      </div>
    </div>
  );
}
