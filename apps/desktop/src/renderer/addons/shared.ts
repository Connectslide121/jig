import * as sdk from "@jig/sdk";
import * as lucide from "lucide-react";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as ReactDOM from "react-dom";
import * as ui from "./uiKit";

/**
 * The modules add-on bundles import (main/addons/bundle.ts turns those imports into reads of this
 * object), so add-ons share Jig's React, components and icons instead of shipping their own.
 */
declare global {
  var __jigShared: Record<string, unknown>;
}

export function installSharedModules(): void {
  globalThis.__jigShared = {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "react-dom": ReactDOM,
    "@jig/sdk/ui": ui,
    "@jig/sdk": sdk,
    "lucide-react": lucide,
  };
}
