import { call, errorMessage } from "../../lib/host";
import { workbench } from "../../workbench/store";
import { dismiss, notify } from "../../workbench/toasts";

/** Asks Claude for a guided tour of the uncommitted changes where `cwd` is, and opens it. */
export async function startTour(cwd: string, focus?: string): Promise<void> {
  const waiting = notify({
    title: "Claude is preparing a tour of the changes…",
    message: "It opens when it's ready.",
    timeout: 0,
  });
  try {
    const tour = await call("tour.create", { cwd, focus });
    dismiss(waiting);
    workbench.openTab("jig.tour", { tourId: tour.id, title: tour.title });
  } catch (error) {
    dismiss(waiting);
    notify({ title: "Couldn't make the tour", message: errorMessage(error), tone: "danger" });
  }
}
