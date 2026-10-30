import { call, errorMessage } from "../../lib/host";
import { notify } from "../../workbench/toasts";
import { newSession } from "../sessions/actions";

/** Opens a chat where Claude interviews you and fills in your profile (D-169). */
export async function startProfileInterview(): Promise<void> {
  try {
    const { prompt } = await call("learning.interview");
    await newSession(undefined, undefined, prompt);
  } catch (error) {
    notify({ title: "Couldn't start the interview", message: errorMessage(error), tone: "danger" });
  }
}
