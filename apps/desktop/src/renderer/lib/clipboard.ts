import { notify } from "../workbench/toasts";

/** Copies text to the clipboard. False (and a toast saying why) when the system refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    notify({
      title: "Couldn't copy",
      message: error instanceof Error ? error.message : String(error),
      tone: "danger",
    });
    return false;
  }
}
