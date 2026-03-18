# 🎤 Interview Cheat Sheet — Banking Helpdesk RAG System

A complete reference for explaining every design decision in a technical interview.
Read this before your interview. Know it cold.

---

## The 30-second elevator pitch

> "I built a production RAG-based banking helpdesk. Customers ask questions in natural language; the system retrieves the most relevant policy documents from a Pinecone vector store, injects them as context into a Groq LLM, and returns grounded answers. The frontend is Next.js on Vercel, the API is Express on Render, conversation history is stored in Neon PostgreSQL via Prisma. Every layer is hardened for production — input validation with Zod, rate limiting, security headers, singleton connections, structured prompts, and centralized error handling."

---

## Q: What is RAG and why use it for banking?

**Answer:**
RAG stands for Retrieval-Augmented Generation. Instead of relying on an LLM's training data — which may be outdated, hallucinated, or simply wrong — you:

1. Maintain a verified knowledge base of your actual policies
2. At query time, search that knowledge base for the most relevant text
3. Inject those text chunks into the LLM prompt as "context"
4. The LLM generates its answer **only** from that context

For banking, this is non-negotiable. An LLM cannot be allowed to fabricate refund timelines, account limits, or regulatory rules. RAG grounds every answer in source-of-truth documentation.

The system prompt explicitly says: *"If the context does not contain the answer, say 'I don't have information on that.'"* — this is the guardrail that prevents hallucination.

---

## Q: Walk me through the RAG pipeline in detail

**Answer:**
The pipeline has two phases:

**Ingest phase** (offline, run once per doc update):
```
docs/*.txt + *.pdf
  → RecursiveCharacterTextSplitter (500 chars, 100 overlap)
  → OpenAI text-embedding-3-small  [1536-dim vector per chunk]
  → PineconeStore.fromDocuments()  [upsert to Pinecone index]
```

**Query phase** (every /api/chat request):
```
user question (string)
  → embed with same OpenAI model     [question → 1536-dim vector]
  → Pinecone cosine similarity search [k=4 most similar chunks]
  → build messages array:
      system:    behavior rules + guardrails
      ...history: last 10 messages from Postgres
      user:      "Context:\n{chunks}\n\nQuestion: {question}"
  → Groq Llama 3.1 8B (temp=0.2)    [structured generation]
  → prisma.message.createMany()      [save both messages]
  → return answer
```

---

## Q: Why Pinecone instead of pgvector or a local store?

**Answer:**
Three reasons:
1. **Managed service** — no infrastructure to maintain, replicated automatically
2. **ANN indexing** — Approximate Nearest Neighbor search at scale is fast out of the box
3. **Separation of concerns** — vector data and relational data have different access patterns

In a real production system at scale, I'd evaluate pgvector (keeps everything in one DB, simpler ops) or Weaviate/Qdrant (self-hosted, more control). For this project, Pinecone's free tier and zero-config setup was the right call.

---

## Q: Why a singleton for the Pinecone retriever?

**Answer:**
```javascript
let _retriever = null;
export async function getRetriever() {
  if (_retriever) return _retriever;
  // ... initialize once
  _retriever = vectorStore.asRetriever({ k: 4 });
  return _retriever;
}
```

Node.js caches module exports — so `_retriever` is a true process-level singleton. Without this, every API request would:
- Create a new `Pinecone` client (TCP handshake)
- Fetch index metadata from Pinecone's API
- Re-initialize the `PineconeStore`

That's ~200ms of extra latency per request, plus wasted connections. The singleton initializes once at first request and is reused forever. Same idea as a database connection pool.

---

## Q: Why Zod for validation?

**Answer:**
```javascript
const chatSchema = z.object({
  conversationId: z.string().uuid(),
  question: z.string().min(1).max(2000),
});
const parsed = chatSchema.safeParse(req.body);
if (!parsed.success) return res.status(400).json({ error: ..., details: ... });
```

Runtime schema validation at the API boundary. TypeScript only catches errors at compile time — Zod enforces them at runtime on actual request data.

Without this:
- Empty `question` → LLM call crashes with a confusing error
- Invalid `conversationId` → Prisma foreign key violation, 500 error
- Malformed UUID → SQL error leaks to client

With Zod: clean 400 with field-level error messages before any service is touched.

---

## Q: Why structured messages instead of a string prompt?

**Answer:**
Old approach (fragile):
```javascript
const prompt = `You are an AI...\nHistory: ${history}\nContext: ${context}\nQuestion: ${question}\nAnswer:`;
```

Production approach:
```javascript
const messages = [
  { role: "system",    content: "You are a banking assistant. Base answers only on context..." },
  { role: "user",      content: "How do I reset my password?" },
  { role: "assistant", content: "Go to login → Forgot Password..." },
  { role: "user",      content: `Context:\n${chunks}\n\nQuestion: ${question}` },
];
```

Benefits:
1. **Clear role boundaries** — model knows what's an instruction vs conversation vs current question
2. **No prompt injection** — user input can't escape the `user` role to override system instructions
3. **Native multi-turn** — conversation history is structured, not concatenated strings
4. **Standard interface** — works identically with OpenAI, Anthropic, Groq, or any LangChain LLM

---

## Q: Why temperature 0.2?

**Answer:**
Temperature controls randomness in token sampling:
- `0.0` = fully deterministic, picks highest probability token every time
- `1.0` = very creative/diverse, often incoherent for factual tasks
- `0.2` = mostly deterministic with slight variation to avoid robotic repetition

For banking (accuracy over creativity), you want the model close to deterministic. `0.2` is the standard production value for factual Q&A systems. You'd use 0.7-1.0 for creative writing or brainstorming.

---

## Q: Why cap conversation history at 10 messages?

**Answer:**
Every message in history consumes tokens in the context window. A conversation with 100 messages would:
1. Risk exceeding the model's context limit (~8k tokens for Llama 3.1 8B)
2. Include irrelevant early messages that confuse the model
3. Increase latency and cost

10 messages (5 turns) gives enough context for natural follow-up questions like "what did you say about the refund deadline?" while staying well within token limits.

A more sophisticated approach: sliding window + summarization (summarize older messages, keep recent ones verbatim).

---

## Q: What does `createMany` save you over two `create` calls?

**Answer:**
```javascript
// Old: 2 DB round-trips
await prisma.message.create({ data: { role: "user", ...} });
await prisma.message.create({ data: { role: "assistant", ...} });

// New: 1 DB round-trip
await prisma.message.createMany({
  data: [
    { role: "user", content: question, conversationId },
    { role: "assistant", content: answer, conversationId },
  ],
});
```

With Neon serverless (which has per-query latency), this halves the database calls at the end of every chat message. At 1,000 req/day that's 1,000 fewer round-trips. Small but compounds.

---

## Q: What does `helmet` actually do?

**Answer:**
`helmet()` sets ~15 HTTP response headers that protect against common web attacks:

| Header | Protects against |
|---|---|
| `X-Content-Type-Options: nosniff` | MIME-type sniffing attacks |
| `X-Frame-Options: SAMEORIGIN` | Clickjacking (embedding in iframes) |
| `Strict-Transport-Security` | Forces HTTPS, prevents SSL stripping |
| `X-XSS-Protection` | Reflected XSS (older browsers) |
| `Content-Security-Policy` | Inline script injection |
| `Referrer-Policy` | Leaking URL params to third parties |

One line of code for a significant security improvement. Standard in any Express production app.

---

## Q: Why `onDelete: Cascade` in the Prisma schema?

**Answer:**
```prisma
conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
```

If a Conversation is deleted, all its Messages are automatically deleted too. Without `Cascade`, deleting a Conversation would fail with a foreign key constraint error (Postgres won't let you delete a parent row with child rows pointing to it). Cascade keeps the data consistent and simplifies cleanup operations.

---

## Q: Explain the chunking strategy

**Answer:**
```javascript
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,   // max characters per chunk
  chunkOverlap: 100 // overlap between consecutive chunks
});
```

**Why chunk at all?**
You can't embed an entire document as one vector — embedding models have input length limits, and a 5-page policy doc embedded as one vector loses granularity. You need to be able to pinpoint the exact paragraph that answers the question.

**Why 500 chars?**
~100 tokens — enough context for a chunk to be self-contained and meaningful, small enough for precise retrieval.

**Why 100-char overlap?**
Answers often span chunk boundaries. Without overlap, "Refunds are processed within" might be in chunk 3 and "5 business days" in chunk 4 — you'd never retrieve a complete answer. Overlap ensures both halves appear in at least one chunk.

**RecursiveCharacterTextSplitter** tries to split at natural boundaries (paragraphs, sentences, words) before falling back to raw character splitting — preserving semantic coherence.

---

## Q: How would you scale this to 100,000 users?

**Answer:**
Current bottlenecks and solutions:

1. **LLM latency (biggest)** — Switch to streaming responses (Server-Sent Events). User sees tokens appearing in real-time instead of waiting 3-5 seconds for the full answer. Groq supports streaming natively via LangChain.

2. **Pinecone reads** — Already a singleton, scales horizontally. Pinecone's paid tiers handle millions of queries/day.

3. **Neon PostgreSQL** — Neon is serverless and auto-scales. For very high write volume, add a Redis cache for conversation history to avoid DB reads on every message.

4. **Express server** — Stateless, so horizontal scaling is trivial. On Render: scale to multiple instances. Add a load balancer in front.

5. **Rate limiting** — Current: per-IP in-process. At scale: move to Redis-backed rate limiting (shared across instances) using `rate-limit-redis`.

6. **Embedding at query time** — One OpenAI API call per message. Could batch or cache embeddings for repeated questions.

---

## Q: What would you add if this were a real product?

**Answer** (pick 2-3 to discuss in depth):

- **Streaming** — `res.writeHead(200, {'Content-Type': 'text/event-stream'})` + LangChain streaming callback
- **Auth** — Clerk or NextAuth. Associate conversations with user IDs so history persists across sessions
- **Source citations** — Return `doc.metadata.source` alongside the answer: "Based on refund-policy.txt"
- **Confidence / fallback** — If retrieved chunk similarity scores are all below 0.7, route to a human agent instead of guessing
- **Evaluation** — A test set of 50 question/answer pairs. Run after every doc update to measure retrieval recall and answer quality
- **Admin UI** — Upload new docs via a form, trigger ingestion without CLI access
- **Observability** — Log every retrieval (query, chunks retrieved, similarity scores) to a table. Build a dashboard to see what questions are being asked and which aren't getting good answers

---

## The numbers to know cold

| Thing | Value | Why it matters |
|---|---|---|
| Embedding dimensions (OpenAI) | 1536 | Must match Pinecone index config |
| Embedding dimensions (HuggingFace) | 384 | Different model, different index |
| Chunk size | 500 chars | ~100 tokens, balance of context vs precision |
| Chunk overlap | 100 chars | Prevents answer split across boundaries |
| Top-K retrieval | 4 chunks | Enough context, not too many tokens |
| Max history messages | 10 | ~5 conversation turns, fits in context window |
| LLM temperature | 0.2 | Factual, near-deterministic |
| Max tokens output | 512 | Controls latency and cost |
| Rate limit | 30 req/min per IP | Prevents abuse, adjust to real traffic |
