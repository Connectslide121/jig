/**
 * The natural voices Motion offers (a copy of `NATURAL_VOICES` in Jig's `shared/speech.ts`, since
 * add-ons import only from `addons/`, D-415; a test keeps the two equal).
 */
export const VOICES: Array<{ id: string; name: string; language: "en-us" | "en-gb" | "es" }> = [
  ["af_heart", "Heart"],
  ["af_bella", "Bella"],
  ["af_nicole", "Nicole"],
  ["af_aoede", "Aoede"],
  ["af_kore", "Kore"],
  ["af_sarah", "Sarah"],
  ["af_nova", "Nova"],
  ["af_alloy", "Alloy"],
  ["af_sky", "Sky"],
  ["am_michael", "Michael"],
  ["am_fenrir", "Fenrir"],
  ["am_puck", "Puck"],
  ["bf_emma", "Emma"],
  ["bf_isabella", "Isabella"],
  ["bm_george", "George"],
  ["bm_fable", "Fable"],
  ["ef_dora", "Dora"],
  ["em_alex", "Alex"],
  ["em_santa", "Santa"],
].map(([id = "", name = ""]) => ({
  id,
  name,
  language: id[0] === "b" ? "en-gb" : id[0] === "e" ? "es" : "en-us",
}));

export const LANGUAGE_LABEL = { "en-us": "American", "en-gb": "British", es: "Spanish" } as const;
