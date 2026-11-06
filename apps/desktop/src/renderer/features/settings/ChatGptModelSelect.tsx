import type { ModelInfo } from "../../../shared/engine";
import { chatGptModelChoices, resolveChatGptModel } from "../../../shared/providers";
import { Select } from "../../ui";

/** The ChatGPT model picker (D-310): the families first, a divider, then the exact versions. */
export function chatGptChoices(models: ModelInfo[], saved: string): Array<[string, string] | null> {
  const { families, versions } = chatGptModelChoices(models);
  const choices: Array<[string, string] | null> = [
    ...families.map((f): [string, string] => [f.value, f.label]),
    null,
    ...versions.map((v): [string, string] => [v.value, v.label]),
  ];
  if (saved && !choices.some((c) => c?.[0] === saved)) {
    const unknown = resolveChatGptModel(saved, models).notice;
    choices.push([saved, unknown ? `${saved} (no such family: Codex's default)` : `${saved} (saved choice)`]);
  }
  return choices;
}

/**
 * A ChatGPT model picker row's select (D-310): families, then versions. `empty` adds a first option
 * for "" (a helper's fallback, or Codex's default model; D-337).
 */
export function ChatGptModelSelect({
  value,
  models,
  label,
  testId,
  empty,
  onSave,
  className = "w-64",
  disabled,
}: {
  value: string;
  models: ModelInfo[];
  label: string;
  testId: string;
  empty?: string;
  onSave: (model: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      className={className}
      aria-label={label}
      data-testid={testId}
      value={value}
      disabled={disabled}
      onChange={(ev) => onSave(ev.target.value)}
    >
      {empty !== undefined && (
        <>
          <option value="">{empty}</option>
          <hr />
        </>
      )}
      {chatGptChoices(models, value).map((c, i) =>
        c ? (
          <option key={c[0]} value={c[0]}>
            {c[1]}
          </option>
        ) : (
          <hr key={`divider-${i}`} />
        ),
      )}
    </Select>
  );
}
