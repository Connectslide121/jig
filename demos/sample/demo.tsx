import { CalendarDays, KanbanSquare, LayoutDashboard, ListChecks } from "lucide-react";
import { defineDemo } from "@/kit";
import { me } from "./data";
import { Board } from "./screens/board";
import { Jobs } from "./screens/jobs";
import { ScheduleScreen } from "./screens/schedule";
import { Today } from "./screens/today";

export default defineDemo({
  name: "Fabrikam Field",
  tagline: "Dispatch for field technicians",
  version: 1,
  shell: "sidebar",
  user: me,
  scenario: {
    persona: "A dispatcher",
    moment: "07:40, the start of the day",
    summary: "The day starts with jobs left from yesterday, two technicians on call, and a customer already phoning about a stuck lift.",
  },
  routes: [
    { path: "/", title: "Today", icon: LayoutDashboard, element: Today },
    { path: "/schedule", title: "Schedule", icon: CalendarDays, element: ScheduleScreen },
    { path: "/jobs", title: "Jobs", icon: ListChecks, element: Jobs },
    { path: "/board", title: "Board", icon: KanbanSquare, element: Board },
  ],
  story: [
    { route: "/", target: "kpi-late", title: "See the day at a glance", caption: "Four numbers tell the dispatcher how the day looks before the first call." },
    { route: "/", target: "urgent-job", title: "Open the urgent lift job", caption: "It came in at 07:12 and nobody has it yet. Click it to see the details." },
    { route: "/schedule", target: "schedule", title: "Find a free technician", caption: "The schedule shows who is where; the red line is now." },
    { route: "/", target: "new-job", title: "Log the caller's job", caption: "New job asks only what the technician needs." },
    { route: "/board", target: "board", title: "Close the loop", caption: "Move a finished job to Done from its menu." },
  ],
  changes: [{ version: 1, when: "today", items: ["First version: Today, Schedule, Jobs and Board."] }],
});
