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
  settings: MeetingSettings;
  account?: string;
  fake: boolean;
  activeId?: string;
  records: MeetingRecord[];
  /** Where the live room's panels sit; the room uses the defaults until one is saved. */
  layout?: import("./meetingLayout").MeetingLayout;
}
