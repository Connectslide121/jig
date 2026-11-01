import {
  type AudioDeviceInfo,
  CallClient,
  type DeviceManager,
  Features,
  LocalVideoStream,
  type RemoteParticipant,
  type TeamsCall,
  type TeamsCallAgent,
  type TeamsCaptions,
  type VideoDeviceInfo,
  VideoStreamRenderer,
} from "@azure/communication-calling";
import { AzureCommunicationTokenCredential, getIdentifierRawId } from "@azure/communication-common";
import type { MeetingRecord } from "../../../shared/meetings";
import { call } from "../../lib/host";

export interface MediaState {
  state: string;
  muted: boolean;
  camera: boolean;
  sharing: boolean;
  participants: string[];
  hasVideo: boolean;
}
const initial: MediaState = {
  state: "Not connected",
  muted: true,
  camera: false,
  sharing: false,
  participants: [],
  hasVideo: false,
};

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
  private renderers: VideoStreamRenderer[] = [];
  private preview?: VideoStreamRenderer;
  private cameraDevice?: VideoDeviceInfo;
  private previewVersion = 0;
  private participantCleanup: Array<() => void> = [];
  private listeners = new Set<(state: MediaState) => void>();
  private state = initial;
  private paintVersion = 0;
  private fakeTimer?: ReturnType<typeof setInterval>;
  private fakeSequence = 0;
  private captionsStarting = false;
  private leaving = false;
  private spokenLanguage = "en-us";
  private statusChain: Promise<unknown> = Promise.resolve();
  private captionChain: Promise<unknown> = Promise.resolve();
  private canvas?: HTMLElement;
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
  setCanvas(target: HTMLElement | null): void {
    this.canvas = target ?? undefined;
    if (target) void this.paint();
  }
  private async paint(): Promise<void> {
    const version = ++this.paintVersion;
    for (const r of this.renderers) r.dispose();
    this.renderers = [];
    const target = this.canvas;
    if (!target) return;
    target.replaceChildren();
    if (!this.active) return;
    const streams = this.active.remoteParticipants.flatMap((p) =>
      p.videoStreams
        .filter((v) => v.isAvailable)
        .map((stream) => ({ stream, name: p.displayName || "Participant" })),
    );
    const sharing = streams.filter((s) => s.stream.mediaStreamType === "ScreenSharing");
    this.update({ hasVideo: streams.length > 0 });
    for (const { stream, name } of (sharing.length ? sharing : streams).slice(0, 6)) {
      const renderer = new VideoStreamRenderer(stream);
      this.renderers.push(renderer);
      try {
        const view = await renderer.createView({ scalingMode: "Fit" });
        if (version !== this.paintVersion) {
          renderer.dispose();
          continue;
        }
        const tile = document.createElement("div");
        tile.className = "relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg bg-surface";
        tile.setAttribute("aria-label", name);
        tile.append(view.target);
        target.append(tile);
      } catch (error) {
        if (version === this.paintVersion) this.error(error);
      }
    }
  }
  private watchParticipant(p: RemoteParticipant): void {
    const sync = () => {
      this.sync();
      void this.paint();
    };
    const streams = () => {
      for (const stream of p.videoStreams) {
        stream.on("isAvailableChanged", sync);
        this.participantCleanup.push(() => stream.off("isAvailableChanged", sync));
      }
      sync();
    };
    p.on("videoStreamsUpdated", streams);
    p.on("stateChanged", sync);
    streams();
    this.participantCleanup.push(() => {
      p.off("videoStreamsUpdated", streams);
      p.off("stateChanged", sync);
    });
  }
  private sync(): void {
    const c = this.active;
    if (!c) return;
    this.update({
      state: c.state,
      muted: c.isMuted,
      camera: c.localVideoStreams.some((s) => s.mediaStreamType === "Video"),
      sharing: c.isScreenSharingOn,
      participants: c.remoteParticipants.map((p) => `${p.displayName || "Participant"} · ${p.state}`),
    });
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
          participants: ["Alex · Connected", "Sam · Connected"],
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
      this.active = this.agent.join(
        { meetingLink: record.joinUrl },
        {
          audioOptions: { muted: options.muted },
          videoOptions: { localVideoStreams: options.camera && this.video ? [this.video] : [] },
        },
      );
      const c = this.active;
      const state = () => {
        this.sync();
        if (c.state === "Connected") {
          this.status("connected", "Starting captions");
          void this.startCaptions(options.language);
        }
        if (c.state === "Disconnected" && !this.leaving) {
          this.status("interrupted", "Disconnected", "The call disconnected");
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
        void this.paint();
      });
      for (const p of c.remoteParticipants) this.watchParticipant(p);
      state();
    } catch (error) {
      this.status("interrupted", "Could not join", "Joining failed");
      await this.dispose();
      throw error;
    }
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
    this.paintVersion++;
    for (const fn of this.participantCleanup) fn();
    this.participantCleanup = [];
    for (const r of this.renderers) r.dispose();
    this.renderers = [];
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
    this.canvas?.replaceChildren();
  }
}
