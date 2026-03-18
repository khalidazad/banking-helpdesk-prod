// src/server.js
// Production Express server with security middleware, rate limiting, and logging.
//
// MIDDLEWARE STACK (order matters):
//   1. helmet    — sets secure HTTP headers (XSS, clickjacking protection, etc.)
//   2. cors      — allows requests only from the configured frontend origin
//   3. morgan    — HTTP request logging (dev: colored, prod: combined format)
//   4. json      — parses request body, with a 10kb size limit
//   5. rateLimit — prevents abuse (30 req/min per IP on API routes)
//   6. routes    — your actual API endpoints
//   7. 404       — catches unknown routes
//   8. errors    — centralized error handler

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import chatRoute from "./routes/ask.js";
import conversationRoute from "./routes/conversation.js";
import { errorHandler } from "./middleware/errorHandler.js";
import logger from "./utils/logger.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

// ── Security headers ─────────────────────────────────────────────────────────
// helmet() sets ~15 HTTP response headers to protect against common web vulnerabilities.
// E.g. X-Content-Type-Options, Strict-Transport-Security, X-Frame-Options
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────────────────────────
// Only allow requests from our configured frontend origin.
// In production set ALLOWED_ORIGIN to your Vercel URL.
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:3001",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

// ── Request logging ───────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ── Body parsing ──────────────────────────────────────────────────────────────
// 10kb limit prevents large payload attacks
app.use(express.json({ limit: "10kb" }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// 30 requests per minute per IP on all API routes.
// Adjust max based on your expected usage.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 30,
  standardHeaders: true,  // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait before trying again." },
});
app.use("/api", apiLimiter);

// ── Health check ─────────────────────────────────────────────────────────────
// Used by Render to verify the service is alive.
// Also used by the smoke test script.
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", chatRoute);
app.use("/api", conversationRoute);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Centralized error handler ─────────────────────────────────────────────────
// Must be last. Catches any error passed via next(error) in route handlers.
app.use(errorHandler);

// ── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info("Banking Helpdesk API started", {
    env:     process.env.NODE_ENV ?? "development",
    port:    PORT,
    origin:  process.env.ALLOWED_ORIGIN ?? "http://localhost:3001",
    embeddings: process.env.EMBEDDING_PROVIDER ?? "not set",
  });
});
