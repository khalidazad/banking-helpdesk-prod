// src/routes/ask.js
// POST /api/chat — main endpoint: validates input, runs RAG pipeline, returns answer
//
// INPUT VALIDATION with Zod:
// We validate every incoming request before it touches any service.
// This prevents:
//   - Empty questions crashing the LLM call
//   - Invalid UUIDs causing Prisma foreign key errors
//   - Oversized payloads (prompt injection attempts)
//
// INTERVIEW EXPLANATION:
// "I use Zod for runtime schema validation at the API boundary — same idea as
// TypeScript but enforced at runtime with clear error messages."

import express from "express";
import { z } from "zod";
import askHelpdesk from "../rag/ragAgent.js";

const router = express.Router();

// Define the expected shape of the request body
const chatSchema = z.object({
  conversationId: z
    .string()
    .uuid({ message: "conversationId must be a valid UUID" }),
  question: z
    .string()
    .min(1, { message: "Question cannot be empty" })
    .max(2000, { message: "Question too long (max 2000 characters)" }),
});

router.post("/chat", async (req, res, next) => {
  // ── Validate request body ────────────────────────────────────────────────
  const parsed = chatSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { conversationId, question } = parsed.data;

  // ── Run the RAG pipeline ─────────────────────────────────────────────────
  try {
    const answer = await askHelpdesk(conversationId, question);
    res.json({ answer });
  } catch (error) {
    next(error); // Pass to centralized error handler
  }
});

export default router;
