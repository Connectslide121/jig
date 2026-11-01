import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Spinner } from "./ui/Spinner";
import "./styles/global.css";

const MeetingRoom = lazy(async () => ({
  default: (await import("./features/meetings/MeetingRoom")).MeetingRoom,
}));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).get("meetingRoom") === "1" ? (
      <Suspense
        fallback={
          <div className="h-screen bg-base text-fg">
            <Spinner center />
          </div>
        }
      >
        <MeetingRoom />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
