/**
 * Tiny namespaced logger with production gating.
 *
 *   const log = createLogger("chat");
 *   log.info("request received", { threadId, msgCount });
 *
 * In production, only `warn` and `error` are emitted. Pass primitives in
 * `data` — never message content or other PII.
 */

type Level = "debug" | "info" | "warn" | "error";

const PRIORITY: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: Level =
  process.env.NODE_ENV === "production" ? "warn" : "debug";

const enabled = (level: Level) => PRIORITY[level] >= PRIORITY[MIN_LEVEL];

type LogData = Record<string, string | number | boolean | null | undefined>;

function format(data?: LogData): string {
  if (!data) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    parts.push(`${k}=${v}`);
  }
  return parts.length > 0 ? " " + parts.join(" ") : "";
}

export interface Logger {
  debug: (message: string, data?: LogData) => void;
  info: (message: string, data?: LogData) => void;
  warn: (message: string, data?: LogData) => void;
  error: (message: string, error?: unknown, data?: LogData) => void;
}

// This module is the one place we deliberately call `console.log`; the
// `no-console` lint rule exists to push every other module through here.
/* eslint-disable no-console */
export function createLogger(namespace: string): Logger {
  const tag = `[${namespace}]`;
  return {
    debug: (msg, data) => {
      if (enabled("debug")) console.log(tag, msg + format(data));
    },
    info: (msg, data) => {
      if (enabled("info")) console.log(tag, msg + format(data));
    },
    warn: (msg, data) => {
      if (enabled("warn")) console.warn(tag, msg + format(data));
    },
    error: (msg, err, data) => {
      if (enabled("error")) console.error(tag, msg + format(data), err);
    },
  };
}
