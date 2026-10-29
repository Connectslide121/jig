import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { EvidenceNote } from "../../shared/learning";
import { readJson, writeJson, writeText } from "../state/jsonStore";

/**
 * What Jig knows about you (Learning 2), all local and editable: notes Claude saved from chats
 * (`evidence.json`) and the profile (`profile.md`), a readable file describing how you work.
 */
const EvidenceFile = z.object({ notes: z.array(z.custom<EvidenceNote>()).default([]) });

export const PROFILE_TEMPLATE = `# How I work

<!-- Jig reads this before suggesting anything, and proposes additions you can accept. Edit freely. -->

## Stack

## How I release and deploy

## Tools I use outside Jig

## Preferences

## What I already know well
`;

export class KnowledgeStore {
  private notes: EvidenceNote[] | undefined;

  constructor(
    private readonly files: { evidence: string; profile: string },
    private readonly onChange: () => void = () => {},
  ) {}

  async list(): Promise<EvidenceNote[]> {
    this.notes ??= (await readJson(this.files.evidence, EvidenceFile)).notes;
    return this.notes;
  }

  private async save() {
    await writeJson(this.files.evidence, { notes: (await this.list()).slice(-500) });
    this.onChange();
  }

  async add(input: Omit<EvidenceNote, "id" | "at">, now = new Date()): Promise<EvidenceNote> {
    const note: EvidenceNote = { id: randomUUID().slice(0, 8), at: now.toISOString(), ...input };
    (await this.list()).push(note);
    await this.save();
    return note;
  }

  async remove(id: string): Promise<boolean> {
    const list = await this.list();
    const index = list.findIndex((n) => n.id === id);
    if (index < 0) return false;
    list.splice(index, 1);
    await this.save();
    return true;
  }

  async clear(): Promise<void> {
    this.notes = [];
    await this.save();
  }

  /** Notes of the last `days` days. */
  async recent(days: number, now = new Date()): Promise<EvidenceNote[]> {
    const since = new Date(now.getTime() - days * 86_400_000).toISOString();
    return (await this.list()).filter((n) => n.at >= since);
  }

  /** The profile; the template when there is none yet. */
  async profile(): Promise<{ text: string; exists: boolean }> {
    try {
      return { text: await readFile(this.files.profile, "utf8"), exists: true };
    } catch {
      return { text: PROFILE_TEMPLATE, exists: false };
    }
  }

  async setProfile(text: string): Promise<void> {
    await writeText(this.files.profile, text.endsWith("\n") ? text : `${text}\n`);
    this.onChange();
  }

  /** Adds lines under a heading (made if missing), or at the end. */
  async addToProfile(lines: string[], heading?: string): Promise<string> {
    const { text } = await this.profile();
    const next = appendToSection(text, lines, heading);
    await this.setProfile(next);
    return next;
  }
}

/** The profile with `lines` (as bullets) added under `## heading` (made at the end if missing). Pure. */
export function appendToSection(text: string, lines: string[], heading?: string): string {
  const bullets = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith("- ") ? l : `- ${l}`));
  if (!bullets.length) return text;
  const body = text.replace(/\s*$/, "");
  if (!heading) return `${body}\n\n${bullets.join("\n")}\n`;
  const all = body.split("\n");
  const at = all.findIndex(
    (l) =>
      l
        .replace(/^#+\s*/, "")
        .trim()
        .toLowerCase() === heading.trim().toLowerCase() && /^#+\s/.test(l),
  );
  if (at < 0) return `${body}\n\n## ${heading.trim()}\n\n${bullets.join("\n")}\n`;
  let end = all.findIndex((l, i) => i > at && /^#{1,2}\s/.test(l));
  if (end < 0) end = all.length;
  // After the section's last non-empty line.
  let insert = end;
  while (insert > at + 1 && !all[insert - 1]!.trim()) insert--;
  const head = all.slice(0, insert);
  if (insert === at + 1) head.push("");
  return `${[...head, ...bullets, ...(end < all.length ? ["", ...all.slice(end)] : [])].join("\n")}\n`;
}
