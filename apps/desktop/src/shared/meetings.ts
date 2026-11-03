/** Meetings are global. Project ids belong to questions and actions, never to the call. */
export interface MeetingSettings {
  tenantId: string;
  clientId: string;
  endpoint: string;
}
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
}
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
  /** Where the live room's panels sit; the room uses the defaults until one is saved. */
  layout?: import("./meetingLayout").MeetingLayout;
}
