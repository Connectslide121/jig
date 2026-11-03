import {
  type AudioDeviceInfo,
  CallClient,
  type DeviceManager,
  Features,
  LocalVideoStream,
  type RemoteParticipant,
  type RemoteVideoStream,
  type TeamsCall,
  type TeamsCallAgent,
  type TeamsCaptions,
  type TeamsIncomingCall,
  type VideoDeviceInfo,
  VideoStreamRenderer,
} from "@azure/communication-calling";
import { AzureCommunicationTokenCredential, getIdentifierRawId } from "@azure/communication-common";
import type { MeetingRecord } from "../../../shared/meetings";
import { call } from "../../lib/host";

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
export interface MediaState {
  /** Languages Teams can show captions in (empty until captions run). */
  captionLanguages: string[];
  /** The one chosen ("" = as spoken). */
  captionLanguage: string;
  state: string;
  muted: boolean;
  camera: boolean;
  sharing: boolean;
  people: Person[];
}
export const INITIAL_MEDIA: MediaState = {
  captionLanguages: [],
  captionLanguage: "",
  state: "Not connected",
  muted: true,
  camera: false,
  sharing: false,
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
  private captions?: TeamsCaptions;
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
  /** Listening for Teams calls (D-254): the agent stays between calls and rings through `listeningFor`. */
  private listeningFor?: (ringing: Ringing | undefined) => void;
  private incoming?: TeamsIncomingCall;
  private agentStarting?: Promise<TeamsCallAgent>;
  private statusChain: Promise<unknown> = Promise.resolve();
  private captionChain: Promise<unknown> = Promise.resolve();
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
    const microphone =
      available.microphones.find((d) => d.id === (microphoneId || "default")) ?? available.microphones[0];
    const speaker =
      available.speakers.find((d) => d.id === (speakerId || "default")) ?? available.speakers[0];
    if (microphone) await this.deviceManager!.selectMicrophone(microphone);
    if (speaker) await this.deviceManager!.selectSpeaker(speaker);
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
    p.on("isSpeakingChanged", sync);
    p.on("displayNameChanged", sync);
    streams();
    this.participantCleanup.push(() => {
      p.off("videoStreamsUpdated", streams);
      p.off("stateChanged", sync);
      p.off("isMutedChanged", sync);
      p.off("isSpeakingChanged", sync);
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
        const texts = [
          "We should review the Shop API before release.",
          "I will update the service documentation.",
          "The Portal work belongs to a different project.",
        ];
        this.fakeTimer = setInterval(() => {
          const seq = this.fakeSequence++;
          const timestamp = new Date().toISOString();
          const caption = {
            id: `fake-${seq}`,
            speakerId: seq % 2 ? "sam" : "alex",
            speaker: seq % 2 ? "Sam" : "Alex",
            timestamp,
            text: texts[seq % texts.length]!,
            final: true,
            ...(this.captionLanguage
              ? {
                  translated: `[${this.captionLanguage}] ${texts[seq % texts.length]!}`,
                  translatedLanguage: this.captionLanguage,
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
      const state = () => {
        this.sync();
        if (c.state === "Connected") {
          this.status("connected", "Starting captions");
          void this.startCaptions(options.language);
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
  async startCaptions(language = this.spokenLanguage): Promise<void> {
    this.spokenLanguage = language;
    if (!this.active || this.captionsStarting) return;
    this.captionsStarting = true;
    try {
      const feature = this.active.feature(Features.Captions);
      const captions = feature.captions;
      if (captions.kind !== "TeamsCaptions") throw new Error("Teams captions are unavailable for this call");
      if (this.captions !== captions) {
        this.captions = captions as TeamsCaptions;
        this.captions.on("CaptionsReceived", (data) => {
          const text = data.spokenText || data.captionText;
          // Teams' translation of it, when captions are shown in another language (D-260).
          const translated =
            this.captionLanguage && data.captionText && data.captionText !== data.spokenText
              ? data.captionText
              : undefined;
          const id = this.record?.id;
          if (!text || !id || this.leaving) return;
          const speakerId = data.speaker.identifier ? getIdentifierRawId(data.speaker.identifier) : "unknown";
          const timestamp = data.timestamp.toISOString();
          const caption = {
            id: `${speakerId}:${timestamp}`,
            speakerId,
            speaker: data.speaker.displayName || "Unknown speaker",
            timestamp,
            text,
            final: data.resultType === "Final",
            ...(translated ? { translated, translatedLanguage: data.captionLanguage } : {}),
          };
          this.captionChain = this.captionChain
            .then(() => call("meetings.caption", { id, caption }))
            .catch(this.error);
        });
        this.captions.on("CaptionsActiveChanged", () => {
          if (this.leaving) return;
          this.status(
            "connected",
            this.captions?.isCaptionsFeatureActive ? "Capturing live captions" : "Captions stopped",
            this.captions?.isCaptionsFeatureActive ? undefined : "Captions stopped; speech may be missing",
          );
        });
      }
      if (!this.captions!.isCaptionsFeatureActive)
        await this.captions!.startCaptions({ spokenLanguage: language });
      this.status("connected", "Capturing live captions");
      this.update({ captionLanguages: this.captions!.supportedCaptionLanguages ?? [] });
      if (this.captionLanguage) await this.setCaptionLanguage(this.captionLanguage).catch(this.error);
    } catch (error) {
      this.status("connected", "Captions unavailable — retry captions", "Captions could not start");
      this.error(error);
    } finally {
      this.captionsStarting = false;
    }
  }
  /**
   * Shows captions in `language` ("" = as spoken). Teams translates them; that needs Teams Premium for
   * the meeting, so a refusal says so and captions stay as spoken (D-260).
   */
  async setCaptionLanguage(language: string): Promise<void> {
    this.captionLanguage = language;
    this.update({ captionLanguage: language });
    if (this.fakeTimer || !this.captions) return;
    try {
      await this.captions.setCaptionLanguage(language || this.spokenLanguage);
    } catch {
      this.captionLanguage = "";
      this.update({ captionLanguage: "" });
      throw new Error(
        "Teams didn't translate the captions. Translated captions need Teams Premium for this meeting; they stay as spoken.",
      );
    }
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
    this.active = undefined;
    this.record = undefined;
    this.captions = undefined;
    if (!this.listeningFor) await this.disposeAgent();
    for (const slot of this.slots.values()) slot.replaceChildren();
  }
}
