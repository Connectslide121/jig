import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type KnowledgeDoc, uniqueDocName } from "../../shared/knowledge";
import { readJson, writeJson, writeText } from "../state/jsonStore";
import { jigHome } from "../state/paths";

const index = z.object({
  docs: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        chars: z.number(),
        addedAt: z.string(),
        source: z.enum(["file", "claude.ai"]),
      }),
    )
    .default([]),
});

/** The longest document Jig keeps (about 250k tokens); longer ones are cut and say so. */
export const MAX_DOC_CHARS = 1_000_000;

/**
 * Each project's knowledge (D-256): `knowledge/<projectId>/index.json` and one text file per
 * document. Changes are serialized per store, so adding many at once never loses one.
 */
export class KnowledgeStore {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly root = join(jigHome(), "knowledge")) {}
  private dir(projectId: string): string {
    if (!/^[\w-]{1,100}$/.test(projectId)) throw new Error("Unknown project");
    return join(this.root, projectId);
  }
  private file(projectId: string, id: string): string {
    if (!/^[\w-]{1,100}$/.test(id)) throw new Error("Unknown document");
    return join(this.dir(projectId), "docs", `${id}.txt`);
  }
  async list(projectId: string): Promise<KnowledgeDoc[]> {
    return (await readJson(join(this.dir(projectId), "index.json"), index)).docs;
  }
  private change<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn);
    this.chain = next.catch(() => undefined);
    return next;
  }
  add(projectId: string, name: string, text: string, source: KnowledgeDoc["source"]): Promise<KnowledgeDoc> {
    return this.change(async () => {
      const docs = await this.list(projectId);
      const body =
        text.length > MAX_DOC_CHARS
          ? `${text.slice(0, MAX_DOC_CHARS)}\n\n[Cut by Jig: the document is longer than ${MAX_DOC_CHARS} characters.]`
          : text;
      const doc: KnowledgeDoc = {
        id: randomUUID(),
        name: uniqueDocName(
          name,
          docs.map((d) => d.name),
        ),
        chars: body.length,
        addedAt: new Date().toISOString(),
        source,
      };
      await writeText(this.file(projectId, doc.id), body);
      await writeJson(join(this.dir(projectId), "index.json"), { docs: [...docs, doc] });
      return doc;
    });
  }
  remove(projectId: string, id: string): Promise<void> {
    return this.change(async () => {
      const docs = await this.list(projectId);
      await writeJson(join(this.dir(projectId), "index.json"), { docs: docs.filter((d) => d.id !== id) });
      await rm(this.file(projectId, id), { force: true });
    });
  }
  async read(projectId: string, id: string): Promise<{ doc: KnowledgeDoc; text: string }> {
    const doc = (await this.list(projectId)).find((d) => d.id === id);
    if (!doc) throw new Error("That document isn't in this project's knowledge");
    return { doc, text: await readFile(this.file(projectId, id), "utf8") };
  }
  /** A removed project's knowledge goes with it. */
  removeProject(projectId: string): Promise<void> {
    return this.change(() => rm(this.dir(projectId), { recursive: true, force: true }));
  }
}
