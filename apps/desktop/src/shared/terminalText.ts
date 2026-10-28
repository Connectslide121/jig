/** Terminal output as plain text (for Claude): escape codes removed, the end kept. */

/** Removes terminal colour and cursor codes, and carriage-return redraws (progress bars). */
export function plainOutput(raw: string): string {
  return (
    raw
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape codes is the point.
      .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "") // OSC (titles, shell integration)
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape codes is the point.
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "") // CSI (colours, cursor)
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape codes is the point.
      .replace(/\x1b[@-_]/g, "")
      .split("\n")
      .map((line) => line.replace(/\r$/, "").split("\r").pop() ?? "")
      .join("\n")
  );
}

/** The end of the output: at most `lines` lines and `chars` characters. */
export function outputTail(raw: string, lines = 120, chars = 12_000): string {
  const text = plainOutput(raw)
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  const tail = text.split("\n").slice(-lines).join("\n");
  return tail.length > chars ? tail.slice(-chars) : tail;
}
