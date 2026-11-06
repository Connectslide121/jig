import type { Meta, StoryObj } from "@storybook/react-vite";
import { BarChart3, Home, Settings2, Users } from "lucide-react";
import { DemoApp } from "./App";
import { Page } from "./page";
import { defineDemo, type ShellKind } from "./types";

function Screen({ title }: { title: string }) {
  return (
    <Page title={title} description="A screen in the shell.">
      <div className="grid h-64 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">Content</div>
    </Page>
  );
}
const demo = (shell: ShellKind) =>
  defineDemo({
    name: "Contoso Rooms",
    tagline: "Book a room in seconds",
    version: 2,
    shell,
    user: { name: "Noor Haddad", role: "Office manager" },
    scenario: { persona: "An office manager", moment: "Tuesday, 09:00", summary: "A team needs a room for a customer visit." },
    routes: [
      { path: "/", title: "Overview", icon: Home, element: () => <Screen title="Overview" /> },
      { path: "/people", title: "People", icon: Users, element: () => <Screen title="People" />, badge: 3 },
      { path: "/reports", title: "Reports", icon: BarChart3, element: () => <Screen title="Reports" /> },
      { path: "/settings", title: "Settings", icon: Settings2, element: () => <Screen title="Settings" />, group: "Admin" },
    ],
    story: [{ route: "/", title: "Start here", caption: "The overview shows today's bookings." }],
    changes: [
      { version: 2, when: "today", items: ["Reports screen"] },
      { version: 1, when: "yesterday", items: ["First version"] },
    ],
  });

const meta: Meta<{ shell: ShellKind }> = {
  title: "Shells",
  parameters: { layout: "fullscreen" },
  render: ({ shell }) => (
    <div className="h-screen">
      <DemoApp demo={demo(shell)} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Sidebar: Story = { args: { shell: "sidebar" } };
export const TopNav: Story = { args: { shell: "topnav" } };
export const Phone: Story = { args: { shell: "phone" } };
export const Tablet: Story = { args: { shell: "tablet" } };
export const Landing: Story = { args: { shell: "landing" } };
