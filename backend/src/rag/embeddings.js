// src/rag/embeddings.js
// Returns the correct embedding model based on EMBEDDING_PROVIDER env var.
// Supports OpenAI (text-embedding-3-small) and HuggingFace (all-MiniLM-L6-v2).
//
// INTERVIEW EXPLANATION:
// Embeddings convert text into a high-dimensional vector (array of numbers).
// Similar texts produce vectors that are "close" in vector space (high cosine similarity).
// We embed both the knowledge base docs (at ingest time) and the user's question
// (at query time) using the SAME model so comparisons are meaningful.

import { OpenAIEmbeddings } from "@langchain/openai";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";

export function getEmbeddings() {
  const provider = process.env.EMBEDDING_PROVIDER;

  if (provider === "openai") {
    return new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
      model: "text-embedding-3-small", // 1536 dimensions, cheap and accurate
    });
  }

  if (provider === "huggingface") {
    return new HuggingFaceInferenceEmbeddings({
      apiKey: process.env.HUGGINGFACE_API_KEY,
      model: "sentence-transformers/all-MiniLM-L6-v2", // 384 dimensions, free
    });
  }

  throw new Error(
    `Unknown EMBEDDING_PROVIDER: "${provider}". Set it to "openai" or "huggingface" in your .env file.`
  );
}
