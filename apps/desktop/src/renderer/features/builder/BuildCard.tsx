import { Hammer } from "lucide-react";
import { Badge, Button, Spinner } from "../../ui";
import { workbench } from "../../workbench/store";
import { BuildActions } from "./BuildTab";
import { kindText, STATUS_TEXT, STATUS_TONE, useAddonName, useBuilds } from "./store";

/** The card a chat shows for a build it asked for (jig_request_build). */
export function BuildCard({ buildId }: { buildId: string }) {
  const job = useBuilds((s) => s.jobs.find((j) => j.id === buildId));
  const addonName = useAddonName(job?.addonId);
  if (!job) return null;
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-accent bg-accent-soft p-3"
      data-testid="build-card"
    >
      <div className="flex items-center gap-2 text-sm">
        <Hammer className="size-4 text-accent" />
        <span className="min-w-0 flex-1 truncate font-medium">{job.goal}</span>
        {job.status === "working" && <Spinner size="sm" />}
        {job.kind && <Badge>{kindText(job, addonName)}</Badge>}
        <Badge tone={STATUS_TONE[job.status]}>{STATUS_TEXT[job.status]}</Badge>
      </div>
      {job.summary && <div className="text-xs text-muted">{job.summary}</div>}
      <div className="flex gap-2">
        <BuildActions job={job} size="sm" />
        <Button size="sm" variant="ghost" onClick={() => workbench.openTab("jig.build", { buildId })}>
          Details
        </Button>
      </div>
    </div>
  );
}
