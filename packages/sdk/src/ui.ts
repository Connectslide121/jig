/**
 * Type declarations for `@jig/sdk/ui`. At runtime add-ons never bundle this: the import is replaced by
 * the app's own module (apps/desktop/src/renderer/addons/uiKit.ts, shared through globalThis), so
 * add-ons use Jig's React and components. This file only lets TypeScript and editors see the API.
 */
export * from "../../../apps/desktop/src/renderer/addons/uiKit";
