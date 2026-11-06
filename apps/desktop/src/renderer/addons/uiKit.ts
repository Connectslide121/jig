/**
 * `@jig/sdk/ui` — what add-on UIs import: Jig's own components (so add-ons look native and follow
 * the theme) and a few hooks. Add-ons get this exact module instance at runtime (shared.ts).
 */

export { isImagePath } from "@jig/sdk";
export { PERMISSION_MODE_LABELS } from "../../shared/engine";
export { useImageFile } from "../features/files/images";
/**
 * A person as a fixed-size round avatar: their Microsoft profile picture when Jig can get it (the
 * meeting sign-in), else initials; an empty slot when there's nobody; hover shows name and e-mail.
 */
export { PersonAvatar, personInitials } from "../features/people/PersonAvatar";
/** A small picture of an HTML page (sandboxed, no scripts), scaled to the width it is given (D-405). */
export { HtmlThumbnail } from "../features/preview/HtmlThumbnail";
/** A project's colour square (`project.color` from `useProjectList`). */
export { ProjectSwatch } from "../features/projects/colors";
/** A message's files: image thumbnails and document chips that open them; removable with `onRemove`. */
export { ChatAttachments as Attachments } from "../features/sessions/ChatAttachments";
/**
 * Who runs a chat (D-298, D-314): Claude's or ChatGPT's mark, the same as the usage footer and the chat
 * pickers (`provider`: "claude" | "chatgpt"; `iconOnly` keeps the name for the tooltip).
 */
export { ProviderMark } from "../features/usage/ProviderMark";
export { languageForPath } from "../lib/highlight";
export type { DragPoint, PointerDrag } from "../ui";
export {
  Badge,
  Button,
  Card,
  CodeBlock,
  Collapse,
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
  sanitizeHtml,
  Tabs,
  Textarea,
  Tooltip,
  useHighlightedLines,
  usePointerDrag,
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
export { useAddonEvent, useHostCall, useJigEvent, useStorage } from "./hooks";
export { Icon, iconByName } from "./icons";
export { useChatGptReady } from "./providers";
