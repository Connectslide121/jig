import { Hammer, Plus } from "lucide-react";
import { Badge, Button, Empty, IconButton, ListRow } from "../../ui";
import { workbench } from "../../workbench/store";
import { openBuildDialog } from "./BuildDialog";
import { buildTitle, STATUS_TEXT, STATUS_TONE, useBuilds } from "./store";

export function BuildsView() {
  const jobs = useBuilds((s) => s.jobs);
  if (jobs.length === 0)
    return (
      <Empty
        icon={Hammer}
        title="No builds yet"
        actions={
          <Button size="sm" icon={Plus} onClick={() => openBuildDialog({ goal: "", origin: "tools" })}>
            Build something…
          </Button>
        }
      />
    );
  return (
    <div
      role="listbox"
      aria-label="Builds"
      className="h-full overflow-y-auto p-1.5"
      data-testid="builds-view"
    >
      {jobs.map((job) => (
        <ListRow
          key={job.id}
          data-testid={`build-${job.id}`}
          onClick={() => workbench.openTab("jig.build", { buildId: job.id })}
          leading={<Hammer className="size-3.5" />}
          trailing={<Badge tone={STATUS_TONE[job.status]}>{STATUS_TEXT[job.status]}</Badge>}
          description={job.summary ?? new Date(job.createdAt).toLocaleString()}
        >
          {job.title || buildTitle(job.goal)}
        </ListRow>
      ))}
    </div>
  );
}

export function BuildsHeaderActions() {
  return (
    <IconButton
      icon={Plus}
      size="sm"
      label="Build something…"
      onClick={() => openBuildDialog({ goal: "", origin: "tools" })}
    />
  );
}
