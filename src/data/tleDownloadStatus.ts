export type TleDownloadIssue = {
  kind: "timeout" | "network" | "http" | "invalid";
  message: string;
  status?: number;
};
export type TleDownloadStatus = {
  phase: "idle" | "loading" | "ready" | "failed" | "waiting";
  url: string | null;
  attemptedAtMs: number | null;
  retryAtMs: number | null;
  issue: TleDownloadIssue | null;
};
const INITIAL: TleDownloadStatus = {
  phase: "idle", url: null, attemptedAtMs: null, retryAtMs: null, issue: null
};
let current = INITIAL;
const listeners = new Set<() => void>();
export const tleDownloadStatus = (): TleDownloadStatus => current;
export function subscribeTleDownloadStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setTleDownloadStatus(next: TleDownloadStatus): void {
  current = next;
  listeners.forEach((listener) => listener());
}
export function resetTleDownloadStatus(): void { setTleDownloadStatus(INITIAL); }
