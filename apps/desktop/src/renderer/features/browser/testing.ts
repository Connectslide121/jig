import { testChatMessage } from "../../../shared/tester";
import { call, errorMessage } from "../../lib/host";
import { promptDialog } from "../../ui";
import { notify } from "../../workbench/toasts";
import { newSession } from "../sessions/actions";

/**
 * Tools → Test something… (D-124): a new chat on the tester model (Haiku by default) that tests
 * what you describe in Claude's browser, on the page already open there unless you give a URL.
 */
export async function testSomething(): Promise<void> {
  const page = await call("browser.state").catch(() => undefined);
  const url = page?.open && page.url ? page.url : undefined;
  const what = await promptDialog({
    title: "Test something",
    message: url
      ? `What should be tested on ${url}? The steps, and what should happen.`
      : "What should be tested? The URL (the dev server must be running), the steps, and what should happen.",
    placeholder: "Log in, add an item to the cart, check the total",
    confirmLabel: "Start testing",
  });
  if (!what?.trim()) return;
  const config = await call("config.get");
  const id = await newSession();
  if (!id) return;
  try {
    await call("sessions.setModel", { id, model: config.engine.testerModel || "haiku" });
    await call("sessions.send", { id, text: testChatMessage(what, url) });
  } catch (error) {
    notify({ title: "Couldn't start the test", message: errorMessage(error), tone: "danger" });
  }
}
