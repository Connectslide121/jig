# Jig on your phone through Teams: setup by hand, and what to ask an admin

Jig can reach your phone through a Teams bot of your own (D-370). Normally you set it up in
**Settings → Phone → Teams → Set up Teams…**, where Jig creates everything with your `az` when you
press Create (D-381). This guide is for when that can't work: your tenant doesn't let your `az`
register an app, you'd rather click through the Azure portal, or an admin has to do a part.

What you end up with is the same either way:

| Piece | Where | What it's for |
|---|---|---|
| App registration "Jig phone" | Microsoft Entra ID, in the tenant where you use Teams | the bot's identity (single-tenant) and its client secret |
| Resource group `jig-phone` | a subscription of that same tenant | holds everything below, so it can be deleted in one go |
| Storage account | the group | where the relay keeps what you write for up to 24 hours |
| Function app (Flex Consumption, Node 22) | the group | the relay: Microsoft posts your messages to it, Jig fetches them |
| Azure Bot (F0, free) | the group | connects the app registration to Teams, with the Teams channel on |
| The Teams app package | made by Jig | the bot in Teams, its command list and the team permissions |

The bot asks for **no Graph permissions** and needs **no admin consent**. Its secret stays in the
Function app's settings; Jig only keeps the relay's key, encrypted on your computer.

## In the Azure portal

Sign in to the portal in the tenant where your Teams is. Pick one region that has Flex Consumption
(the Function app's create page lists them) and use it everywhere.

1. **App registration.** Microsoft Entra ID → App registrations → New registration. Name "Jig
   phone", *Accounts in this organizational directory only*, no redirect URI → Register. Copy the
   **Application (client) ID** and the **Directory (tenant) ID**. Then Certificates & secrets → New
   client secret → copy its **Value** now (it isn't shown again).
   *New registration greyed out or refused?* See "What to ask an admin" below.
2. **Resource group.** Resource groups → Create → name `jig-phone`, your region.
3. **Storage account.** Storage accounts → Create → the group, a free name of lowercase letters and
   digits (for example `jigphone` + a few characters), your region, Standard, LRS. Leave the rest.
4. **Function app.** Function App → Create → **Flex Consumption** → the group, a free name (for
   example `jig-phone-` + a few characters), your region, runtime **Node.js 22**, the storage account
   from step 3. Create, then copy its **default domain** from the Overview page (the relay's host).
5. **Deploy the relay.** The package is in your Jig installation:
   `resources/relay/teams-relay.zip` (on Windows normally
   `%LOCALAPPDATA%\Programs\Jig\resources\relay\teams-relay.zip`; in a clone of Jig,
   `npm run relay:build` writes `relay/teams/dist/relay.zip`). The portal has no button for a Flex
   Consumption zip, so use Cloud Shell (the `>_` icon at the top of the portal): upload the zip
   (Manage files → Upload), then run
   `az functionapp deployment source config-zip -g jig-phone -n <function app> --src teams-relay.zip`.
6. **Relay settings.** The Function app → Settings → Environment variables → App settings → add:

   | Name | Value |
   |---|---|
   | `MicrosoftAppId` | the Application (client) ID from step 1 |
   | `MicrosoftAppPassword` | the client secret's Value from step 1 |
   | `MicrosoftAppTenantId` | the Directory (tenant) ID from step 1 |
   | `MicrosoftAppType` | `SingleTenant` |
   | `JIG_RELAY_KEY` | a random key of 32 or more letters, digits, `-` or `_` that you make up (a password manager's generator works); you give it to Jig in step 9 |

   Apply. `https://<default domain>/api/health` should now answer `401` (it wants the key), not `503`.
7. **Azure Bot.** Create a resource → Azure Bot → the group, a name, pricing tier **F0**, type of
   app **Single Tenant**, creation type **Use existing app registration**, the app id and tenant id
   from step 1. Create. Then the bot → Settings → Configuration → Messaging endpoint
   `https://<default domain>/api/messages` → Apply.
8. **Teams channel.** The bot → Settings → Channels → Microsoft Teams → accept the terms → Apply.
9. **Connect Jig.** Settings → Phone → Teams → Set up Teams… → **Made it in the portal…**: the
   Application (client) ID, and `https://<default domain>#<the JIG_RELAY_KEY you made up>`. Connect.
10. **Add to Teams and pair** in the same modal: Make the app package, upload it for yourself, make
    a private team named Jig, add the app to it, and send the bot the code. The rows tick as the
    relay sees each step.

## What to ask an admin

Setup needs no admin when your tenant allows the defaults. If one of these is blocked, this is
what to ask for (each is a one-time change for you, not for the whole company):

- **Registering an app is refused** (New registration greyed out, or `az ad app create` fails with
  "insufficient privileges"): ask an admin (Application Developer or Cloud Application Administrator
  role) to create the app registration "Jig phone" (single-tenant, *Accounts in this
  organizational directory only*) and to **add you as its owner**. Then you make the secret yourself
  and go on from step 2. The app needs no API permissions and no consent.
- **No subscription in the Teams tenant** (Jig's Where step lists none you can pick): ask for a
  subscription, or a resource group in one, where you are **Contributor**. The Azure Bot and the
  relay must be in a subscription of the tenant where your Teams is.
- **Uploading a custom app is blocked** (Teams has no "Upload a custom app"): ask a Teams admin to
  let you upload custom apps (Teams admin center → Teams apps → Setup policies → *Upload custom
  apps* on, in a policy assigned to you), or to upload `jig-teams-app.zip` to the organisation's
  app catalog and allow it for you.
- **Creating a team is refused**: ask for a private team you own (named Jig, nobody else in it).
- **The app's team permissions can't be granted** (adding the app to the team shows no consent,
  or Settings → Phone → Team says chats write in threads of General): team owners can't grant
  resource-specific consent in your tenant. Ask a Teams admin to allow it for this app (Teams admin
  center → Teams apps → Permission policies / the app's Permissions page → resource-specific consent
  for *Channel.Create.Group*, *ChannelSettings.ReadWrite.Group* and *ChannelMessage.Read.Group*), or
  live with threads in General: everything else works.

## When you're done with it

Settings → Phone → Disconnect lists what was made and the commands to delete it; Jig never deletes
Azure resources itself. In the portal: delete the resource group `jig-phone`, then the app
registration "Jig phone" (Entra ID → App registrations), and remove the app in Teams (Apps → Manage
your apps) and the Jig team if you made one for it.

The client secret expires (two years when Jig made it). Before then, make a new one on the app
registration and put it in the Function app's `MicrosoftAppPassword`; nothing changes in Jig.
