/**
 * Structured request/response logs for OpenRouter / AI gateway calls.
 * Default ON so Studio burns can be investigated from the worker terminal.
 * Disable: AI_GATEWAY_REQUEST_LOG=0
 * Truncate long text: AI_GATEWAY_LOG_MAX_CHARS (default 4000)
 */

export type GatewayCallKind =
  | "llm_text"
  | "llm_json"
  | "tts"
  | "stt"
  | "embed";

export type GatewayCallLogEntry = {
  ts: string;
  kind: GatewayCallKind;
  /** App-level call type, e.g. remix_shorten_segment / remix_translate */
  type?: string;
  model: string;
  host?: string;
  status: "ok" | "error";
  durationMs: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
};

export const isGatewayRequestLogEnabled = (): boolean => {
  const raw = process.env.AI_GATEWAY_REQUEST_LOG?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") {
    return false;
  }
  return true;
};

export const getGatewayLogMaxChars = (): number => {
  const n = Number(process.env.AI_GATEWAY_LOG_MAX_CHARS ?? "4000");
  if (!Number.isFinite(n) || n < 32) return 4000;
  return Math.floor(n);
};

export const truncateForGatewayLog = (
  text: string,
  maxChars: number = getGatewayLogMaxChars(),
): { text: string; truncated: boolean; length: number } => {
  const length = text.length;
  if (length <= maxChars) {
    return { text, truncated: false, length };
  }
  return {
    text: `${text.slice(0, maxChars)}…[truncated ${length - maxChars} chars]`,
    truncated: true,
    length,
  };
};

const hostFromUrl = (url: string | undefined): string | undefined => {
  if (!url?.trim()) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 80);
  }
};

export const logGatewayCall = (entry: Omit<GatewayCallLogEntry, "ts">): void => {
  if (!isGatewayRequestLogEnabled()) return;

  const line: GatewayCallLogEntry = {
    ts: new Date().toISOString(),
    ...entry,
    host: entry.host ?? hostFromUrl(process.env.AI_GATEWAY_URL),
  };

  // One JSON line — easy to grep in worker terminal / ship to log drain.
  console.info(`[ai-gateway] ${JSON.stringify(line)}`);
};
