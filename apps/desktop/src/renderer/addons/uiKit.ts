/**
 * `@jig/sdk/ui` — what add-on UIs import: Jig's own components (so add-ons look native and follow
 * the theme) and a few hooks. Add-ons get this exact module instance at runtime (shared.ts).
 */

export { isImagePath } from "@jig/sdk";
export { useImageFile } from "../features/files/images";
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
  FileIcon,
  formatBytes,
  IconButton,
  ImagePreview,
  Input,
  Kbd,
  ListRow,
  Markdown,
  ResizeHandle,
  SearchInput,
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
export { Pane, usePaneSize, useSplitRatio } from "../workbench/Pane";
export { ArrangeList } from "./ArrangeList";
export {
  useActiveChat,
  useActiveProject,
  useAddon,
  useProjectList,
  useRunningScripts,
  useWorkspaceList,
} from "./context";
export { useAddonEvent, useHostCall, useStorage } from "./hooks";
export { Icon, iconByName } from "./icons";
