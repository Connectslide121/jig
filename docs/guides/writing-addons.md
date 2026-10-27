# Writing add-ons

Usually Jig's builder writes add-ons for you (Tools → Build something…). This guide is for reading,
fixing or writing them by hand. Reference: `docs/reference/addon-api.md` and `docs/reference/slots.md`.

## A first add-on

Create `~/.jig/addons/hello/addon.json`:

```json
{
  "id": "hello",
  "name": "Hello",
  "description": "Shows the active project's name and counts its files.",
  "icon": "hand",
  "permissions": ["fs:read"],
  "contributes": {
    "views": [{ "id": "main", "title": "Hello", "region": "right", "component": "HelloView" }],
    "actions": [{ "id": "greet", "title": "Say hello", "run": "greet" }]
  }
}
```

`~/.jig/addons/hello/ui.tsx`:

```tsx
import type { AddonComponentProps, AddonUiContext } from "@jig/sdk";
import { Button, Empty, useActiveProject, useHostCall } from "@jig/sdk/ui";

export function HelloView({ ctx }: AddonComponentProps) {
  const project = useActiveProject();
  const { data, reload } = useHostCall<number>("countFiles", { path: project?.path }, { skip: !project });
  if (!project) return <Empty title="No project" />;
  return (
    <div className="flex flex-col gap-2 p-3 text-sm">
      <div className="font-medium text-fg">{project.name}</div>
      <div className="text-muted">{data ?? "…"} files at the top level</div>
      <Button size="sm" onClick={reload}>Count again</Button>
    </div>
  );
}

export function greet(ctx: AddonUiContext) {
  ctx.notify({ title: `Hello from ${ctx.addon.name}`, tone: "success" });
}
```

`~/.jig/addons/hello/host.ts`:

```ts
import type { AddonHostApi } from "@jig/sdk";

export async function countFiles(args: { path?: string }, api: AddonHostApi) {
  return args.path ? (await api.fs.readdir(args.path)).length : 0;
}
```

Save: the view appears in the right sidebar, "Say hello" is in the Tools menu. Edit and save again —
Jig reloads just this add-on.

## Rules

- **Tokens only**: colours, spacing, radius and type through the token utilities. No `#hex`, `rgb()`,
  `text-red-500` or `w-[13px]` (design-token warnings; the builder rejects them).
- **Reuse `@jig/sdk/ui`** components before writing your own.
- **Menus, not commands**: put features in views, actions, menus and buttons.
- **No credentials**: use the user's own CLIs (`git`, `gh`, `az`) through `api.exec`; never store tokens.
- **README.md**: say what the add-on does and why; the builder reads it before changing anything.
- Prefer changing an existing add-on over adding a new one when the feature fits (D-005).

## Debugging

- Problems with the manifest or the build: Settings → Add-ons (shown under the add-on).
- Host logs: `api.log(...)` and anything the process prints go to `~/.jig/logs/main.log`.
- A crashing component shows an inline error with "Turn off" and "Fix with AI"; Jig keeps working.
- Developer tools: Tools → Toggle developer tools.
