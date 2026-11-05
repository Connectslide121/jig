/** Jig's release notes, newest first, read from `release/` at build time (`scripts/changelog-plugin.ts`, D-393). */
declare module "virtual:jig-changelog" {
  const changelog: Array<{ version: string; date: string | null; notes: string }>;
  export default changelog;
}
