import {
  type AudioDeviceInfo,
  type AudioEffectsFeature,
  CallClient,
  type CapabilitiesFeature,
  type Captions,
  type CaptionsCallFeature,
  type CaptionsInfo,
  type DeviceManager,
  Features,
  type LocalAudioStream,
  LocalVideoStream,
  type RemoteParticipant,
  type RemoteVideoStream,
  type TeamsCall,
  type TeamsCallAgent,
  type TeamsCaptions,
  type TeamsCaptionsInfo,
  type TeamsIncomingCall,
  type VideoDeviceInfo,
  VideoStreamRenderer,
} from "@azure/communication-calling";
import { AzureCommunicationTokenCredential, getIdentifierRawId } from "@azure/communication-common";
import type { MeetingCaption, MeetingRecord } from "../../../shared/meetings";
import {
  CAPTION_RETRY_DELAYS,
  type CaptionCapability,
  capabilityPending,
  captionErrorText,
  captionStartDecision,
  nextSource,
  type TranscriptSwitch,
} from "../../../shared/meetingTranscript";
import { call } from "../../lib/host";
import { LocalTranscript, localTranscriptUnavailable } from "./localTranscript";

/** Someone else in the call, as the tiles need them. */
export interface Person {
  id: string;
  name: string;
  state: string;
  camera: boolean;
  screen: boolean;
  muted: boolean;
  speaking: boolean;
}
/**
 * Noise suppression on your microphone (D-322): `deep` is Azure Communication Services' deep noise
 * suppression (what removes typing), `browser` Chromium's own (the fallback where the deep one isn't
 * supported), `unavailable` neither could start, `starting` until the call's audio exists.
 */
export type NoiseSuppression = "off" | "starting" | "deep" | "browser" | "unavailable";
export interface MediaState {
  /** Languages Teams can show captions in (empty until captions run). */
  captionLanguages: string[];
  /** The one chosen ("" = as spoken). */
  captionLanguage: string;
  state: string;
  muted: boolean;
  camera: boolean;
  sharing: boolean;
  noiseSuppression: NoiseSuppression;
  people: Person[];
}
export const INITIAL_MEDIA: MediaState = {
  captionLanguages: [],
  captionLanguage: "",
  state: "Not connected",
  muted: true,
  camera: false,
  sharing: false,
  noiseSuppression: "off",
  people: [],
};
const initial = INITIAL_MEDIA;

/** You, as a tile and a row in People. */
export function selfPerson(media: MediaState): Person {
  return {
    id: "local",
    name: "You",
    state: media.state,
    camera: media.camera,
    screen: media.sharing,
    muted: media.muted,
    speaking: false,
  };
}

/** A Teams call ringing in Jig: who calls, with their object id so the call is kept with them. */
export interface Ringing {
  id: string;
  name: string;
  peerId?: string;
}

type CallOptions = { muted: boolean; camera: boolean; language: string; fake: boolean };

/** Why a one-to-one call ended before it was answered, from Teams' end-reason codes. */
export function unanswered(name: string, code?: number): string {
  if (code === 603) return `${name} declined the call.`;
  if (code === 480 || code === 408 || code === 487) return `${name} didn't answer.`;
  if (code === 404) return `Teams couldn't find ${name}.`;
  if (code === 403) return `Teams didn't allow the call to ${name} (code 403).`;
  return `The call to ${name} ended${code ? ` (code ${code})` : ""}.`;
}

/** Video slots: `video:<id>` a person's camera, `screen:<id>` what they share, `local` your camera. */
type SlotKey = string;

/** One media owner per dedicated window. React views may rerender without touching the call. */
export class MeetingMedia {
  private client?: CallClient;
  private agent?: TeamsCallAgent;
  private credential?: AzureCommunicationTokenCredential;
  private deviceManager?: DeviceManager;
  private active?: TeamsCall;
  private record?: MeetingRecord;
  private captions?: TeamsCaptions | Captions;
  private captionsCleanup?: () => void;
  private captionsFeature?: CaptionsCallFeature;
  private capabilities?: CapabilitiesFeature;
  /** Failed tries to start Teams captions in this call, and the next one waiting (D-321). */
  private captionAttempt = 0;
  private captionRetry?: ReturnType<typeof setTimeout>;
  /** Teams captions run; they failed (or stopped) so the local transcript may take over. */
  private teamsActive = false;
  private teamsFailed = false;
  /** Transcribe on this computer when Teams captions aren't available (`meetings.localTranscription`). */
  private localAllowed = true;
  private transcriptSwitch: TranscriptSwitch = { source: "none", since: 0 };
  private local?: LocalTranscript;
  private video?: LocalVideoStream;
  private slots = new Map<SlotKey, HTMLElement>();
  private slotRefs = new Map<SlotKey, (element: HTMLElement | null) => void>();
  private views = new Map<
    SlotKey,
    { stream: RemoteVideoStream | LocalVideoStream; renderer: VideoStreamRenderer; target?: HTMLElement }
  >();
  private preview?: VideoStreamRenderer;
  private cameraDevice?: VideoDeviceInfo;
  private previewVersion = 0;
  private participantCleanup: Array<() => void> = [];
  private listeners = new Set<(state: MediaState) => void>();
  private state = initial;
  private fakeTimer?: ReturnType<typeof setInterval>;
  private fakeSequence = 0;
  private captionsStarting = false;
  private cancelJoin?: () => void;
  private leaving = false;
  private spokenLanguage = "en-us";
  private captionLanguage = "";
  /** Teams translates the captions (Teams Premium); otherwise Claude does, in main (D-277). */
  private teamsTranslates = false;
  /** Listening for Teams calls (D-254): the agent stays between calls and rings through `listeningFor`. */
  private listeningFor?: (ringing: Ringing | undefined) => void;
  private incoming?: TeamsIncomingCall;
  private agentStarting?: Promise<TeamsCallAgent>;
  private statusChain: Promise<unknown> = Promise.resolve();
  private captionChain: Promise<unknown> = Promise.resolve();
  /** Noise suppression wanted (`meetings.noiseSuppression`), and the audio stream it was set up on. */
  private noiseWanted = true;
  private noiseStream?: LocalAudioStream;
  private noiseChain: Promise<unknown> = Promise.resolve();
  /** Test meeting service: Teams captions "unavailable", local transcript on (true) or off (false). */
  private fakeLocal?: boolean;
  constructor(private readonly error: (error: unknown) => void) {}
  subscribe(listener: (state: MediaState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
  private update(next: Partial<MediaState>): void {
    this.state = { ...this.state, ...next };
    for (const fn of this.listeners) fn(this.state);
  }
  private status(status: MeetingRecord["status"], capture: string, gap?: string): void {
    const id = this.record?.id;
    if (!id) return;
    this.statusChain = this.statusChain
      .then(() => call("meetings.status", { id, status, capture, gap }))
      .catch(this.error);
  }
  async prepare(): Promise<{
    microphones: AudioDeviceInfo[];
    speakers: AudioDeviceInfo[];
    cameras: VideoDeviceInfo[];
  }> {
    this.client ??= new CallClient();
    this.deviceManager ??= await this.client.getDeviceManager();
    const granted = await this.deviceManager.askDevicePermission({ audio: true, video: true });
    if (!granted.audio) throw new Error("Microphone access was denied");
    return {
      microphones: await this.deviceManager.getMicrophones(),
      speakers: await this.deviceManager.getSpeakers(),
      cameras: granted.video ? await this.deviceManager.getCameras() : [],
    };
  }
  /** The devices in use now, so the in-call picker opens on them instead of "System default". */
  selected(): { microphone: string; speaker: string; camera: string } {
    return {
      microphone: this.deviceManager?.selectedMicrophone?.id ?? "",
      speaker: this.deviceManager?.selectedSpeaker?.id ?? "",
      camera: this.cameraDevice?.id ?? "",
    };
  }
  async devices(
    microphoneId: string,
    speakerId: string,
    cameraId: string,
    cameraOn: boolean,
    target?: HTMLElement,
  ): Promise<void> {
    const previewVersion = ++this.previewVersion;
    const available = await this.prepare();
    if (previewVersion !== this.previewVersion) return;
    // "System default" is the microphone the SDK marks as the system's default: it lists real devices
    // as `microphone:<id>` and drops the synthetic "default" entry, so the first one may be another mic.
    const microphone =
      (microphoneId && available.microphones.find((d) => d.id === microphoneId)) ||
      available.microphones.find((d) => d.isSystemDefault) ||
      available.microphones[0];
    const speaker =
      available.speakers.find((d) => d.id === (speakerId || "default")) ?? available.speakers[0];
    if (microphone) await this.deviceManager!.selectMicrophone(microphone);
    if (speaker) await this.deviceManager!.selectSpeaker(speaker);
    // Another microphone in a call: noise suppression follows it.
    if (this.active) this.applyNoiseSuppression();
    this.preview?.dispose();
    this.preview = undefined;
    if (!this.active && this.video) {
      this.video.dispose();
      this.video = undefined;
    }
    const camera = available.cameras.find((d) => d.id === cameraId) ?? available.cameras[0];
    this.cameraDevice = camera;
    const current = this.active?.localVideoStreams.find((s) => s.mediaStreamType === "Video");
    if (current && camera) await current.switchSource(camera);
    if (cameraOn && camera && !this.active) {
      const video = new LocalVideoStream(camera);
      const renderer = new VideoStreamRenderer(video);
      this.video = video;
      this.preview = renderer;
      const view = await renderer.createView({ scalingMode: "Crop" });
      if (previewVersion !== this.previewVersion) {
        renderer.dispose();
        video.dispose();
        if (this.preview === renderer) this.preview = undefined;
        if (this.video === video) this.video = undefined;
        return;
      }
      if (target) target.replaceChildren(view.target);
    } else if (target) target.replaceChildren();
  }
  /** A stable ref callback for a tile's video slot; the view follows the stream, not React renders. */
  slot(key: SlotKey): (element: HTMLElement | null) => void {
    let ref = this.slotRefs.get(key);
    if (!ref) {
      ref = (element) => {
        if (element) this.slots.set(key, element);
        else this.slots.delete(key);
        void this.render();
      };
      this.slotRefs.set(key, ref);
    }
    return ref;
  }
  private streamFor(key: SlotKey): RemoteVideoStream | LocalVideoStream | undefined {
    const call = this.active;
    if (!call) return undefined;
    if (key === "local") return call.localVideoStreams.find((s) => s.mediaStreamType === "Video");
    const [kind, ...rest] = key.split(":");
    const id = rest.join(":");
    const person = call.remoteParticipants.find((p) => getIdentifierRawId(p.identifier) === id);
    const type = kind === "screen" ? "ScreenSharing" : "Video";
    return person?.videoStreams.find((v) => v.mediaStreamType === type && v.isAvailable);
  }
  /** Puts each available stream into its tile's slot; drops views whose stream or tile went away. */
  private async render(): Promise<void> {
    for (const [key, view] of this.views) {
      const slot = this.slots.get(key);
      if (!slot || this.streamFor(key) !== view.stream) {
        view.renderer.dispose();
        this.views.delete(key);
      } else if (view.target && view.target.parentElement !== slot) slot.replaceChildren(view.target);
    }
    for (const key of this.slots.keys()) {
      if (this.views.has(key)) continue;
      const stream = this.streamFor(key);
      if (!stream) continue;
      const entry: { stream: typeof stream; renderer: VideoStreamRenderer; target?: HTMLElement } = {
        stream,
        renderer: new VideoStreamRenderer(stream),
      };
      this.views.set(key, entry);
      try {
        const view = await entry.renderer.createView({
          scalingMode: key.startsWith("screen:") ? "Fit" : "Crop",
        });
        if (this.views.get(key) !== entry) {
          view.dispose();
          continue;
        }
        entry.target = view.target;
        this.slots.get(key)?.replaceChildren(view.target);
      } catch (error) {
        if (this.views.get(key) === entry) {
          this.views.delete(key);
          entry.renderer.dispose();
          this.error(error);
        }
      }
    }
  }
  private watchParticipant(p: RemoteParticipant): void {
    const sync = () => this.sync();
    const streams = () => {
      for (const stream of p.videoStreams) {
        stream.on("isAvailableChanged", sync);
        this.participantCleanup.push(() => stream.off("isAvailableChanged", sync));
      }
      sync();
    };
    p.on("videoStreamsUpdated", streams);
    p.on("stateChanged", sync);
    p.on("isMutedChanged", sync);
    // Who speaks when, so the local transcript can say who said a piece of the call's audio.
    const speaking = () => {
      this.local?.speaking(getIdentifierRawId(p.identifier), p.displayName || "Participant", p.isSpeaking);
      sync();
    };
    p.on("isSpeakingChanged", speaking);
    p.on("displayNameChanged", sync);
    streams();
    this.participantCleanup.push(() => {
      p.off("videoStreamsUpdated", streams);
      p.off("stateChanged", sync);
      p.off("isMutedChanged", sync);
      p.off("isSpeakingChanged", speaking);
      p.off("displayNameChanged", sync);
    });
  }
  private sync(): void {
    const c = this.active;
    if (!c) return;
    // Sharing ended (from here, from Teams or the shared window closing): the frame goes too.
    if (this.state.sharing && !c.isScreenSharingOn) void call("meetings.shareStopped").catch(() => {});
    this.update({
      state: c.state === "None" ? "Joining" : c.state,
      muted: c.isMuted,
      camera: c.localVideoStreams.some((s) => s.mediaStreamType === "Video"),
      sharing: c.isScreenSharingOn,
      people: c.remoteParticipants.map((p) => ({
        id: getIdentifierRawId(p.identifier),
        name: p.displayName || "Participant",
        state: p.state,
        camera: p.videoStreams.some((v) => v.mediaStreamType === "Video" && v.isAvailable),
        screen: p.videoStreams.some((v) => v.mediaStreamType === "ScreenSharing" && v.isAvailable),
        muted: p.isMuted,
        speaking: p.isSpeaking,
      })),
    });
    void this.render();
  }
  cancelPreview(): void {
    this.previewVersion++;
    if (this.record) return;
    this.preview?.dispose();
    this.preview = undefined;
    this.video?.dispose();
    this.video = undefined;
  }
  /**
   * The one Teams call agent of this window: made for the first call or for listening, and kept
   * while Jig listens for calls (the SDK allows one agent per client).
   */
  private agentFor(): Promise<TeamsCallAgent> {
    if (this.agent) return Promise.resolve(this.agent);
    this.agentStarting ??= (async () => {
      try {
        this.client ??= new CallClient();
        const credential = await call("meetings.credential", {});
        this.credential = new AzureCommunicationTokenCredential({
          token: credential.token,
          tokenRefresher: async () => (await call("meetings.credential", {})).token,
          refreshProactively: true,
        });
        const agent = await this.client.createTeamsCallAgent(this.credential);
        agent.on("incomingCall", ({ incomingCall }) => this.ring(incomingCall));
        this.agent = agent;
        return agent;
      } finally {
        this.agentStarting = undefined;
      }
    })();
    return this.agentStarting;
  }
  /** Rings for Teams calls while this window lives; `onRing` gets each call and `undefined` when it stops. */
  async listen(onRing: (ringing: Ringing | undefined) => void, fake: boolean): Promise<void> {
    this.listeningFor = onRing;
    if (!fake) await this.agentFor();
  }
  /** Stops ringing for calls; the agent goes when no call uses it. */
  async stopListening(): Promise<void> {
    this.declineRinging();
    this.listeningFor = undefined;
    if (!this.active && !this.record) await this.disposeAgent();
  }
  private ring(incoming: TeamsIncomingCall): void {
    if (!this.listeningFor || this.incoming) {
      void incoming.reject().catch(() => {});
      return;
    }
    this.incoming = incoming;
    const id = incoming.callerInfo.identifier;
    const peerId = id?.kind === "microsoftTeamsUser" ? id.microsoftTeamsUserId : undefined;
    incoming.on("callEnded", () => {
      if (this.incoming !== incoming) return;
      this.incoming = undefined;
      this.listeningFor?.(undefined);
    });
    this.listeningFor({ id: incoming.id, name: incoming.callerInfo.displayName || "Someone", peerId });
  }
  /** A test call ringing (test meeting service only). */
  fakeRing(name: string): void {
    this.listeningFor?.({ id: `fake-${Date.now()}`, name, peerId: "00000000-0000-4000-8000-00000000a1e5" });
  }
  /** Test meeting service only: Teams captions stop being available, as in a meeting that refuses them. */
  fakeCaptionsUnavailable(): void {
    if (!this.fakeTimer) return;
    this.fakeLocal = this.localAllowed;
    this.status(
      "connected",
      this.localAllowed ? "Transcribing locally (test)" : "Captions unavailable — retry captions",
      "Captions could not start: Captions feature is disabled in meeting policy. (403/45203) (test)",
    );
    if (this.localAllowed)
      this.status(
        "connected",
        "Transcribing locally (test)",
        "Teams captions unavailable — transcribing on this computer",
      );
  }
  /** Declines the ringing call (Teams' own apps stop ringing too). */
  declineRinging(): void {
    const incoming = this.incoming;
    this.incoming = undefined;
    void incoming?.reject().catch(() => {});
    this.listeningFor?.(undefined);
  }
  /** Calls someone in your organisation, by their Microsoft Entra object id. */
  async callPerson(record: MeetingRecord, peerId: string, options: CallOptions): Promise<void> {
    await this.connect(record, options, async (agent) => {
      const video = options.camera ? await this.cameraStream() : undefined;
      return agent.startCall(
        { microsoftTeamsUserId: peerId },
        {
          audioOptions: { muted: options.muted },
          ...(video ? { videoOptions: { localVideoStreams: [video] } } : {}),
        },
      );
    });
  }
  /** Answers the ringing call. */
  async answer(record: MeetingRecord, options: CallOptions): Promise<void> {
    const incoming = this.incoming;
    this.incoming = undefined;
    if (!incoming && !options.fake) throw new Error("The call stopped ringing");
    await this.connect(record, options, async () => {
      const video = options.camera ? await this.cameraStream() : undefined;
      return incoming!.accept({
        audioOptions: { muted: options.muted },
        ...(video ? { videoOptions: { localVideoStreams: [video] } } : {}),
      });
    });
  }
  private async cameraStream(): Promise<LocalVideoStream | undefined> {
    if (this.video) return this.video;
    const cameras = await this.deviceManager!.getCameras();
    const camera = this.cameraDevice ?? cameras[0];
    if (!camera) return undefined;
    this.video = new LocalVideoStream(camera);
    return this.video;
  }
  async join(record: MeetingRecord, options: CallOptions): Promise<void> {
    await this.connect(record, options, async (agent) =>
      agent.join(
        { meetingLink: record.joinUrl },
        {
          audioOptions: { muted: options.muted },
          // ACS requires exactly one stream if this list is present; [] silently stalls at None.
          ...(options.camera && this.video ? { videoOptions: { localVideoStreams: [this.video] } } : {}),
        },
      ),
    );
  }
  /** Joins a meeting, places a call or answers one, then follows it until it connects. */
  private async connect(
    record: MeetingRecord,
    options: CallOptions,
    start: (agent: TeamsCallAgent) => Promise<TeamsCall>,
  ): Promise<void> {
    if (this.active || this.record) throw new Error("A meeting is already open");
    this.record = record;
    this.leaving = false;
    this.update({ state: record.call?.direction === "outgoing" ? "Calling" : "Joining" });
    try {
      if (options.fake) {
        const peer = record.call;
        this.update({
          state: "Connected",
          muted: options.muted,
          camera: false,
          noiseSuppression: this.noiseWanted ? "deep" : "off",
          people: peer
            ? [
                {
                  id: "alex",
                  name: peer.peerName,
                  state: "Connected",
                  camera: false,
                  screen: false,
                  muted: false,
                  speaking: false,
                },
              ]
            : [
                {
                  id: "alex",
                  name: "Alex",
                  state: "Connected",
                  camera: true,
                  screen: false,
                  muted: false,
                  speaking: false,
                },
                {
                  id: "sam",
                  name: "Sam",
                  state: "Connected",
                  camera: false,
                  screen: false,
                  muted: true,
                  speaking: false,
                },
              ],
        });
        this.status("connected", "Capturing live captions (test)");
        this.update({ captionLanguages: ["en-us", "sv-se", "es-es", "de-de"] });
        if (this.captionLanguage) void this.setCaptionLanguage(this.captionLanguage).catch(this.error);
        const texts = [
          "We should review the Shop API before release.",
          "I will update the service documentation.",
          "The Portal work belongs to a different project.",
        ];
        this.fakeTimer = setInterval(() => {
          // Teams captions unavailable (test): the local transcript writes, if it is on (D-321).
          if (this.fakeLocal === false) return;
          const seq = this.fakeSequence++;
          const timestamp = new Date().toISOString();
          const local = this.fakeLocal === true;
          const caption: MeetingCaption = {
            id: `fake-${seq}`,
            speakerId: local && seq % 2 ? "you" : seq % 2 ? "sam" : "alex",
            speaker: local && seq % 2 ? "You" : seq % 2 ? "Sam" : "Alex",
            timestamp,
            text: texts[seq % texts.length]!,
            final: true,
            ...(local ? { source: "local" as const } : {}),
            ...(this.teamsTranslates && !local
              ? {
                  translated: `[${this.captionLanguage}] ${texts[seq % texts.length]!}`,
                  translatedLanguage: this.captionLanguage,
                  translatedBy: "teams" as const,
                }
              : {}),
          };
          this.update({
            people: this.state.people.map((p) => ({
              ...p,
              speaking: p.id === caption.speakerId,
              screen: p.id === "sam" ? seq >= 8 : p.screen,
            })),
          });
          this.captionChain = this.captionChain
            .then(() => call("meetings.caption", { id: record.id, caption }))
            .catch(this.error);
        }, 700);
        return;
      }
      await this.prepare();
      const agent = await this.agentFor();
      let joining = true;
      this.active = await start(agent);
      const c = this.active;
      this.spokenLanguage = options.language;
      this.watchCaptions(c);
      this.update({ noiseSuppression: this.noiseWanted ? "starting" : "off" });
      this.applyNoiseSuppression();
      const state = () => {
        this.sync();
        if (c.state === "Connected" && this.noiseStream !== c.localAudioStreams[0])
          this.applyNoiseSuppression();
        if (c.state === "Connected" && !this.teamsActive && !this.captionsStarting && !this.captionRetry) {
          this.status("connected", "Starting captions");
          void this.startCaptions(options.language, false);
        }
        if (c.state === "Disconnected" && !this.leaving && !joining) {
          const failure = this.disconnected(c);
          this.status("interrupted", "Disconnected", failure.message);
          this.error(failure);
          void this.dispose();
        }
      };
      c.on("stateChanged", state);
      c.on("isMutedChanged", () => this.sync());
      c.on("isScreenSharingOnChanged", () => this.sync());
      c.on("localVideoStreamsUpdated", () => this.sync());
      c.on("localAudioStreamsUpdated", () => this.applyNoiseSuppression());
      c.on("remoteParticipantsUpdated", (event) => {
        for (const p of event.added) this.watchParticipant(p);
        this.sync();
      });
      for (const p of c.remoteParticipants) this.watchParticipant(p);
      state();
      try {
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: Error) => {
            clearTimeout(timer);
            c.off("stateChanged", check);
            this.agent?.off("connectionStateChanged", connection);
            this.cancelJoin = undefined;
            if (error) reject(error);
            else resolve();
          };
          const check = () => {
            if (c.state === "Connected" || c.state === "InLobby") finish();
            else if (c.state === "Disconnected")
              finish(
                record.call?.direction === "outgoing"
                  ? new Error(unanswered(record.call.peerName, c.callEndReason?.code))
                  : this.disconnected(c),
              );
          };
          const connection = ({ newValue, reason }: { newValue: string; reason?: string }) => {
            if (newValue === "Disconnected")
              finish(
                new Error(
                  reason === "invalidToken"
                    ? "Microsoft could not authenticate the call. Reconnect Microsoft and try joining again."
                    : "Jig lost its connection to Microsoft before joining. Check your connection and try again.",
                ),
              );
          };
          const timer = setTimeout(
            () =>
              finish(
                new Error(
                  record.call
                    ? unanswered(record.call.peerName, 480)
                    : `Jig could not join the meeting (call state: ${c.state}; Microsoft connection: ${this.agent?.connectionState ?? "unknown"}). No meeting audio was connected. Try joining again or use Teams.`,
                ),
              ),
            90_000,
          );
          this.cancelJoin = () => finish(new Error("Joining cancelled"));
          c.on("stateChanged", check);
          this.agent!.on("connectionStateChanged", connection);
          check();
        });
      } finally {
        joining = false;
      }
    } catch (error) {
      if (this.leaving) return;
      this.status("interrupted", "Could not join", error instanceof Error ? error.message : "Joining failed");
      await this.active?.hangUp().catch(() => {});
      await this.dispose();
      this.update({ ...initial, state: record.call ? "Call ended" : "Could not join" });
      throw error;
    }
  }
  private disconnected(c: TeamsCall): Error {
    const reason = c.callEndReason;
    return new Error(
      `The Teams call disconnected${reason ? ` (code ${reason.code}, subcode ${reason.subCode ?? 0})` : ""}. Try joining again or use Teams.`,
    );
  }
  /**
   * The call's captions feature and your capabilities, taken as soon as the call exists, so the
   * SDK follows them from the start: in a Teams meeting, whether you may start captions arrives a
   * moment after Connected, and starting before that fails as "disabled in meeting policy" (D-321).
   */
  private watchCaptions(c: TeamsCall): void {
    try {
      const feature = c.feature(Features.Captions);
      const capabilities = c.feature(Features.Capabilities);
      this.captionsFeature = feature;
      this.capabilities = capabilities;
      const kindChanged = () => {
        if (this.active !== c || this.leaving) return;
        this.bindCaptions();
        if (c.state === "Connected" && !this.teamsActive) this.retryCaptionsSoon(0);
      };
      // Capabilities arrived while a try waits: try now instead of at the end of the wait.
      const capabilitiesChanged = () => {
        if (this.active !== c || this.leaving || !this.captionRetry) return;
        if (!capabilityPending(this.captionCapability())) this.retryCaptionsSoon(0);
      };
      feature.on("CaptionsKindChanged", kindChanged);
      capabilities.on("capabilitiesChanged", capabilitiesChanged);
      this.participantCleanup.push(() => {
        feature.off("CaptionsKindChanged", kindChanged);
        capabilities.off("capabilitiesChanged", capabilitiesChanged);
      });
    } catch {
      // Older calls without these features: startCaptions still tries.
    }
  }
  /** Whether you may start captions here: the meeting's capability, or the call's for a 1:1 call. */
  private captionCapability(): CaptionCapability | undefined {
    try {
      const all = this.capabilities?.capabilities;
      return this.record?.call ? all?.startLiveCallingCaptions : all?.startLiveMeetingCaptions;
    } catch {
      return undefined;
    }
  }
  /** Listens to the call's captions object (Teams captions, or ACS captions if the SDK gives those). */
  private bindCaptions(): TeamsCaptions | Captions | undefined {
    const captions = (this.captionsFeature ?? this.active?.feature(Features.Captions))?.captions as
      | TeamsCaptions
      | Captions
      | undefined;
    if (!captions || captions === this.captions) return captions;
    this.captionsCleanup?.();
    this.captions = captions;
    const received = (data: CaptionsInfo | TeamsCaptionsInfo) => {
      const captionText = "captionText" in data ? data.captionText : "";
      const text = data.spokenText || captionText;
      // Teams' translation of it, when captions are shown in another language (D-260).
      const translated =
        this.teamsTranslates && captionText && captionText !== data.spokenText ? captionText : undefined;
      const id = this.record?.id;
      if (!text || !id || this.leaving) return;
      // Captions are coming: Teams writes the transcript, whatever the events said.
      if (!this.teamsActive) this.captionsRunning();
      const speakerId = data.speaker.identifier ? getIdentifierRawId(data.speaker.identifier) : "unknown";
      const timestamp = data.timestamp.toISOString();
      const caption: MeetingCaption = {
        id: `${speakerId}:${timestamp}`,
        speakerId,
        speaker: data.speaker.displayName || "Unknown speaker",
        timestamp,
        text,
        final: data.resultType === "Final",
        ...(translated && "captionLanguage" in data
          ? { translated, translatedLanguage: data.captionLanguage, translatedBy: "teams" as const }
          : {}),
      };
      this.sendCaption(id, caption);
    };
    const activeChanged = () => this.captionsActiveChanged();
    const events = captions as TeamsCaptions;
    events.on("CaptionsReceived", received);
    events.on("CaptionsActiveChanged", activeChanged);
    this.captionsCleanup = () => {
      events.off("CaptionsReceived", received);
      events.off("CaptionsActiveChanged", activeChanged);
    };
    return captions;
  }
  private sendCaption(id: string, caption: MeetingCaption): void {
    this.captionChain = this.captionChain
      .then(() => call("meetings.caption", { id, caption }))
      .catch(this.error);
  }
  /**
   * Starts Teams captions (or joins the ones someone else started). `manual` is the Retry captions
   * button: it starts over. Otherwise a failure is retried with growing waits while that can help
   * (the meeting's capabilities still loading), and its real reason goes into the transcript (D-321).
   */
  async startCaptions(language = this.spokenLanguage, manual = true): Promise<void> {
    this.spokenLanguage = language;
    if (manual) {
      this.captionAttempt = 0;
      clearTimeout(this.captionRetry);
      this.captionRetry = undefined;
    }
    const c = this.active;
    if (!c || this.captionsStarting || this.leaving) return;
    this.captionsStarting = true;
    try {
      // Right after Connected: give the capabilities a moment instead of failing on them.
      if (capabilityPending(this.captionCapability())) await this.capabilityReady(8000);
      const captions = this.bindCaptions();
      if (!captions) throw new Error("This call has no captions feature");
      if (!captions.isCaptionsFeatureActive) {
        await captions.startCaptions({ spokenLanguage: language });
        // Teams says they started with CaptionsActiveChanged; some refusals are only silence.
        if (!(await this.captionsActive(captions, 20_000)))
          throw new Error("Teams didn't start captions within 20 seconds");
      }
      if (this.active === c) this.captionsRunning();
    } catch (error) {
      if (this.active === c && !this.leaving) this.captionsFailed(error);
    } finally {
      this.captionsStarting = false;
    }
  }
  private capabilityReady(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.capabilities?.off("capabilitiesChanged", check);
        resolve();
      };
      const check = () => {
        if (!capabilityPending(this.captionCapability())) done();
      };
      const timer = setTimeout(done, ms);
      this.capabilities?.on("capabilitiesChanged", check);
    });
  }
  private captionsActive(captions: TeamsCaptions | Captions, ms: number): Promise<boolean> {
    if (captions.isCaptionsFeatureActive) return Promise.resolve(true);
    return new Promise((resolve) => {
      const events = captions as TeamsCaptions;
      const done = (active: boolean) => {
        clearTimeout(timer);
        events.off("CaptionsActiveChanged", check);
        resolve(active);
      };
      const check = () => {
        if (captions.isCaptionsFeatureActive) done(true);
      };
      const timer = setTimeout(() => done(captions.isCaptionsFeatureActive), ms);
      events.on("CaptionsActiveChanged", check);
    });
  }
  private retryCaptionsSoon(ms: number): void {
    clearTimeout(this.captionRetry);
    this.captionRetry = setTimeout(() => {
      this.captionRetry = undefined;
      void this.startCaptions(undefined, false);
    }, ms);
  }
  /** Teams captions run: the transcript is theirs again, and the local one stops. */
  private captionsRunning(): void {
    clearTimeout(this.captionRetry);
    this.captionRetry = undefined;
    this.captionAttempt = 0;
    if (this.teamsActive) return;
    this.teamsActive = true;
    this.teamsFailed = false;
    this.status("connected", "Capturing live captions");
    const captions = this.captions;
    if (captions?.kind === "TeamsCaptions")
      this.update({ captionLanguages: (captions as TeamsCaptions).supportedCaptionLanguages ?? [] });
    if (this.captionLanguage) void this.setCaptionLanguage(this.captionLanguage).catch(this.error);
    this.followSource();
  }
  private captionsFailed(error: unknown): void {
    const decision = captionStartDecision({
      error,
      attempt: this.captionAttempt,
      capability: this.captionCapability(),
    });
    if (decision.kind === "active") {
      this.captionsRunning();
      return;
    }
    const reason = decision.reason.slice(0, 300);
    if (decision.kind === "retry") {
      this.captionAttempt++;
      // After a few seconds of trying, the local transcript covers what is said meanwhile.
      if (this.captionAttempt >= 2) this.teamsFailed = true;
      this.status(
        "connected",
        `Captions not ready: ${reason} — trying again in ${Math.round(decision.delayMs / 1000)} s`,
      );
      this.retryCaptionsSoon(decision.delayMs);
    } else {
      this.teamsFailed = true;
      this.status(
        "connected",
        "Captions unavailable — retry captions",
        `Captions could not start: ${reason}`,
      );
    }
    this.followSource();
  }
  private captionsActiveChanged(): void {
    const captions = this.captions;
    if (this.leaving || !captions) return;
    if (captions.isCaptionsFeatureActive) {
      this.captionsRunning();
      return;
    }
    if (!this.teamsActive) return;
    // They stopped (the bot left, the organiser turned them off): try once more, transcribe meanwhile.
    this.teamsActive = false;
    this.teamsFailed = true;
    this.captionAttempt = CAPTION_RETRY_DELAYS.length - 1;
    this.status("connected", "Captions stopped — trying again", "Captions stopped; speech may be missing");
    this.retryCaptionsSoon(3000);
    this.followSource();
  }
  /** Turns transcribing on this computer on or off for when Teams captions aren't available. */
  setLocalTranscription(allowed: boolean): void {
    if (this.localAllowed === allowed) return;
    this.localAllowed = allowed;
    if (this.fakeTimer && this.fakeLocal !== undefined) {
      this.fakeLocal = allowed;
      if (!allowed) this.status("connected", "Captions unavailable — retry captions");
      else
        this.status(
          "connected",
          "Transcribing locally (test)",
          "Teams captions unavailable — transcribing on this computer",
        );
      return;
    }
    this.followSource();
  }
  /** Teams captions or the local transcript, whichever should write the transcript now. */
  private followSource(): void {
    const next = nextSource(
      this.transcriptSwitch,
      { teamsActive: this.teamsActive, teamsFailed: this.teamsFailed, localAllowed: this.localAllowed },
      Date.now(),
    );
    if (next === this.transcriptSwitch) return;
    const was = this.transcriptSwitch.source;
    this.transcriptSwitch = next;
    if (next.source === "local") void this.startLocal();
    else {
      this.local?.stop();
      this.local = undefined;
      // Turned off while Teams captions still fail: say so where the status shows.
      if (was === "local" && next.source === "none")
        this.status("connected", "Captions unavailable — retry captions");
    }
  }
  private async startLocal(): Promise<void> {
    const c = this.active;
    const id = this.record?.id;
    if (!c || !id || this.local) return;
    const unavailable = await localTranscriptUnavailable().catch((e: unknown) => captionErrorText(e));
    if (this.active !== c || this.transcriptSwitch.source !== "local" || this.local) return;
    if (unavailable) {
      this.status("connected", "Captions unavailable — retry captions", unavailable);
      return;
    }
    const local = new LocalTranscript({
      call: c,
      language: this.spokenLanguage.split("-")[0] ?? "",
      microphoneId: this.deviceManager?.selectedMicrophone?.id ?? "",
      source: () => this.transcriptSwitch,
      onCaption: (caption) => {
        if (this.record?.id === id && !this.leaving) this.sendCaption(id, caption);
      },
      onNotice: (reason) => {
        if (this.record?.id === id && !this.leaving) this.status("connected", "Transcribing locally", reason);
      },
    });
    this.local = local;
    this.status(
      "connected",
      "Transcribing locally",
      "Teams captions unavailable — transcribing on this computer",
    );
    try {
      await local.start();
      // Claude translates these lines too, while you have picked a language (D-277).
      if (this.captionLanguage) void this.setCaptionLanguage(this.captionLanguage).catch(this.error);
    } catch (error) {
      local.stop();
      if (this.local === local) this.local = undefined;
      this.status(
        "connected",
        "Captions unavailable — retry captions",
        `Transcribing on this computer couldn't start: ${captionErrorText(error)}`,
      );
    }
  }
  /**
   * Shows captions in `language` ("" = as spoken). Teams translates them when it can (D-260: Teams
   * Premium, one of its languages); otherwise Teams shows them as spoken and Claude translates each
   * finished caption in main (D-277).
   */
  async setCaptionLanguage(language: string): Promise<void> {
    this.captionLanguage = language;
    this.update({ captionLanguage: language });
    let teams = false;
    const teamsCaptions =
      this.captions?.kind === "TeamsCaptions" ? (this.captions as TeamsCaptions) : undefined;
    if (this.fakeTimer) teams = Boolean(language) && this.state.captionLanguages.includes(language);
    else if (teamsCaptions) {
      if (language && this.state.captionLanguages.includes(language))
        teams = await teamsCaptions.setCaptionLanguage(language).then(
          () => true,
          () => false,
        );
      if (!teams) await teamsCaptions.setCaptionLanguage(this.spokenLanguage).catch(() => undefined);
    }
    this.teamsTranslates = teams;
    const id = this.record?.id;
    // Before captions run there is nothing to translate yet; starting them applies the choice again.
    if (!id || (!this.captions && !this.fakeTimer && !this.local)) return;
    try {
      await call("meetings.aiTranslation", { id, language: language && !teams ? language : "" });
    } catch (error) {
      this.captionLanguage = "";
      this.update({ captionLanguage: "" });
      throw error;
    }
  }
  /** Turns noise suppression on or off (`meetings.noiseSuppression`); a call in progress follows at once. */
  setNoiseSuppression(on: boolean): void {
    if (this.noiseWanted === on) return;
    this.noiseWanted = on;
    if (this.fakeTimer) this.update({ noiseSuppression: on ? "deep" : "off" });
    else if (this.active) this.applyNoiseSuppression();
  }
  /**
   * Starts or stops noise suppression on the call's microphone stream: Azure's deep noise suppression
   * where supported, else the browser's own. One change at a time, and it never fails the call.
   */
  private applyNoiseSuppression(): void {
    this.noiseChain = this.noiseChain
      .then(() => this.noiseSuppressionNow())
      .catch((error) => {
        console.warn("Noise suppression", error);
        if (this.active) this.update({ noiseSuppression: this.noiseWanted ? "unavailable" : "off" });
      });
  }
  private async noiseSuppressionNow(): Promise<void> {
    const c = this.active;
    const stream = c?.localAudioStreams[0];
    if (!c || !stream || this.leaving) return;
    const effects = stream.feature(Features.AudioEffects);
    if (this.noiseStream !== stream) {
      this.noiseStream = stream;
      const changed = () => {
        if (this.active === c && this.noiseStream === stream)
          this.update({ noiseSuppression: this.noiseState(effects) });
      };
      const failed = (error: unknown) => {
        console.warn("Noise suppression", error);
        changed();
      };
      // The microphone changed under the stream: set suppression up again on the new source.
      const source = () => this.applyNoiseSuppression();
      effects.on("effectsStarted", changed);
      effects.on("effectsStopped", changed);
      effects.on("effectsError", failed);
      stream.on("audioSourceChanged", source);
      this.participantCleanup.push(() => {
        effects.off("effectsStarted", changed);
        effects.off("effectsStopped", changed);
        effects.off("effectsError", failed);
        stream.off("audioSourceChanged", source);
      });
    }
    const active = effects.activeEffects.noiseSuppression ?? [];
    if (!this.noiseWanted) {
      if (active.length) await effects.stopEffects({ noiseSuppression: true });
    } else if (!active.includes("DeepNoiseSuppression")) {
      // Calls only: the module (WebAssembly inlined, worklet from a blob: URL) loads when first needed.
      const { DeepNoiseSuppressionEffect } = await import("@azure/communication-calling-effects");
      const deep = new DeepNoiseSuppressionEffect();
      let started = false;
      try {
        if (await effects.isSupported(deep)) {
          await effects.startEffects({ noiseSuppression: deep });
          started = true;
        }
      } catch (error) {
        console.warn("Deep noise suppression", error);
      }
      // Fallback: Chromium's own suppression (the getUserMedia constraint), which is weaker on typing.
      if (!started && !active.includes("BrowserNoiseSuppression"))
        if (await effects.isSupported("BrowserNoiseSuppression"))
          await effects.startEffects({ noiseSuppression: "BrowserNoiseSuppression" });
    }
    if (this.active === c) this.update({ noiseSuppression: this.noiseState(effects) });
  }
  private noiseState(effects: AudioEffectsFeature): NoiseSuppression {
    const active = effects.activeEffects.noiseSuppression ?? [];
    if (active.includes("DeepNoiseSuppression")) return "deep";
    if (active.includes("BrowserNoiseSuppression")) return "browser";
    return this.noiseWanted ? "unavailable" : "off";
  }
  async mute(): Promise<void> {
    if (this.fakeTimer) {
      this.update({ muted: !this.state.muted });
      return;
    }
    if (this.active?.isMuted) await this.active.unmute();
    else await this.active?.mute();
  }
  async camera(): Promise<void> {
    if (!this.active) return;
    const current = this.active.localVideoStreams.find((s) => s.mediaStreamType === "Video");
    if (current) await this.active.stopVideo(current);
    else {
      const cameras = await this.deviceManager!.getCameras();
      const camera = this.cameraDevice ?? cameras[0];
      if (!camera) throw new Error("No camera available");
      this.video = new LocalVideoStream(camera);
      await this.active.startVideo(this.video);
    }
  }
  async share(sourceId?: string): Promise<void> {
    if (this.fakeTimer) {
      this.update({ sharing: !this.state.sharing });
      return;
    }
    if (!this.active) return;
    if (this.active.isScreenSharingOn) {
      await this.active.stopScreenSharing();
      return;
    }
    if (!sourceId) throw new Error("Choose a screen or application window");
    await call("meetings.selectShare", { sourceId });
    try {
      await this.active.startScreenSharing();
    } catch (error) {
      void call("meetings.shareStopped").catch(() => {});
      throw error;
    }
  }
  async leave(): Promise<void> {
    if (!this.record || this.leaving) return;
    this.leaving = true;
    this.cancelJoin?.();
    this.local?.stop();
    clearTimeout(this.captionRetry);
    clearInterval(this.fakeTimer);
    this.fakeTimer = undefined;
    try {
      await this.active?.hangUp();
    } finally {
      await this.captionChain;
      this.status("ended", "Capture finished");
      await this.statusChain;
      const wasCall = Boolean(this.record?.call);
      await this.dispose();
      this.update({ ...initial, state: wasCall ? "Call ended" : "Meeting ended" });
    }
  }
  private async disposeAgent(): Promise<void> {
    await this.agentStarting?.catch(() => undefined);
    await this.agent?.dispose().catch(this.error);
    this.agent = undefined;
    this.credential?.dispose();
    this.credential = undefined;
    await this.client?.dispose().catch(this.error);
    this.client = undefined;
    this.deviceManager = undefined;
  }
  /** Ends what belongs to the call; the agent and client stay while Jig listens for calls. */
  private async dispose(): Promise<void> {
    clearInterval(this.fakeTimer);
    this.fakeTimer = undefined;
    for (const fn of this.participantCleanup) fn();
    this.participantCleanup = [];
    for (const view of this.views.values()) view.renderer.dispose();
    this.views.clear();
    this.preview?.dispose();
    this.preview = undefined;
    this.video?.dispose();
    this.video = undefined;
    this.local?.stop();
    this.local = undefined;
    clearTimeout(this.captionRetry);
    this.captionRetry = undefined;
    this.captionAttempt = 0;
    this.teamsActive = false;
    this.teamsFailed = false;
    this.transcriptSwitch = { source: "none", since: 0 };
    this.fakeLocal = undefined;
    this.captionsCleanup?.();
    this.captionsCleanup = undefined;
    this.captionsFeature = undefined;
    this.capabilities = undefined;
    this.active = undefined;
    this.noiseStream = undefined;
    this.record = undefined;
    this.captions = undefined;
    if (!this.listeningFor) await this.disposeAgent();
    for (const slot of this.slots.values()) slot.replaceChildren();
  }
}
