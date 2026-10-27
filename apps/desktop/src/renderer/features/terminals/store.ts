import { create } from "zustand";
import type { TerminalInfo } from "../../../shared/terminals";

interface TerminalsState {
  terminals: TerminalInfo[];
  /** The terminal shown in the Terminals view. */
  activeId: string | undefined;
}

export const useTerminals = create<TerminalsState>(() => ({ terminals: [], activeId: undefined }));

export function setTerminals(terminals: TerminalInfo[]): void {
  useTerminals.setState((s) => ({
    terminals,
    activeId: terminals.some((t) => t.id === s.activeId) ? s.activeId : terminals.at(-1)?.id,
  }));
}

/** Output routing: one host event listener, one writer per mounted xterm. */
const writers = new Map<string, (data: string) => void>();
export function routeTerminalData(id: string, data: string): void {
  writers.get(id)?.(data);
}
export function setTerminalWriter(id: string, writer: ((data: string) => void) | undefined): void {
  if (writer) writers.set(id, writer);
  else writers.delete(id);
}
