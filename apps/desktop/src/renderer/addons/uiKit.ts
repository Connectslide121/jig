/**
 * `@jig/sdk/ui` — what add-on UIs import: Jig's own components (so add-ons look native and follow
 * the theme) and a few hooks. Add-ons get this exact module instance at runtime (shared.ts).
 */
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
} from "../ui";
export { iconByName, useActiveProject, useAddon, useProjectList } from "./context";
export { useAddonEvent, useHostCall } from "./hooks";
