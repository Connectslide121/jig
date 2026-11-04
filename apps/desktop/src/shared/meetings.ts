/** Meetings are global. Project ids belong to questions and actions, never to the call. */
export interface MeetingSettings {
  tenantId: string;
  clientId: string;
  endpoint: string;
}
/**
 * Languages Claude can translate captions into when Teams can't (D-277); offered with the ones Teams
 * lists for the call.
 */
export const AI_CAPTION_LANGUAGES = [
  "en-us",
  "sv-se",
  "es-es",
  "eu-es",
  "ca-es",
  "fr-fr",
  "de-de",
  "it-it",
  "pt-pt",
  "nl-nl",
  "da-dk",
  "nb-no",
  "fi-fi",
  "pl-pl",
  "ja-jp",
  "zh-cn",
];
export interface MeetingCaption {
  id: string;
  speakerId: string;
  speaker: string;
  timestamp: string;
  text: string;
  final: boolean;
  /** The caption in the language you chose (Teams' translated captions), when it isn't the spoken one. */
  translated?: string;
  translatedLanguage?: string;
  /** Who translated it: Teams (Premium) or Claude (D-277). */
  translatedBy?: "teams" | "ai";
  /** Transcribed on this computer (Whisper) because Teams captions weren't available (D-321). */
  source?: "local";
}
export interface MeetingAction {
  id: string;
  title: string;
  prompt: string;
  owner: string;
  mine?: boolean;
  projectId?: string;
  evidence: string;
  queued?: boolean;
}
export interface MeetingRecord {
  id: string;
  title: string;
  joinUrl: string;
  startedAt: string;
  endedAt?: string;
  status: "joining" | "connected" | "ended" | "interrupted";
  capture: string;
  captions: MeetingCaption[];
  gaps: Array<{ at: string; reason: string }>;
  notes: string;
  actions: MeetingAction[];
  /** A one-to-one Teams call instead of a meeting (`joinUrl` is empty then). */
  call?: MeetingCall;
  /** The meeting's or call's Teams chat, read while you were in it (D-270). */
  chat?: import("./meetingChat").MeetingChatMessage[];
  /** The language Claude translates this meeting's captions into, while it does (D-277). */
  aiTranslation?: string;
  /** Why Claude's last translation failed (cleared when one works again or the language changes). */
  translationError?: string;
  /**
   * The history folder you put it in (D-295): a folder's id, `null` when you took it out of every
   * folder, missing to let it go to its recurring meeting's folder (`meetingFolders.ts`).
   */
  folder?: string | null;
}
/**
 * What the lobby asks the call window to do (D-292): check devices and join a meeting (an empty link
 * asks for one), place a call to someone, or only come to the front.
 */
export type MeetingStart =
  | { kind: "join"; url: string; title: string }
  | { kind: "call"; peerId: string; peerName: string; camera: boolean }
  | { kind: "show" };

/** Who a Teams call was with: their Microsoft Entra object id, so Jig can call them back. */
export interface MeetingCall {
  peerId: string;
  peerName: string;
  direction: "outgoing" | "incoming";
}
/** Someone in your organisation you can call. */
export interface MeetingPerson {
  id: string;
  name: string;
  email: string;
  title?: string;
}
export interface MeetingEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  organizer: string;
  joinUrl?: string;
}
export type LobbyView = "agenda" | "week";

export interface MeetingOverview {
  lobbyView: LobbyView;
  /** The language captions are shown in ("" = as spoken); Teams translates (D-260). */
  captionLanguage: string;
  settings: MeetingSettings;
  account?: string;
  fake: boolean;
  activeId?: string;
  /** Jig rings for Teams calls while it runs (the meeting window listens hidden). */
  ringing: boolean;
  records: MeetingRecord[];
  /** Your meeting history folders (D-295). */
  folders: import("./meetingFolders").MeetingFolder[];
  /** Where the live room's panels sit; the room uses the defaults until one is saved. */
  layout?: import("./meetingLayout").MeetingLayout;
}
