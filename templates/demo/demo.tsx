import { LayoutDashboard, ListChecks } from "lucide-react";
import { defineDemo } from "@/kit";
import { Home } from "./screens/home";
import { Items } from "./screens/items";

// The demo's description: its shell, screens, scenario and story. Read the kit's AGENTS.md first.
export default defineDemo({
  name: "__NAME__",
  tagline: "One line about what it does",
  version: 1,
  shell: "sidebar",
  user: { name: "Amira Lindqvist", role: "Team lead" },
  scenario: { persona: "Who uses it", moment: "When, e.g. 08:15 on a busy morning", summary: "What is going on when the demo opens." },
  routes: [
    { path: "/", title: "Home", icon: LayoutDashboard, element: Home },
    { path: "/items", title: "Items", icon: ListChecks, element: Items },
  ],
  story: [
    { route: "/", target: "kpis", title: "See where things stand", caption: "The first thing the user needs to know." },
    { route: "/items", target: "items", title: "Find the one that matters", caption: "Search, filter, open it." },
  ],
  changes: [{ version: 1, when: "today", items: ["First version."] }],
});
