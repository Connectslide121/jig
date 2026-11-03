import { ShieldCheck } from "lucide-react";
import { Fragment } from "react";
import { VOICE_COMMANDS, VOICE_GROUPS } from "./grammar";

/** What a name in a phrase stands for, as the page shows it. */
const PLACEHOLDER: Record<string, string> = {
  project: "project",
  chat: "chat name",
  repo: "repository",
  script: "script",
  workflow: "workflow",
  text: "what you want",
};

/** A phrase with its names shown as placeholders: "new chat in <project>" → new chat in project. */
function Phrase({ text }: { text: string }) {
  const parts = text.split(/(<[a-z]+>)/);
  return (
    <span className="rounded-sm border border-line bg-surface px-1.5 py-0.5 text-xs text-fg">
      {parts.map((part, i) =>
        /^<[a-z]+>$/.test(part) ? (
          <span key={i} className="text-accent italic">
            {PLACEHOLDER[part.slice(1, -1)] ?? part.slice(1, -1)}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}

/** Every "Hey Jig" command, by group, as Jig understands them (the matcher's own list, D-278). */
export function VoiceCommandsList() {
  return (
    <div className="flex flex-col gap-6" data-testid="voice-commands">
      {VOICE_GROUPS.map((group) => (
        <div key={group.id}>
          <h3 className="text-sm font-semibold text-fg">{group.title}</h3>
          <p className="mt-0.5 text-xs text-muted">{group.lead}</p>
          <ul className="mt-2 flex flex-col">
            {VOICE_COMMANDS.filter((c) => c.group === group.id).map((command) => (
              <li
                key={command.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-1.5 last:border-b-0"
              >
                <span className="w-56 shrink-0 text-sm text-fg">{command.title}</span>
                <span className="flex min-w-48 flex-1 flex-wrap gap-1.5">
                  {command.say.map((say) => (
                    <Phrase key={say} text={say} />
                  ))}
                </span>
                <span className="ml-auto flex w-28 shrink-0 items-center justify-end gap-1 text-2xs text-hint">
                  {command.confirm && (
                    <>
                      <ShieldCheck className="size-3.5" />
                      Asks for a yes
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
