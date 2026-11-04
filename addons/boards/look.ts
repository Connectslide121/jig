import { BookOpen, Bug, CircleDot, Crown, SquareCheck, Trophy } from "lucide-react";

/** A work item type's icon and colour, the same on every board (like Azure DevOps' own colours). */
export function typeLook(type: string) {
  const t = type.toLowerCase();
  if (t === "bug") return { Icon: Bug, text: "text-danger", edge: "bg-danger" };
  if (t === "task") return { Icon: SquareCheck, text: "text-warning", edge: "bg-warning" };
  if (t === "epic") return { Icon: Crown, text: "text-accent", edge: "bg-accent" };
  if (t === "feature") return { Icon: Trophy, text: "text-success", edge: "bg-success" };
  if (t.includes("story") || t.includes("backlog") || t === "requirement")
    return { Icon: BookOpen, text: "text-info", edge: "bg-info" };
  return { Icon: CircleDot, text: "text-muted", edge: "bg-line-strong" };
}
