// src/rag/ragAgent.js
// The core RAG (Retrieval-Augmented Generation) pipeline.
//
// WHAT IS RAG?
// Instead of asking the LLM to answer from its training data (which may be
// outdated or hallucinated), RAG:
//   1. Converts the user's question into an embedding vector
//   2. Searches the vector store for the most similar document chunks
//   3. Injects those chunks as "context" into the LLM prompt
//   4. The LLM answers ONLY based on that context
//
// This is critical for banking: the model cannot make up refund policies,
// account rules, or regulatory information.
//
// PIPELINE:
//   User question
//     → Embed question → Pinecone similarity search → top-K doc chunks
//     → Build structured messages (system + history + context + question)
//     → Groq LLM → answer text
//     → Save user + assistant messages to Postgres
//     → Return answer

import prisma from "../db/prisma.js";
import { getRetriever } from "./retriever.js";
import { ChatGroq } from "@langchain/groq";

// LLM is also module-level: constructed once, reused every call.
// ChatGroq uses Llama 3.1 8B — fast, free-tier available, good at instruction following.
const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.1-8b-instant",
  temperature: 0.2, // Low temperature = more factual, less creative (good for banking)
  maxTokens: 512,   // Cap output length to control latency and cost
});

// Maximum number of historical messages to include in the prompt.
// Including the full history would exceed the context window for long conversations.
const MAX_HISTORY_MESSAGES = 10;

/**
 * Main RAG agent function.
 * @param {string} conversationId - UUID of the conversation (from Postgres)
 * @param {string} question - The user's current question
 * @returns {Promise<string>} The AI assistant's answer
 */
async function askHelpdesk(conversationId, question) {
  // ── Step 1: Load recent conversation history from Postgres ──────────────
  // We fetch the last N messages to provide multi-turn context to the LLM.
  // Without history, the model can't answer follow-up questions like
  // "what did you just say about refunds?"
  const recentMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: MAX_HISTORY_MESSAGES,
  });

  // ── Step 2: Retrieve relevant knowledge base chunks from Pinecone ────────
  // The retriever embeds `question` and finds the top-K most similar chunks.
  // This is the "Retrieval" part of RAG.
  const retriever = await getRetriever();
  const relevantDocs = await retriever.invoke(question);

  // Format the retrieved chunks into a single context block.
  // Each chunk includes its source filename as a citation.
  const context = relevantDocs
    .map((doc) => `[Source: ${doc.metadata?.source ?? "knowledge base"}]\n${doc.pageContent}`)
    .join("\n\n---\n\n");

  // ── Step 3: Build structured messages array ──────────────────────────────
  // LangChain / OpenAI-style messages: [system, ...history, user]
  // This is cleaner than string concatenation and prevents prompt injection.
  const messages = [
    {
      role: "system",
      content: `You are a professional banking helpdesk assistant for a digital bank.

Your job:
- Answer customer questions clearly and accurately
- Base your answers ONLY on the provided knowledge base context
- If the context does not contain the answer, say: "I don't have information on that in my knowledge base. Please contact our support team directly."
- Never fabricate account details, balances, transaction data, or policy specifics
- Keep answers concise (2-4 sentences unless a list is clearly better)
- Use a professional, friendly tone

Do not mention that you are using a "knowledge base" or "context" — just answer naturally.`,
    },
    // Inject conversation history so the model understands follow-up questions
    ...recentMessages.map((m) => ({
      role: m.role, // "user" or "assistant"
      content: m.content,
    })),
    // Final user message with the retrieved context injected
    {
      role: "user",
      content: `Knowledge base context:\n${context}\n\nCustomer question: ${question}`,
    },
  ];

  // ── Step 4: Call the LLM ─────────────────────────────────────────────────
  // This is the "Generation" part of RAG.
  const response = await llm.invoke(messages);
  const answer = response.content;

  // ── Step 5: Persist both messages to Postgres ────────────────────────────
  // We save both user question and AI answer so future turns have history.
  // Using createMany for a single round-trip instead of two separate creates.
  await prisma.message.createMany({
    data: [
      { conversationId, role: "user", content: question },
      { conversationId, role: "assistant", content: answer },
    ],
  });

  return answer;
}

export default askHelpdesk;
