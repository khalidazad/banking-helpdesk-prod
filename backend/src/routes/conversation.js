// src/routes/conversation.js
// POST /api/conversation — creates a new conversation session
//
// Called once when the frontend loads. Returns a conversationId (UUID)
// that is then sent with every subsequent /api/chat request to group messages.

import express from "express";
import prisma from "../db/prisma.js";

const router = express.Router();

router.post("/conversation", async (req, res, next) => {
  try {
    const conversation = await prisma.conversation.create({
      data: {},
      select: { id: true, createdAt: true }, // only return what the client needs
    });

    res.status(201).json(conversation);
  } catch (error) {
    // Pass to centralized error handler in server.js
    next(error);
  }
});

// GET /api/conversation/:id/messages — fetch all messages for a conversation
// Useful for re-hydrating chat history on page refresh
router.get("/conversation/:id/messages", async (req, res, next) => {
  try {
    const { id } = req.params;

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    res.json({ messages });
  } catch (error) {
    next(error);
  }
});

export default router;
