// src/rag/retriever.js
// Builds (or returns a cached) Pinecone vector store retriever.
//
// SINGLETON PATTERN:
// The module-level `_retriever` variable is initialized ONCE on first call,
// then reused for every subsequent request. This avoids:
//   - Re-creating the Pinecone TCP connection on every API call
//   - Redundant round-trips to Pinecone to describe the index
//   - Paying the ~200ms cold-start cost on every chat message
//
// INTERVIEW EXPLANATION:
// "I use a singleton so the vector store connection is initialized once at
// server startup and reused — same idea as a database connection pool."

import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { getEmbeddings } from "./embeddings.js";

let _retriever = null;

export async function getRetriever() {
  // Return cached retriever if already initialized
  if (_retriever) return _retriever;

  // Validate required env vars before attempting connection
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX) {
    throw new Error(
      "Missing PINECONE_API_KEY or PINECONE_INDEX in environment variables."
    );
  }

  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pinecone.Index(process.env.PINECONE_INDEX);
  const embeddings = getEmbeddings();

  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex: index,
  });

  // k: 4 = return the 4 most relevant document chunks
  // Increase for broader context, decrease for precision
  _retriever = vectorStore.asRetriever({ k: 4 });

  return _retriever;
}
