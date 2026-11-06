import { acquireE2eLock, killOrphanTestElectrons } from "../scripts/e2e-lock.ts";

/**
 * A plain `npx playwright test` takes the computer's e2e lock too (D-420), so it waits for another
 * chat's run instead of fighting it for the CPU. Under `npm run e2e` / `e2e:changed` the parent
 * already holds it and this returns at once.
 */
export default async function globalSetup(): Promise<void> {
  const inherited = Boolean(process.env.JIG_E2E_LOCK_PID);
  await acquireE2eLock("playwright");
  if (!inherited) killOrphanTestElectrons();
}
