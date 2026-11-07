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
  /** Claude won't translate it (D-384): skipped to keep the translation live, or the request failed. */
  untranslated?: "skipped" | "failed";
}
export interface MeetingAction {
  id: string;
  title: string;
  prompt: string;
  owner: string;
  mine?: boolean;
  projectId?: string;
  evidence: string;
  /** Where it stands (D-407); missing = still to do. Old records' `queued: true` load as "queued". */
  status?: MeetingActionStatus;
  /** The chat "Run in a new chat" started for it. */
  sessionId?: string;
  /** When it's due, only when someone said so, as they said it (D-424). */
  due?: string;
  /** Where in the transcript it was said: caption timestamps (ISO) Jig matched (D-424). */
  at?: string[];
  /** The Azure DevOps card made for it with Create card… (D-425): kept through regenerated notes. */
  card?: MeetingActionCard;
}
/** A board card made for a meeting action: its number, link and the board's name in Jig. */
export interface MeetingActionCard {
  id: number;
  url: string;
  board: string;
}
/** A board the action's project follows in the Boards add-on, as Create card… offers it. */
export interface MeetingCardTarget {
  id: string;
  name: string;
  types: string[];
  /** The board's backlog type, picked first. */
  type?: string;
  /** Why a card can't go there now. */
  problem?: string;
}
/** What Create card… starts from: the project's boards, and who the card goes to when that's clear. */
export interface MeetingCardForm {
  boards: MeetingCardTarget[];
  /** The board the assignee was looked up on. */
  boardId?: string;
  /** For Azure DevOps (an e-mail); missing when the owner isn't one clear person there. */
  assignedTo?: string;
  /** Their name, to show. */
  assigneeName?: string;
  /** The description the card gets: the prompt, the evidence and where it came from. */
  description: string;
}
/**
 * A reviewed action (D-407): added to the task queue, running in a chat of its own, done by you, or
 * dismissed. Done and dismissed ones are "handled": out of the to-do list, restorable.
 */
export type MeetingActionStatus = "queued" | "running" | "done" | "dismissed";
/** Still to do: no status yet, so it can be edited, queued, run, marked done or dismissed. */
export const actionOpen = (a: Pick<MeetingAction, "status">): boolean => !a.status;
/** Marked done or dismissed: shown under Handled, with Restore. */
export const actionHandled = (a: Pick<MeetingAction, "status">): boolean =>
  a.status === "done" || a.status === "dismissed";
/**
 * Notes being written, or the last try that failed (D-424). Kept on the record so the meeting window
 * and History show the same state; a running job Jig closed during loads as failed.
 */
export interface MeetingNotesJob {
  state: "running" | "failed";
  startedAt: string;
  error?: string;
}
/** A decision, question or risk in structured notes, with who and where (caption timestamps, ISO). */
export interface MeetingNotesDecision {
  what: string;
  /** Who decided ("Unknown" when it wasn't clear). */
  by: string;
  at: string[];
}
export interface MeetingNotesQuestion {
  kind: "question" | "risk";
  text: string;
  /** Who raised it ("Unknown" when it wasn't clear). */
  raisedBy: string;
  at: string[];
}
/**
 * Generated notes as data (D-424): Jig renders them, so every meeting's notes look the same. Action
 * items are the record's `actions`, so notes and actions never drift; `notes` keeps a Markdown copy.
 */
export interface MeetingNotesDoc {
  /** One to three sentences. */
  tldr: string;
  decisions: MeetingNotesDecision[];
  questions: MeetingNotesQuestion[];
  /** The discussion by topic: only for meetings longer than about 20 minutes. */
  topics: Array<{ title: string; points: string[] }>;
  /** Who spoke, from the captions' speakers (not the AI). */
  participants: string[];
  generatedAt: string;
  /** The transcript they were written from ends here (the frozen snapshot's cutoff). */
  through: string;
  provider: import("./providers").AiProvider;
  model: string;
  /** Transcript lines left out of the middle because the meeting was too long to send whole. */
  trimmed?: number;
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
  /** Markdown notes: the generated ones' copy (D-424), or older notes written by a chat. */
  notes: string;
  /** Generated notes as data (D-424); missing on meetings whose notes came from a chat. */
  notesDoc?: MeetingNotesDoc;
  notesJob?: MeetingNotesJob;
  actions: MeetingAction[];
  /** A one-to-one Teams call instead of a meeting (`joinUrl` is empty then). */
  call?: MeetingCall;
  /** The meeting's or call's Teams chat, read while you were in it (D-270). */
  chat?: import("./meetingChat").MeetingChatMessage[];
  /** The language Claude translates this meeting's captions into, while it does (D-277). */
  aiTranslation?: string;
  /** Why Claude's last translation failed (cleared when one works again or the language changes). */
  translationError?: string;
  /** Captions skipped to keep the translation live, since the language was picked (D-384). */
  translationSkipped?: number;
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
/** The Meetings window's tabs (D-376): the calendar, your Teams chats, and the meeting history. */
export const MEETINGS_TABS = ["calendar", "chats", "meetings"] as const;
export type MeetingsTab = (typeof MEETINGS_TABS)[number];
/** What opens the Meetings window on: a tab, and for Meetings a meeting (its id, or an id's first hex digits). */
export interface MeetingsTarget {
  tab?: MeetingsTab;
  select?: string;
}

export interface MeetingOverview {
  lobbyView: LobbyView;
  /** The language captions are shown in ("" = as spoken); Teams translates (D-260). */
  captionLanguage: string;
  /** Devices picked for meetings; a kind that's missing uses System default (D-323). */
  devices: import("./meetingDevices").RememberedDevices;
  settings: MeetingSettings;
  account?: string;
  fake: boolean;
  /** The Boards add-on is on: meeting actions offer Create card… (D-425). */
  boards: boolean;
  /** Factory is on: a meeting's ⋯ offers Start a Factory run… (D-460). */
  factory?: boolean;
  activeId?: string;
  /** Jig rings for Teams calls while it runs (the meeting window listens hidden). */
  ringing: boolean;
  records: MeetingRecord[];
  /** Your meeting history folders (D-295). */
  folders: import("./meetingFolders").MeetingFolder[];
  /** The Teams chats you pinned in Jig's Chats, in pin order (D-332); not synced with Teams. */
  chatPins: string[];
  /** Where the live room's panels sit; the room uses the defaults until one is saved. */
  layout?: import("./meetingLayout").MeetingLayout;
}
