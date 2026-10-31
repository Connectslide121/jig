import type { JigConfig } from "./config";

export interface LibrarySkill {
  id: string;
  title: string;
  category: string;
  description: string;
  skillName: string;
  author: string;
  source: string;
  revision: string;
  license: string;
}

export interface SkillDetails extends LibrarySkill {
  instructions: string;
}

/** A global off switch wins; otherwise new projects are included unless explicitly excluded. */
export function skillEnabled(config: Pick<JigConfig, "skills">, id: string, projectId?: string): boolean {
  const policy = config.skills.overrides[id];
  return policy?.enabled !== false && (!projectId || !policy?.excludedProjects.includes(projectId));
}

/** Default product behavior is small enough to include without relying on skill invocation. */
export function aiTransparencyGuidance(config: Pick<JigConfig, "skills">, projectId?: string): string {
  return skillEnabled(config, "ai-feature-ux", projectId)
    ? "When creating or substantially changing a user-facing AI feature, include a concise, accessible disclosure identifying the AI involvement and its limitations near the interaction or output, in the app's language. Examples: 'AI assistant · AI can make mistakes' or 'AI-generated summary · Check important details'. Reuse an existing suitable notice without duplicating it; reserve its space to avoid layout shifts. This belongs in the product, not as boilerplate on your chat replies. Apply the AI feature UX skill for deeper design decisions when relevant. A generic accuracy warning is not proof of EU AI Act compliance; check current official requirements when a feature needs legal assessment."
    : "";
}
