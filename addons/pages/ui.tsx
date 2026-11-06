import type { AddonComponentProps, AddonUiContext } from "@jig/sdk";
import {
  Button,
  Empty,
  IconButton,
  ProjectSwatch,
  SearchInput,
  Spinner,
  useAddonEvent,
  useHostCall,
  useProjectList,
} from "@jig/sdk/ui";
import { Eye, LayoutTemplate, MoreHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import type { Page } from "./lib/pages";

/** The Pages view in a main tab (it starts hidden: pages are looked at now and then). */
export function showPages(ctx: AddonUiContext) {
  ctx.showView("pages");
}

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

type Where = { file: string; dir: string; title: string; version: number };

/** Where the page's files are; says so when it is gone. */
async function locate(ctx: AddonUiContext, id: string): Promise<Where | undefined> {
  try {
    return await ctx.host.call<Where>("where", { id });
  } catch (e) {
    ctx.notify({ title: e instanceof Error ? e.message : String(e), tone: "danger" });
    return undefined;
  }
}

async function openInJig(ctx: AddonUiContext, id: string) {
  const w = await locate(ctx, id);
  if (w) ctx.openPreview(w.file);
}

async function saveAs(ctx: AddonUiContext, id: string, title: string) {
  const w = await locate(ctx, id);
  if (!w) return;
  try {
    const saved = await ctx.saveCopy(w.dir, { name: title, title: `Save "${title}" into…` });
    if (saved) ctx.notify({ title: "Saved a copy", message: saved, timeout: 6000 });
  } catch (e) {
    ctx.notify({
      title: "Couldn't save a copy",
      message: e instanceof Error ? e.message : String(e),
      tone: "danger",
    });
  }
}

/** The ⋯ entries of a page, in the card and in the list (`chatId` gives Open the chat). */
function pageMenu(
  ctx: AddonUiContext,
  page: { id: string; title: string; chatId?: string },
  manage: boolean,
) {
  return [
    ...(page.chatId
      ? [
          {
            label: "Open the chat",
            icon: "message-square",
            onSelect: () => void ctx.openChat({ sessionId: page.chatId }),
          },
        ]
      : []),
    {
      label: "Open in browser",
      icon: "external-link",
      onSelect: async () => {
        const w = await locate(ctx, page.id);
        if (w) ctx.openPath(w.file);
      },
    },
    {
      label: "Show in folder",
      icon: "folder-open",
      onSelect: async () => {
        const w = await locate(ctx, page.id);
        if (w) ctx.openPath(w.dir);
      },
    },
    { label: "Save as…", icon: "save", onSelect: () => void saveAs(ctx, page.id, page.title) },
    ...(manage
      ? [
          { separator: true as const },
          {
            label: "Rename",
            icon: "pencil",
            onSelect: async () => {
              const title = await ctx.prompt({
                title: "Rename the page",
                initial: page.title,
                confirmLabel: "Rename",
              });
              if (title?.trim())
                await ctx.host
                  .call("retitle", { id: page.id, title })
                  .catch((e: Error) => ctx.notify({ title: e.message, tone: "danger" }));
            },
          },
          {
            label: "Delete",
            icon: "trash-2",
            danger: true,
            onSelect: async () => {
              const ok = await ctx.confirm({
                title: `Delete "${page.title}"?`,
                message:
                  "The page and its older versions are removed from Jig. Chats that mention it keep their card, but it no longer opens.",
                confirmLabel: "Delete",
                danger: true,
              });
              if (ok)
                await ctx.host
                  .call("remove", { id: page.id })
                  .catch((e: Error) => ctx.notify({ title: e.message, tone: "danger" }));
            },
          },
        ]
      : []),
  ];
}

function Row({ ctx, page, color }: { ctx: AddonUiContext; page: Page; color?: string }) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="page-row"
      className="flex h-11 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left hover:bg-hover focus-visible:bg-hover"
      onClick={() => void openInJig(ctx, page.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void openInJig(ctx, page.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        ctx.menu(pageMenu(ctx, page, true), e.nativeEvent);
      }}
    >
      <span className="flex w-3 shrink-0 justify-center">
        {page.projectId && <ProjectSwatch color={color} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-fg" data-testid="page-title">
          {page.title}
        </span>
        {/* Narrow: the chat and the time move under the title; wide: they have columns of their own. */}
        <span className="truncate text-2xs text-muted @xl:hidden">
          {[page.chatTitle, ago(page.updatedAt)].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="@max-xl:hidden w-48 shrink-0 truncate text-xs text-muted">{page.chatTitle ?? ""}</span>
      <span className="@max-xl:hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted">
        {ago(page.updatedAt)}
      </span>
      <IconButton
        icon={MoreHorizontal}
        size="sm"
        label="More"
        data-testid="page-more"
        onClick={(e) => {
          e.stopPropagation();
          ctx.menu(pageMenu(ctx, page, true), e.currentTarget);
        }}
      />
    </div>
  );
}

/** Every published page, newest first: the sidebar and the main tab use the same view. */
export function PagesView({ ctx }: AddonComponentProps) {
  const { data, error, reload } = useHostCall<Page[]>("list");
  const projects = useProjectList();
  const [filter, setFilter] = useState("");
  useAddonEvent("changed", () => void reload());
  const colors = useMemo(() => new Map(projects.map((p) => [p.id, p.color])), [projects]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (data ?? []).filter((p) => !q || `${p.title} ${p.chatTitle ?? ""}`.toLowerCase().includes(q));
  }, [data, filter]);

  if (!data) return error ? <div className="p-3 text-xs text-danger">{error}</div> : <Spinner center />;
  return (
    <div className="@container flex h-full min-h-0 flex-col" data-testid="pages">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-2">
        <span className="shrink-0 text-sm font-semibold text-fg">Pages</span>
        <span className="shrink-0 text-xs tabular-nums text-muted">{data.length || ""}</span>
        <div className="ml-auto w-44 min-w-0 @max-xl:w-28">
          <SearchInput
            value={filter}
            placeholder="Filter"
            aria-label="Filter pages"
            onChange={(e) => setFilter(e.target.value)}
            onClear={() => setFilter("")}
          />
        </div>
      </div>
      {data.length === 0 ? (
        <Empty icon={LayoutTemplate} title="No pages yet">
          Ask a chat to show you something as a page: a report, a mockup, a comparison or the release notes.
        </Empty>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {shown.map((p) => (
            <Row key={p.id} ctx={ctx} page={p} color={p.projectId ? colors.get(p.projectId) : undefined} />
          ))}
          {shown.length === 0 && <div className="p-3 text-xs text-muted">No page matches “{filter}”.</div>}
        </div>
      )}
    </div>
  );
}

interface Published {
  page: string;
  title: string;
  version: number;
  updated?: boolean;
}

function parsePublished(output: string | undefined): Published | undefined {
  try {
    const v = JSON.parse(output ?? "") as Partial<Published>;
    return typeof v.page === "string" && typeof v.title === "string" ? (v as Published) : undefined;
  } catch {
    return undefined;
  }
}

/** The card in the chat under a `publish` call: the page's title, Open in Jig and ⋯. */
export function PageCard({ ctx, item }: AddonComponentProps & { item: { status: string; output?: string } }) {
  const published = parsePublished(item.output);
  if (item.status !== "done" || !published) return null;
  return (
    <div
      className="mx-2 mb-2 flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-2"
      data-testid="page-card"
    >
      <LayoutTemplate className="size-4 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{published.title}</span>
      <span className="w-8 shrink-0 text-right text-2xs tabular-nums text-muted">
        {published.version > 1 ? `v${published.version}` : ""}
      </span>
      <Button
        size="sm"
        variant="secondary"
        icon={Eye}
        data-testid="page-open"
        onClick={() => void openInJig(ctx, published.page)}
      >
        Open in Jig
      </Button>
      <IconButton
        icon={MoreHorizontal}
        size="sm"
        label="More"
        data-testid="page-card-more"
        onClick={(e) =>
          ctx.menu(
            pageMenu(ctx, { id: published.page, title: published.title, chatId: undefined }, false),
            e.currentTarget,
          )
        }
      />
    </div>
  );
}
