/**
 * @jig/documents — what Jig can attach to a chat and how: PDFs go to Claude as documents, Word, Excel and
 * PowerPoint files are turned into text here (Claude doesn't read them natively), text files are sent
 * as text. Pure (no Electron). Documented in docs/reference/engine.md → Attachments.
 */
export * from "./kinds";
export * from "./office";
export * from "./table";
