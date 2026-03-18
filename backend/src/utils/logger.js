// src/utils/logger.js
// Simple structured logger.
// In production, swap this for Winston or Pino for log aggregation
// (e.g. Render's built-in log viewer, Datadog, Logtail).
//
// Usage:
//   import logger from "../utils/logger.js";
//   logger.info("Server started", { port: 3000 });
//   logger.error("DB connection failed", { error: err.message });

const isDev = process.env.NODE_ENV !== "production";

function format(level, message, meta = {}) {
  if (isDev) {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    const colors = { info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m" };
    return `${colors[level] ?? ""}[${level.toUpperCase()}]\x1b[0m ${message}${metaStr}`;
  }
  // Production: structured JSON for log aggregators
  return JSON.stringify({ level, message, ...meta, ts: new Date().toISOString() });
}

const logger = {
  info:  (msg, meta) => console.log(format("info", msg, meta)),
  warn:  (msg, meta) => console.warn(format("warn", msg, meta)),
  error: (msg, meta) => console.error(format("error", msg, meta)),
};

export default logger;
