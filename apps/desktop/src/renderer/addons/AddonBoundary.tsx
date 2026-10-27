import { Power, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { AddonInfo } from "../../shared/addons";
import { call } from "../lib/host";
import { Button, ErrorBoundary } from "../ui";
import { useRegistry } from "../workbench/registry";
import { requestBuild } from "./buildRequests";

/**
 * Every add-on contribution renders inside this: a crash shows an inline error with "Turn off" and
 * "Fix with AI" — never a broken app (AGENTS.md).
 */
export function AddonBoundary({
  addon,
  what,
  children,
}: {
  addon: AddonInfo;
  what: string;
  children: ReactNode;
}) {
  const canBuild = useRegistry((s) => Boolean(s.actions["jig.build"]));
  return (
    <ErrorBoundary
      label={`${addon.name} (${what})`}
      actions={(error) => (
        <>
          <Button
            size="sm"
            icon={Power}
            onClick={() => void call("addons.setEnabled", { id: addon.id, enabled: false })}
          >
            Turn off {addon.name}
          </Button>
          {canBuild && (
            <Button
              size="sm"
              icon={Sparkles}
              onClick={() =>
                requestBuild({
                  goal: `Fix the add-on "${addon.name}": its ${what} crashes with this error:\n\n${error.message}`,
                  addonId: addon.id,
                })
              }
            >
              Fix with AI
            </Button>
          )}
        </>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
