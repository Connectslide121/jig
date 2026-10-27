import { LoaderCircle } from "lucide-react";
import { cn } from "./cn";

export function Spinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const s = { sm: "size-3.5", md: "size-4", lg: "size-6" }[size];
  return <LoaderCircle aria-label="Loading" className={cn("animate-spin text-muted", s, className)} />;
}
