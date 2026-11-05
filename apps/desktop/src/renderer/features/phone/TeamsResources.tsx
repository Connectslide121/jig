import type { TeamsSetupView } from "../../../shared/phone";
import { CodeBlock } from "../../ui";

/**
 * What Teams setup made in Azure, for Disconnect and Start over: Jig never deletes it (D-370), so it
 * lists it with the commands to copy.
 */
export function TeamsResources({ resources }: { resources: NonNullable<TeamsSetupView["resources"]> }) {
  return (
    <div className="flex flex-col gap-1" data-testid="teams-resources">
      <ul className="flex flex-col rounded-md border border-line bg-surface px-3 py-1.5 text-xs">
        {resources.names.map((name) => (
          <li key={name} className="truncate text-fg">
            {name}
          </li>
        ))}
        <li className="truncate text-muted">in {resources.subscription}</li>
      </ul>
      <CodeBlock code={resources.commands.join("\n")} lang="powershell" />
    </div>
  );
}
