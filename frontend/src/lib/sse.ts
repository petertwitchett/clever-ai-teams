import { TaskLedger, ProgressLedger, DialecticalCritique } from "./types";
import { api } from "./api";

export interface SSECallbacks {
  onLedgerUpdate?: (taskLedger: TaskLedger, progressLedger: ProgressLedger) => void;
  onAgentDebate?: (critique: DialecticalCritique) => void;
  onFinalChunk?: (chunk: string) => void;
  onComplete?: (finalResult?: string) => void;
  onError?: (err: any) => void;
}

export function subscribeToRunEvents(
  runId: string,
  callbacks: SSECallbacks
): () => void {
  const baseUrl = api.getBaseUrl();
  const sseUrl = `${baseUrl}/chat/runs/${runId}/events`;

  let eventSource: EventSource | null = null;

  try {
    eventSource = new EventSource(sseUrl);

    eventSource.addEventListener("ledger_update", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (callbacks.onLedgerUpdate) {
          callbacks.onLedgerUpdate(data.task_ledger, data.progress_ledger);
        }
      } catch (err) {
        console.warn("Failed to parse ledger_update:", err);
      }
    });

    eventSource.addEventListener("agent_debate", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (callbacks.onAgentDebate) {
          callbacks.onAgentDebate(data);
        }
      } catch (err) {
        console.warn("Failed to parse agent_debate:", err);
      }
    });

    eventSource.addEventListener("final_chunk", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (callbacks.onFinalChunk) {
          callbacks.onFinalChunk(data.text || data.chunk || "");
        }
      } catch {
        if (callbacks.onFinalChunk) {
          callbacks.onFinalChunk(e.data);
        }
      }
    });

    eventSource.addEventListener("complete", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (callbacks.onComplete) {
          callbacks.onComplete(data.final_result);
        }
      } catch {
        if (callbacks.onComplete) {
          callbacks.onComplete();
        }
      }
      eventSource?.close();
    });

    eventSource.onerror = (err) => {
      // If live SSE is unavailable (e.g. mock run), fallback to simulated progress
      console.warn("SSE connection error or completed:", err);
      eventSource?.close();
      if (callbacks.onError) {
        callbacks.onError(err);
      }
    };
  } catch (err) {
    if (callbacks.onError) {
      callbacks.onError(err);
    }
  }

  return () => {
    if (eventSource) {
      eventSource.close();
    }
  };
}
