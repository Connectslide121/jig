/**
 * "Build something…" entry points (Tools menu, "Change this with AI", "Fix with AI", suggestions)
 * call `requestBuild`; the builder UI (phase 8) installs the handler.
 */
export interface BuildRequest {
  goal: string;
  addonId?: string;
  origin?: string;
}

let handler: ((request: BuildRequest) => void) | undefined;

export function setBuildRequestHandler(next: (request: BuildRequest) => void): void {
  handler = next;
}

export function requestBuild(request: BuildRequest): void {
  handler?.(request);
}
