import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Spinner } from "./ui/Spinner";
import "./styles/global.css";

const MeetingRoom = lazy(async () => ({
  default: (await import("./features/meetings/MeetingRoom")).MeetingRoom,
}));
const MeetingLobby = lazy(async () => ({
  default: (await import("./features/meetings/MeetingLobby")).MeetingLobby,
}));
const params = new URLSearchParams(window.location.search);
/** The Meetings windows (D-292): the call window (`meetingRoom`) and the lobby (`meetingLobby`). */
const Meetings =
  params.get("meetingRoom") === "1"
    ? MeetingRoom
    : params.get("meetingLobby") === "1"
      ? MeetingLobby
      : undefined;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {Meetings ? (
      <Suspense
        fallback={
          <div className="h-screen bg-base text-fg">
            <Spinner center />
          </div>
        }
      >
        <Meetings />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
