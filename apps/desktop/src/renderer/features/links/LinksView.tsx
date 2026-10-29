import { Cloud, ExternalLink, Link as LinkIcon, MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import {
  type AzureItem,
  defaultLinkLabel,
  guessLinkType,
  LINK_TYPE_IDS,
  LINK_TYPES,
  type LinkGroup,
  type LinkType,
  linkLabel,
  type ProjectLink,
} from "../../../shared/links";
import type { ProjectInfo } from "../../../shared/projects";
import { iconByName } from "../../addons/icons";
import { call, errorMessage } from "../../lib/host";
import {
  Button,
  cn,
  confirmDialog,
  Dialog,
  Empty,
  IconButton,
  Input,
  openMenuAt,
  promptDialog,
  Select,
  Spinner,
} from "../../ui";
import { useActiveProject } from "../../workbench/projects";
import { notify } from "../../workbench/toasts";
import { addLinks, moveLink, removeGroup, removeLink, renameGroup, shiftGroup, updateLink } from "./model";

const DRAG = "application/x-jig-link";

export function LinkTypeIcon({ type, className }: { type: LinkType; className?: string }) {
  const Icon = iconByName(LINK_TYPES[type]?.icon) ?? LinkIcon;
  return <Icon className={cn("size-3.5 shrink-0 text-muted", className)} />;
}

async function save(project: ProjectInfo, links: LinkGroup[]) {
  try {
    await call("projects.update", { id: project.id, links });
  } catch (e) {
    notify({ title: "Links not saved", message: errorMessage(e), tone: "danger" });
  }
}

const open = (url: string) => void call("app.openExternal", { url });

// ------------------------------------------------------------------------------------------------
// Dialogs: a link (add or edit), and picking from Azure.

type DialogState =
  | { kind: "link"; link?: ProjectLink; group?: string }
  | { kind: "azure"; group?: string }
  | undefined;
const useLinkDialog = create<{ open: DialogState }>(() => ({ open: undefined }));
export const openLinkDialog = (group?: string) => useLinkDialog.setState({ open: { kind: "link", group } });
export const openAzureDialog = (group?: string) => useLinkDialog.setState({ open: { kind: "azure", group } });

export function LinkDialogHost() {
  const state = useLinkDialog((s) => s.open);
  const project = useActiveProject();
  if (!state || !project) return null;
  const close = () => useLinkDialog.setState({ open: undefined });
  return state.kind === "link" ? (
    <LinkDialog project={project} link={state.link} group={state.group} onClose={close} />
  ) : (
    <AzureDialog project={project} group={state.group} onClose={close} />
  );
}

function GroupField({
  project,
  value,
  onChange,
}: {
  project: ProjectInfo;
  value: string;
  onChange: (v: string) => void;
}) {
  const titles = (project.links ?? []).map((g) => g.title);
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the Input/Select inside.
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">Group</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list="jig-link-groups"
        placeholder="Stage, Prod…"
        data-testid="link-group"
      />
      <datalist id="jig-link-groups">
        {titles.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </label>
  );
}

function LinkDialog({
  project,
  link,
  group,
  onClose,
}: {
  project: ProjectInfo;
  link?: ProjectLink;
  group?: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(link?.url ?? "");
  const [label, setLabel] = useState(link?.label ?? "");
  const [type, setType] = useState<LinkType | "">(link?.type ?? "");
  const [groupTitle, setGroupTitle] = useState(group ?? project.links?.[0]?.title ?? "Links");
  const [error, setError] = useState<string>();
  const valid = /^https?:\/\/\S+$/i.test(url.trim());
  const guessed = valid ? guessLinkType(url.trim()) : "other";
  const submit = async () => {
    if (!valid) return setError("Paste an address that starts with http:// or https://");
    const value = { url: url.trim(), label: label.trim() || undefined, type: type || guessed };
    const links = link
      ? updateLink(project.links ?? [], link.id, value)
      : addLinks(project.links ?? [], groupTitle, [value]);
    await save(project, links);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={link ? "Edit link" : "Add a link"}
      testId="link-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} data-testid="link-save">
            {link ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is the Input/Select inside. */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Address</span>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://portal.azure.com/#@/resource/… or https://stage.shop.se"
            data-testid="link-url"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is the Input/Select inside. */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Label</span>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={valid ? defaultLinkLabel(url.trim()) : "From the address"}
              data-testid="link-label"
            />
          </label>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is the Input/Select inside. */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Type</span>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as LinkType | "")}
              data-testid="link-type"
            >
              <option value="">{`${LINK_TYPES[guessed].label} (from the address)`}</option>
              {LINK_TYPE_IDS.map((t) => (
                <option key={t} value={t}>
                  {LINK_TYPES[t].label}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {!link && <GroupField project={project} value={groupTitle} onChange={setGroupTitle} />}
        {error && <div className="text-xs text-danger">{error}</div>}
      </div>
    </Dialog>
  );
}

/** Pick resource groups, or one group's resources, from your own `az` login. */
function AzureDialog({
  project,
  group,
  onClose,
}: {
  project: ProjectInfo;
  group?: string;
  onClose: () => void;
}) {
  const [rg, setRg] = useState<string>();
  const [items, setItems] = useState<AzureItem[]>();
  const [error, setError] = useState<string>();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [groupTitle, setGroupTitle] = useState(group ?? project.links?.[0]?.title ?? "Azure");
  const load = (resourceGroup?: string) => {
    setItems(undefined);
    setError(undefined);
    setRg(resourceGroup);
    void call("links.azure", resourceGroup ? { group: resourceGroup } : {})
      .then(setItems)
      .catch((e) => setError(errorMessage(e)));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once when the dialog opens.
  useEffect(() => load(), []);
  const shown = (items ?? []).filter((i) => i.name.toLowerCase().includes(filter.toLowerCase()));
  const add = async () => {
    const chosen = (items ?? []).filter((i) => picked.has(i.id));
    await save(
      project,
      addLinks(
        project.links ?? [],
        groupTitle,
        chosen.map((i) => ({ url: i.url, type: i.type })),
      ),
    );
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      title={rg ? `Resources in ${rg}` : "Add from Azure"}
      testId="azure-dialog"
      footer={
        <>
          {rg && (
            <Button variant="ghost" onClick={() => load()}>
              Back to resource groups
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!picked.size}
            onClick={() => void add()}
            data-testid="azure-add"
          >
            Add {picked.size || ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">Through your own Azure CLI login (`az`); Jig stores no tokens.</p>
        <div className="grid grid-cols-2 gap-2">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: Input is the labelled control. */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Filter</span>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" />
          </label>
          <GroupField project={project} value={groupTitle} onChange={setGroupTitle} />
        </div>
        {error && <div className="text-xs text-danger">{error}</div>}
        {!items && !error && <Spinner />}
        <div className="flex max-h-80 flex-col overflow-y-auto">
          {shown.map((i) => (
            <div
              key={i.id}
              className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-hover"
              data-testid="azure-item"
            >
              <input
                type="checkbox"
                aria-label={i.name}
                checked={picked.has(i.id)}
                onChange={(e) =>
                  setPicked((p) => {
                    const next = new Set(p);
                    if (e.target.checked) next.add(i.id);
                    else next.delete(i.id);
                    return next;
                  })
                }
              />
              <LinkTypeIcon type={i.type} />
              <span className="min-w-0 flex-1 truncate text-sm">{i.name}</span>
              <span className="truncate text-2xs text-hint">
                {i.azureType === "resourceGroup" ? "resource group" : i.azureType}
              </span>
              {!rg && (
                <Button size="sm" variant="ghost" onClick={() => load(i.name)}>
                  Resources…
                </Button>
              )}
            </div>
          ))}
          {items && shown.length === 0 && <div className="text-xs text-hint">Nothing here.</div>}
        </div>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------
// The panel (a section below Projects) and the Home card.

/**
 * The active project's links, in your groups (D-102: it follows the project). Click opens it in your
 * browser; drag links between groups; the menus edit, copy and ask Claude.
 */
export function LinksView() {
  const project = useActiveProject();
  const [dropOn, setDropOn] = useState<string>();
  if (!project)
    return (
      <Empty icon={LinkIcon} title="No project">
        Links belong to a project.
      </Empty>
    );
  const groups = project.links ?? [];
  const linkMenu = (link: ProjectLink) => [
    { label: "Open", icon: ExternalLink, onSelect: () => open(link.url) },
    { label: "Copy address", onSelect: () => void navigator.clipboard.writeText(link.url) },
    {
      label: "Edit…",
      testId: "link-edit",
      onSelect: () => useLinkDialog.setState({ open: { kind: "link", link } }),
    },
    { separator: true } as const,
    {
      label: "Remove",
      danger: true,
      testId: "link-remove",
      onSelect: () => void save(project, removeLink(groups, link.id)),
    },
  ];
  const groupMenu = (g: LinkGroup) => [
    { label: "Add a link…", icon: Plus, onSelect: () => openLinkDialog(g.title) },
    { label: "Add from Azure…", icon: Cloud, onSelect: () => openAzureDialog(g.title) },
    {
      label: "Rename…",
      onSelect: async () => {
        const title = await promptDialog({ title: "Rename group", initial: g.title, confirmLabel: "Rename" });
        if (title) await save(project, renameGroup(groups, g.id, title));
      },
    },
    { label: "Move up", onSelect: () => void save(project, shiftGroup(groups, g.id, -1)) },
    { label: "Move down", onSelect: () => void save(project, shiftGroup(groups, g.id, 1)) },
    { separator: true } as const,
    {
      label: "Remove group…",
      danger: true,
      onSelect: async () => {
        if (
          await confirmDialog({
            title: `Remove ${g.title} and its links?`,
            confirmLabel: "Remove",
            danger: true,
          })
        )
          await save(project, removeGroup(groups, g.id));
      },
    },
  ];
  return (
    <div className="flex h-full flex-col" data-testid="links-view">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{project.name}</span>
        <IconButton
          icon={Cloud}
          size="sm"
          label="Add from Azure…"
          data-testid="links-azure"
          onClick={() => openAzureDialog()}
        />
        <IconButton
          icon={Plus}
          size="sm"
          label="Add a link…"
          data-testid="links-add"
          onClick={() => openLinkDialog()}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {groups.length === 0 && (
          <div className="px-2 py-2 text-xs text-hint">
            Your project's places: Azure resources, sites, Azure DevOps, docs. Add links with + or from Azure.
          </div>
        )}
        {groups.map((g) => (
          <div
            key={g.id}
            className={cn("mb-1 rounded-md", dropOn === g.id && "bg-accent-soft")}
            data-testid={`link-group-${g.title}`}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG)) return;
              e.preventDefault();
              setDropOn(g.id);
            }}
            onDragLeave={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
                setDropOn(undefined);
            }}
            onDrop={(e) => {
              setDropOn(undefined);
              const id = e.dataTransfer.getData(DRAG);
              if (id) void save(project, moveLink(groups, id, g.id));
            }}
          >
            <div className="group flex h-6 items-center gap-1 px-2 text-2xs font-semibold tracking-wide text-hint uppercase">
              <span className="min-w-0 flex-1 truncate">{g.title}</span>
              <IconButton
                icon={MoreHorizontal}
                size="sm"
                label={`${g.title} options`}
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                onClick={(e) => openMenuAt(e.currentTarget, groupMenu(g), true)}
              />
            </div>
            {g.links.map((l) => (
              <button
                key={l.id}
                type="button"
                draggable
                onDragStart={(e) => e.dataTransfer.setData(DRAG, l.id)}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData(DRAG);
                  if (!id) return;
                  e.stopPropagation();
                  setDropOn(undefined);
                  void save(project, moveLink(groups, id, g.id, l.id));
                }}
                className="group flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-hover"
                title={l.url}
                data-testid={`link-${linkLabel(l)}`}
                onClick={() => open(l.url)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenuAt(e.currentTarget, linkMenu(l));
                }}
              >
                <LinkTypeIcon type={l.type} />
                <span className="min-w-0 flex-1 truncate">{linkLabel(l)}</span>
                <span className="hidden text-2xs text-hint group-hover:inline">
                  {LINK_TYPES[l.type].label}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The project's links on its Home: one small column per group. */
export function LinksCard({ project }: { project: ProjectInfo }) {
  const groups = (project.links ?? []).filter((g) => g.links.length);
  if (!groups.length) return null;
  return (
    <section className="flex flex-col gap-2" data-testid="home-links">
      <h2 className="text-xs font-semibold tracking-wide text-hint uppercase">Links</h2>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g.id} className="rounded-lg border border-line bg-surface p-2">
            <div className="mb-1 px-1 text-xs font-medium text-muted">{g.title}</div>
            {g.links.map((l) => (
              <button
                key={l.id}
                type="button"
                className="flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-1 text-left text-sm hover:bg-hover"
                title={l.url}
                onClick={() => open(l.url)}
              >
                <LinkTypeIcon type={l.type} />
                <span className="min-w-0 flex-1 truncate">{linkLabel(l)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
