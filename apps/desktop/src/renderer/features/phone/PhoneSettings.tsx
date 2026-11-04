import { ExternalLink, Link2, RefreshCw, Send, Smartphone, Unlink } from "lucide-react";
import { useEffect, useState } from "react";
import { isTelegramToken, type PhoneState } from "../../../shared/phone";
import { call, errorMessage } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { Button, cn, confirmDialog, Dialog, Input, Select, Spinner, Switch } from "../../ui";
import { notify } from "../../workbench/toasts";
import { SegmentedSwitch, SettingRow, SettingsSection } from "../settings/parts";
import { startPhone, usePhone } from "./store";

const AWAY_MINUTES = [1, 2, 5, 10, 15, 30, 60];

/** The line under "Telegram": who it's connected to, or what's wrong. */
function connectionText(state: PhoneState): string {
  if (state.error) return state.error;
  if (state.status === "connected")
    return `@${state.bot} talks to ${state.owner}.${state.remembered ? "" : " Kept until Jig closes: this computer can't encrypt the bot's token."}`;
  if (state.status === "pairing") return `Waiting for the code from your Telegram (@${state.bot}).`;
  return "Not set up. You need Telegram on your phone and a bot of your own (free, two minutes).";
}

/** The line under "Topics": on, off and how to turn it on, or what happens once connected. */
function topicsText(state: PhoneState): string {
  if (state.status !== "connected")
    return "Once connected: if your bot has topics turned on, each project gets a topic of its own.";
  if (state.topics) return "On: each project's chats write in their own topic, and Jig has one too.";
  return "Off: everything arrives in one thread. To split it by project, open @BotFather, pick your bot, turn on topics (threaded mode) in its settings, then check again.";
}

/** Settings → Phone: Jig on your phone through your own Telegram bot (D-348). */
export function PhoneSettings() {
  const state = usePhone((s) => s.state);
  const config = useConfig((s) => s.config);
  const [setup, setSetup] = useState(false);
  const [testing, setTesting] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(startPhone, []);
  if (!state || !config) return <Spinner center />;
  const phone = config.phone;
  const connected = state.status === "connected";

  const test = async () => {
    setTesting(true);
    try {
      await call("phone.test");
      notify({ tone: "success", title: "Sent. Check your phone." });
    } catch (error) {
      notify({ tone: "danger", title: "Couldn't send the test", message: errorMessage(error) });
    } finally {
      setTesting(false);
    }
  };
  const checkTopics = async () => {
    setChecking(true);
    try {
      usePhone.setState({ state: await call("phone.state") });
    } catch (error) {
      notify({ tone: "danger", title: "Couldn't ask Telegram", message: errorMessage(error) });
    } finally {
      setChecking(false);
    }
  };
  const disconnect = async () => {
    const ok = await confirmDialog({
      title: "Disconnect your phone?",
      message:
        "Jig forgets the bot's token and stops reading it. The bot stays in Telegram; delete it with @BotFather if you no longer need it.",
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (ok) await call("phone.disconnect");
  };

  return (
    <SettingsSection
      title="Phone"
      description="Jig messages your phone when a chat needs you, finishes or stops while you're away, and you answer from there: tap Allow or an option, or reply to send the chat a message. It goes through a Telegram bot of your own; only you can talk to it."
    >
      <SettingRow
        label="Telegram"
        description={<span className={cn(state.error && "text-danger")}>{connectionText(state)}</span>}
      >
        {state.status === "off" ? (
          <Button variant="primary" icon={Link2} onClick={() => setSetup(true)} data-testid="phone-setup">
            Set up…
          </Button>
        ) : (
          <>
            {state.status === "pairing" && (
              <Button icon={Link2} onClick={() => setSetup(true)}>
                Show code…
              </Button>
            )}
            {connected && (
              <Button icon={Send} busy={testing} onClick={() => void test()} data-testid="phone-test">
                Send a test
              </Button>
            )}
            <Button
              variant="ghost"
              icon={Unlink}
              onClick={() => void disconnect()}
              data-testid="phone-disconnect"
            >
              Disconnect
            </Button>
          </>
        )}
      </SettingRow>
      <SettingRow label="Topics" description={topicsText(state)}>
        <Button
          icon={RefreshCw}
          busy={checking}
          disabled={!connected}
          onClick={() => void checkTopics()}
          data-testid="phone-topics-check"
        >
          Check again
        </Button>
      </SettingRow>
      <SettingRow label="Message my phone" description="Turn it off to pause the bot; it stays connected.">
        <Switch
          label="Message my phone"
          checked={phone.enabled}
          disabled={!connected}
          onChange={(enabled) => void updateConfig({ phone: { enabled } })}
        />
      </SettingRow>
      <SettingRow
        label="When"
        description="Away: only once you haven't touched this computer for a while (requests waiting from before are sent then). Always: every time."
      >
        <div className="w-64">
          <SegmentedSwitch
            label="When to message your phone"
            value={phone.when}
            options={[
              { id: "away", label: "When I'm away" },
              { id: "always", label: "Always" },
            ]}
            onChange={(when) => void updateConfig({ phone: { when } })}
          />
        </div>
      </SettingRow>
      <SettingRow
        label="Away after"
        description="How long without touching the mouse or keyboard counts as away."
      >
        <Select
          className="w-64"
          aria-label="Away after"
          value={phone.awayMinutes}
          disabled={phone.when === "always"}
          onChange={(ev) => void updateConfig({ phone: { awayMinutes: Number(ev.target.value) } })}
        >
          {AWAY_MINUTES.map((m) => (
            <option key={m} value={m}>
              {m === 1 ? "1 minute" : `${m} minutes`}
            </option>
          ))}
        </Select>
      </SettingRow>
      <SettingRow
        label="When a chat finishes"
        description="Also when a chat finishes or stops with an error, with the end of Claude's reply. Questions and permission requests are always sent."
      >
        <Switch
          label="When a chat finishes"
          checked={phone.finished}
          onChange={(finished) => void updateConfig({ phone: { finished } })}
        />
      </SettingRow>
      <SettingRow
        label="Screenshots"
        description="When a chat that used Claude's browser finishes, a screenshot of its page comes with the message. /screen on your phone sends Jig's window any time."
      >
        <Switch
          label="Screenshots"
          checked={phone.screenshots}
          onChange={(screenshots) => void updateConfig({ phone: { screenshots } })}
        />
      </SettingRow>
      <SettingRow
        label="Keep the computer awake"
        description="While a chat works or waits for you, this computer doesn't go to sleep, so messages keep arriving. The screen can still turn off."
      >
        <Switch
          label="Keep the computer awake"
          checked={phone.keepAwake}
          disabled={!connected}
          onChange={(keepAwake) => void updateConfig({ phone: { keepAwake } })}
        />
      </SettingRow>
      <SetupDialog open={setup} state={state} onClose={() => setSetup(false)} />
    </SettingsSection>
  );
}

const STEPS = [
  "Install Telegram on your phone and sign in.",
  "In Telegram, open @BotFather, send /newbot and pick a name and a username ending in “bot”.",
  "Copy the token it answers with (it looks like 123456789:AAH…) and paste it below.",
];

/** Paste the bot's token, then send the bot the code from your phone. Fixed-height, so nothing moves. */
function SetupDialog({ open, state, onClose }: { open: boolean; state: PhoneState; onClose: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const close = () => {
    setToken("");
    setError(undefined);
    onClose();
  };
  const connect = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await call("phone.connect", { token: token.trim() });
      setToken("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const step = state.status === "off" ? "token" : state.status === "pairing" ? "code" : "done";
  const valid = isTelegramToken(token);

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Connect your phone"
      testId="phone-setup-dialog"
      footer={
        step === "token" ? (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={Link2}
              busy={busy}
              disabled={!valid}
              onClick={() => void connect()}
              data-testid="phone-connect"
            >
              Connect
            </Button>
          </>
        ) : (
          <Button variant={step === "done" ? "primary" : "ghost"} onClick={close}>
            {step === "done" ? "Done" : "Close"}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
          <li>Send the code Jig shows you to your bot.</li>
          <li>
            Optional: turn on topics in your bot's settings in @BotFather, so each project gets its own
            thread.
          </li>
        </ol>
        <Input
          type="password"
          placeholder="Bot token from @BotFather"
          aria-label="Bot token"
          value={token}
          disabled={step !== "token"}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid && !busy) void connect();
          }}
          data-testid="phone-token"
        />
        <div
          className={cn(
            "flex h-24 items-center gap-3 rounded-md border px-4 text-sm",
            error ? "border-danger/40 bg-danger-soft text-danger" : "border-line bg-surface text-muted",
          )}
          aria-live="polite"
          data-testid="phone-setup-status"
        >
          {error ? (
            <span className="line-clamp-3">{error}</span>
          ) : step === "code" ? (
            <>
              <Spinner size="sm" />
              <span className="min-w-0 flex-1">
                Send{" "}
                <span className="font-mono text-lg font-semibold text-fg" data-testid="phone-code">
                  {state.code}
                </span>{" "}
                to <span className="text-fg">@{state.bot}</span> from your phone.
              </span>
              <Button
                size="sm"
                icon={ExternalLink}
                onClick={() => void call("app.openExternal", { url: `https://t.me/${state.bot}` })}
              >
                Open Telegram
              </Button>
            </>
          ) : step === "done" ? (
            <>
              <Smartphone className="size-4 text-accent" />
              <span className="text-fg">Connected to {state.owner}. Jig will message you there.</span>
            </>
          ) : (
            <span>
              Jig keeps the token encrypted on this computer and only answers your own Telegram account.
            </span>
          )}
        </div>
      </div>
    </Dialog>
  );
}
