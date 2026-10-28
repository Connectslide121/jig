/**
 * `@jig/sdk/ui` — what add-on UIs import: Jig's own components (so add-ons look native and follow
 * the theme) and a few hooks. Add-ons get this exact module instance at runtime (shared.ts).
 */

export { languageForPath } from "../lib/highlight";
export {
  Badge,
  Button,
  Card,
  CodeBlock,
  CountBadge,
  cn,
  Dialog,
  Empty,
  ErrorBoundary,
  IconButton,
  Input,
  Kbd,
  ListRow,
  Markdown,
  SectionTitle,
  Select,
  Spinner,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  useHighlightedLines,
  VirtualList,
} from "../ui";
export { iconByName, useActiveProject, useAddon, useProjectList, useRunningScripts } from "./context";
export { useAddonEvent, useHostCall } from "./hooks";
