import type { LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

export type ShellKind = "sidebar" | "topnav" | "phone" | "tablet" | "landing";

export interface DemoRoute {
  /** Hash path, "/" first: "/", "/schedule", "/jobs". */
  path: string;
  title: string;
  icon?: LucideIcon;
  element: ComponentType;
  /** Hidden from the navigation (reached from inside the demo). */
  nav?: boolean;
  /** Navigation group label (sidebar shell). */
  group?: string;
  /** A count or short badge beside the nav item. */
  badge?: string | number;
}

export interface StoryStep {
  route: string;
  /** The `data-demo` value of the element to point at, if any. */
  target?: string;
  title: string;
  caption: string;
}

export interface ChangeEntry {
  version: number;
  /** When it changed, as shown ("today", "2 days ago"). */
  when: string;
  items: string[];
}

export interface DemoConfig {
  name: string;
  /** One line under the name (sign-in, landing, phone header). */
  tagline?: string;
  /** The product's mark: a component, or omitted for a lettermark. */
  logo?: ComponentType<{ className?: string }>;
  version: number;
  changes: ChangeEntry[];
  shell: ShellKind;
  routes: DemoRoute[];
  /** The scenario the demo opens on ("A dispatcher, Monday 07:30"). */
  scenario: { persona: string; moment: string; summary: string };
  /** "What to try": the main flow, step by step (also presenter mode's steps). */
  story: StoryStep[];
  /** The signed-in user shown in the shell. */
  user?: { name: string; role: string };
  /** E-mail domains the real-data check accepts (invented ones). `.example` domains always pass. */
  allowDomains?: string[];
  /** Extra content beside the shell's user (a notifications bell, a workspace switcher). */
  shellExtras?: ReactNode;
}

export const defineDemo = (config: DemoConfig) => config;
