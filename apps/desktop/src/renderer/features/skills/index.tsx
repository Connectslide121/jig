import { BookOpen, Check, ExternalLink, FolderCheck, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { globallyEnabled, type LibrarySkill, type SkillDetails } from "../../../shared/skills";
import { call, errorMessage } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { Button, Dialog, Empty, Markdown, SearchInput, Spinner, Switch } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { registerAction, registerTabType } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { ProjectSwatch } from "../projects/colors";

type PolicyPatch = { enabled?: boolean; excludedProjects?: string[] };

export function registerSkills(): void {
  registerTabType({
    type: "jig.skills",
    title: () => "Skills library",
    icon: BookOpen,
    component: SkillsLibrary,
    singleton: true,
    owner: "core",
  });
  registerAction({
    id: "jig.skills",
    title: "Skills library",
    group: "Assistant",
    icon: BookOpen,
    keywords: ["skills", "library", "design", "quality", "security"],
    run: () => void workbench.openTab("jig.skills"),
  });
}

function Details({ skill, close }: { skill: LibrarySkill; close: () => void }) {
  const [details, setDetails] = useState<SkillDetails>();
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void call("skills.details", { id: skill.id }).then(
      (value) => {
        if (live) setDetails(value);
      },
      (e) => {
        if (live) setError(errorMessage(e));
      },
    );
    return () => {
      live = false;
    };
  }, [skill.id]);
  return (
    <Dialog
      open
      onClose={close}
      title={skill.title}
      width="xl"
      testId="skill-details"
      footer={<Button onClick={close}>Close</Button>}
    >
      <div className="flex h-160 min-h-0 flex-col overflow-y-auto" data-testid="skill-details-content">
        {error ? (
          <Empty icon={BookOpen} title="Couldn't load skill">
            {error}
          </Empty>
        ) : !details ? (
          <Spinner center />
        ) : (
          <>
            <p className="text-sm text-fg">{details.description}</p>
            <div className="my-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted">
              <span>
                <span className="font-medium text-accent">Author:</span> {details.author}
              </span>
              <span>
                <span className="font-medium text-accent">Licence:</span> {details.license}
              </span>
              <span title={details.revision}>
                <span className="font-medium text-accent">Version:</span>{" "}
                {details.revision.length > 12 ? details.revision.slice(0, 12) : details.revision}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon={ExternalLink}
                className="justify-start"
                onClick={() => void call("app.openExternal", { url: details.source })}
              >
                Source / reference
              </Button>
            </div>
            <div className="border-t border-line pt-3">
              <Markdown
                text={details.instructions.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")}
                baseUrl={details.author === "Jig" ? undefined : `${details.source}/`}
              />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

function ProjectsPicker({
  skill,
  excluded,
  globallyEnabled,
  save,
  close,
}: {
  skill: LibrarySkill;
  excluded: string[];
  globallyEnabled: boolean;
  save: (patch: PolicyPatch) => Promise<void>;
  close: () => void;
}) {
  const projects = useProjects((s) => s.projects);
  const [selected, setSelected] = useState(() => new Set(excluded));
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const visible = projects
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const apply = async () => {
    setBusy(true);
    try {
      await save({ excludedProjects: [...selected] });
      close();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      title={`Projects · ${skill.title}`}
      onClose={close}
      width="lg"
      testId="skill-projects"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            icon={Check}
            busy={busy}
            onClick={() => void apply()}
            data-testid="skill-projects-apply"
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="flex h-96 flex-col gap-3">
        <p className="h-12 shrink-0 text-xs text-muted">
          Checked projects can use this skill. New projects are included automatically.{" "}
          {globallyEnabled ? "" : "This skill is globally off; these selections apply when you enable it."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
            placeholder="Find projects"
            aria-label="Find projects"
          />
          <Button size="sm" onClick={() => setSelected(new Set())}>
            Include all
          </Button>
          <Button size="sm" onClick={() => setSelected(new Set(projects.map((p) => p.id)))}>
            Exclude all
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line">
          {visible.length === 0 ? (
            <Empty icon={FolderCheck} title={projects.length ? "No matching projects" : "No projects yet"}>
              New projects will be included automatically.
            </Empty>
          ) : (
            visible.map((project) => (
              <label
                key={project.id}
                className="flex h-10 cursor-pointer items-center gap-3 border-b border-line px-3 hover:bg-hover"
              >
                <ProjectSwatch color={project.color} />
                <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-accent"
                  aria-label={`Include ${project.name}`}
                  checked={!selected.has(project.id)}
                  onChange={(e) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (e.target.checked) next.delete(project.id);
                      else next.add(project.id);
                      return next;
                    })
                  }
                />
              </label>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}

function SkillsLibrary() {
  const config = useConfig((s) => s.config);
  const projects = useProjects((s) => s.projects);
  const [skills, setSkills] = useState<LibrarySkill[]>();
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [details, setDetails] = useState<LibrarySkill>();
  const [picker, setPicker] = useState<LibrarySkill>();
  const [busy, setBusy] = useState<string>();
  useEffect(() => {
    let live = true;
    void call("skills.list").then(
      (value) => {
        if (live) setSkills(value);
      },
      (e) => {
        if (live) setError(errorMessage(e));
      },
    );
    return () => {
      live = false;
    };
  }, []);
  const save = async (id: string, patch: PolicyPatch) => {
    setBusy(id);
    try {
      await updateConfig({ skills: { overrides: { [id]: patch } } });
    } catch (e) {
      notify({ title: "Couldn't update skill", message: errorMessage(e), tone: "danger" });
      throw e;
    } finally {
      setBusy(undefined);
    }
  };
  const filtered = skills?.filter((s) =>
    `${s.title} ${s.category} ${s.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="flex h-full flex-col" data-testid="skills-library">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <BookOpen className="size-4 shrink-0 text-muted" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">Skills library</h1>
        <div className="w-72">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
            placeholder="Find skills"
            aria-label="Find skills"
          />
        </div>
      </header>
      <p className="shrink-0 px-4 py-3 text-xs text-muted">
        Built-in guidance Jig uses when relevant. Global off disables a skill everywhere; Projects chooses
        where it is included. Changes apply before the next message without interrupting current work.
      </p>
      <div className="min-h-0 flex-1 overflow-auto px-4">
        {error ? (
          <Empty icon={BookOpen} title="Couldn't load skills">
            {error}
          </Empty>
        ) : !skills || !config ? (
          <div className="flex h-full">
            <Spinner center />
          </div>
        ) : filtered?.length === 0 ? (
          <Empty icon={Search} title="No matching skills" />
        ) : (
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-24" />
              <col className="w-40" />
              <col className="w-20" />
            </colgroup>
            <thead className="sticky top-0 bg-canvas text-xs text-muted">
              <tr>
                <th className="py-2 text-left font-medium">Skill</th>
                <th className="py-2 text-left font-medium">Category</th>
                <th className="py-2 text-left font-medium">Projects</th>
                <th className="py-2 text-right font-medium">Global</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.map((skill) => {
                const policy = config.skills.overrides[skill.id];
                const excluded = projects.filter((p) => policy?.excludedProjects.includes(p.id)).length;
                return (
                  <tr key={skill.id} className="h-16 border-t border-line" data-testid={`skill-${skill.id}`}>
                    <td className="min-w-0 pr-4">
                      <button
                        type="button"
                        onClick={() => setDetails(skill)}
                        className="max-w-full truncate text-left font-medium text-fg hover:text-accent"
                        data-testid={`skill-name-${skill.id}`}
                      >
                        {skill.title}
                      </button>
                      <p className="truncate text-xs text-muted" title={skill.description}>
                        {skill.description}
                      </p>
                    </td>
                    <td className="text-xs text-muted">{skill.category}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={FolderCheck}
                        onClick={() => setPicker(skill)}
                        data-testid={`skill-projects-${skill.id}`}
                      >
                        {excluded ? `${excluded} excluded` : "All projects"}
                      </Button>
                    </td>
                    <td className="text-right">
                      <span className="inline-flex justify-end">
                        <Switch
                          checked={globallyEnabled(config, skill.id, skill.defaultEnabled)}
                          label={`Enable ${skill.title} globally`}
                          disabled={busy === skill.id}
                          onChange={(enabled) => void save(skill.id, { enabled }).catch(() => {})}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="h-10 shrink-0 border-t border-line px-4 py-3 text-xs text-hint">
        Your personal and project Claude Code skills remain independent of these controls.
      </p>
      {details && <Details key={details.id} skill={details} close={() => setDetails(undefined)} />}
      {picker && config && (
        <ProjectsPicker
          key={picker.id}
          skill={picker}
          excluded={config.skills.overrides[picker.id]?.excludedProjects ?? []}
          globallyEnabled={globallyEnabled(config, picker.id, picker.defaultEnabled)}
          save={(patch) => save(picker.id, patch)}
          close={() => setPicker(undefined)}
        />
      )}
    </div>
  );
}
