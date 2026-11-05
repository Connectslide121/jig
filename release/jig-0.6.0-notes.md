## New

- **Azure tenants.** Sign in to more than one Azure tenant and switch between them from the round avatar at the far right of the top bar. Add, rename, sign in again or remove tenants from its menu or Settings → Azure. Your own `az login` stays the default, so nothing changes until you add a tenant.
- **A tenant per project.** In a project's settings, pick an Azure tenant; making that project active switches to it.
- **Everything follows the tenant.** New chats, terminals and scripts start with the active tenant. Pipelines, Boards, Releases, Workflows and *Add from Azure* in project links use it too. A chat or terminal that started in a different tenant shows a small tag for it.
- **Claude can see and switch tenants** when you ask (switching asks for your approval).
- **Claude hears when its terminal finishes.** When a command Claude started in a Jig terminal ends, Jig tells that chat the exit code and the last lines of output, so Claude follows up right away instead of waiting on timers.

## Improved

- **Read aloud.** Asking Claude to read a waiting plan aloud now reads the plan or task list itself and keeps waiting for your answer.
- **Task queue.** Claude can edit queued tasks directly, and a running task knows which tasks are still queued, so it doesn't suggest them again as follow-ups.
- Pipelines shows why it couldn't list anything (for example an expired sign-in) in place of the empty list.

## Fixed

- A chat could overwrite the task queue with an outdated copy, wiping a report, running a started task twice or turning a paused queue back on. Add-on data now can't be replaced unless it's unchanged since Claude read it.
