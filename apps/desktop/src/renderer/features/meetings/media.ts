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
  state: string;
  muted: boolean;
  camera: boolean;
  sharing: boolean;
  people: Person[];
}
export const INITIAL_MEDIA: MediaState = {
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
  async join(
    record: MeetingRecord,
    options: { muted: boolean; camera: boolean; language: string; fake: boolean },
  ): Promise<void> {
    if (this.active || this.record) throw new Error("A meeting is already open");
    this.record = record;
    this.leaving = false;
    this.update({ state: "Joining" });
    try {
      if (options.fake) {
        this.update({
          state: "Connected",
          muted: options.muted,
          camera: false,
          people: [
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
      const credential = await call("meetings.credential", { id: record.id });
      this.credential = new AzureCommunicationTokenCredential({
        token: credential.token,
        tokenRefresher: async () => (await call("meetings.credential", { id: record.id })).token,
        refreshProactively: true,
      });
      this.agent = await this.client!.createTeamsCallAgent(this.credential);
      let joining = true;
      this.active = this.agent.join(
        { meetingLink: record.joinUrl },
        {
          audioOptions: { muted: options.muted },
          // ACS requires exactly one stream if this list is present; [] silently stalls at None.
          ...(options.camera && this.video ? { videoOptions: { localVideoStreams: [this.video] } } : {}),
        },
      );
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
            else if (c.state === "Disconnected") finish(this.disconnected(c));
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
                  `Jig could not join the meeting (call state: ${c.state}; Microsoft connection: ${this.agent?.connectionState ?? "unknown"}). No meeting audio was connected. Try joining again or use Teams.`,
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
      this.update({ ...initial, state: "Could not join" });
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
    } catch (error) {
      this.status("connected", "Captions unavailable — retry captions", "Captions could not start");
      this.error(error);
    } finally {
      this.captionsStarting = false;
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
    await this.active.startScreenSharing();
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
      await this.dispose();
      this.update({ ...initial, state: "Meeting ended" });
    }
  }
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
    await this.agent?.dispose().catch(this.error);
    this.agent = undefined;
    this.credential?.dispose();
    this.credential = undefined;
    this.active = undefined;
    this.record = undefined;
    this.captions = undefined;
    await this.client?.dispose().catch(this.error);
    this.client = undefined;
    this.deviceManager = undefined;
    for (const slot of this.slots.values()) slot.replaceChildren();
  }
}
