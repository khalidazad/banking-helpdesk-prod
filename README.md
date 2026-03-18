# 🏦 Banking Helpdesk AI — RAG-Powered Support Agent

A production-grade, RAG (Retrieval-Augmented Generation) banking helpdesk application. Customers ask natural-language questions; the system retrieves the most relevant policy documents from a vector store and uses an LLM to generate grounded, accurate answers.

**Stack:** Next.js · Express · LangChain · Pinecone · Groq (Llama 3.1) · Neon PostgreSQL · Prisma

**Deployed on:** Vercel (frontend) · Render (backend) · Neon (database) · Pinecone (vector store)

---

## 📐 Architecture

```
User (browser)
    │
    ▼
Next.js Frontend (Vercel)
    │  POST /api/chat { conversationId, question }
    ▼
Express API (Render)
    ├── Helmet (security headers)
    ├── Rate limiter (30 req/min)
    ├── Zod validation
    │
    ▼
RAG Agent
    ├── 1. Load conversation history   ──▶  Neon PostgreSQL (Prisma)
    ├── 2. Embed question              ──▶  OpenAI / HuggingFace
    ├── 3. Vector similarity search    ──▶  Pinecone (top-4 chunks)
    ├── 4. Build structured prompt     ──▶  system + history + context + question
    └── 5. LLM inference               ──▶  Groq (Llama 3.1 8B)
    │
    ▼
Save messages to PostgreSQL  ──▶  Return answer to frontend
```

### What is RAG?

RAG (Retrieval-Augmented Generation) grounds the LLM in verified documents rather than its training data. This is critical for banking — the model **cannot hallucinate** refund policies, account rules, or regulatory information.

The pipeline has two phases:

**Ingest phase** (run once, offline):
```
docs/ (.txt, .pdf)
    → chunk (500 chars, 100 overlap)
    → embed (OpenAI text-embedding-3-small)
    → upsert to Pinecone
```

**Query phase** (every chat message):
```
user question
    → embed with same model
    → cosine similarity search in Pinecone
    → top-4 matching chunks injected as context
    → LLM answers ONLY from that context
```

---

## 📁 Project Structure

```
banking-helpdesk/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express app with all middleware
│   │   ├── routes/
│   │   │   ├── ask.js             # POST /api/chat — main RAG endpoint
│   │   │   └── conversation.js    # POST /api/conversation, GET /api/conversation/:id/messages
│   │   ├── rag/
│   │   │   ├── ragAgent.js        # Core RAG pipeline (retrieve + generate + persist)
│   │   │   ├── retriever.js       # Pinecone singleton retriever
│   │   │   ├── embeddings.js      # Provider abstraction (OpenAI / HuggingFace)
│   │   │   └── ingestDocs.js      # One-time doc ingestion script
│   │   ├── db/
│   │   │   └── prisma.js          # Prisma singleton client
│   │   └── middleware/
│   │       └── errorHandler.js    # Centralized error handling
│   ├── prisma/
│   │   ├── schema.prisma          # DB schema: Conversation + Message models
│   │   └── migrations/            # SQL migration history
│   ├── docs/                      # Your knowledge base documents (.txt / .pdf)
│   │   ├── refund-policy.txt
│   │   ├── payment-issues.txt
│   │   ├── account-reset.txt
│   │   └── loans-and-credit.txt
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/app/
│   │   ├── layout.js              # Root layout, fonts, metadata
│   │   ├── globals.css            # Design tokens (CSS variables)
│   │   ├── page.js                # Chat UI component
│   │   └── page.module.css        # Scoped styles
│   ├── .env.example
│   └── package.json
│
├── render.yaml                    # Render.com deploy config (backend)
├── vercel.json                    # Vercel deploy config (frontend)
└── README.md
```

---

## 🚀 Local Development Setup

### Prerequisites
- Node.js 18+
- A [Neon](https://neon.tech) account (free tier works)
- A [Pinecone](https://pinecone.io) account (free tier works)
- A [Groq](https://console.groq.com) API key (free)
- An [OpenAI](https://platform.openai.com) API key (for embeddings, ~$0.02 per 1M tokens)

### Step 1 — Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/banking-helpdesk.git
cd banking-helpdesk

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### Step 2 — Configure environment variables

**Backend:**
```bash
cd backend
cp .env.example .env
# Fill in all values in .env
```

**Frontend:**
```bash
cd frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Step 3 — Set up Pinecone index

1. Go to [app.pinecone.io](https://app.pinecone.io) → Create Index
2. Name: `banking-helpdesk` (or whatever you put in `PINECONE_INDEX`)
3. **Dimensions: `1536`** (required for OpenAI embeddings) or `384` for HuggingFace
4. Metric: `cosine`

### Step 4 — Set up Neon database

1. Go to [console.neon.tech](https://console.neon.tech) → Create Project
2. Copy the connection string to `DATABASE_URL` in your `.env`
3. Run migrations:

```bash
cd backend
npx prisma migrate deploy   # applies migrations to Neon
npx prisma generate         # generates the Prisma client
```

### Step 5 — Ingest your knowledge base

```bash
cd backend
npm run ingest
```

This reads all files from `backend/docs/`, chunks them, embeds them, and stores them in Pinecone. Re-run this whenever you update your documentation.

### Step 6 — Start the servers

```bash
# Terminal 1 — Backend API
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

---

## ☁️ Deployment

### Deploy Backend to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New → Web Service**
3. Connect your GitHub repository
4. Render auto-detects `render.yaml`
5. Add environment variables in the Render dashboard:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Your Neon connection string |
| `PINECONE_API_KEY` | Your Pinecone key |
| `PINECONE_INDEX` | `banking-helpdesk` |
| `EMBEDDING_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | Your OpenAI key |
| `GROQ_API_KEY` | Your Groq key |
| `ALLOWED_ORIGIN` | Your Vercel frontend URL (add after frontend deploy) |

6. Click **Deploy**

Your backend URL will be: `https://banking-helpdesk-api.onrender.com`

### Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repository
3. Set **Root Directory** to `frontend`
4. Add environment variable:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Your Render backend URL |

5. Click **Deploy**

Your frontend URL will be: `https://banking-helpdesk.vercel.app`

6. Go back to Render → update `ALLOWED_ORIGIN` to your Vercel URL → redeploy.

---

## 🔑 Key Design Decisions

### Why Singleton for Pinecone retriever?
Creating a new Pinecone connection per request adds ~200ms latency and wastes TCP resources. The module-level singleton is initialized once at server startup and reused for every chat message — same pattern as database connection pooling.

### Why Zod for validation?
Runtime schema validation at the API boundary prevents invalid data from reaching the database or LLM. An invalid `conversationId` would cause a Prisma foreign key error; an empty `question` would crash the LLM call. Zod catches both before they happen.

### Why structured messages instead of string prompts?
The `messages` array format (`[{role, content}, ...]`) gives the LLM clear role boundaries — it knows what's a system instruction, what's user history, and what's the current question. String concatenation is fragile and susceptible to prompt injection.

### Why `createMany` for saving messages?
Saving user and assistant messages in a single `createMany` call halves the number of database round-trips per request.

### Why `temperature: 0.2` for the LLM?
Lower temperature = more factual and deterministic output. For banking (where accuracy matters more than creativity), 0.2 is the sweet spot.

### Why `MAX_HISTORY_MESSAGES = 10`?
Including full conversation history for long sessions would exceed the LLM's context window. Capping at 10 messages gives enough context for follow-up questions without hitting token limits.

---

## 🧪 API Reference

### `POST /api/conversation`
Creates a new chat session. Call this once when the page loads.

**Response:**
```json
{ "id": "uuid", "createdAt": "2026-03-15T..." }
```

### `POST /api/chat`
Sends a message and gets an AI response.

**Body:**
```json
{
  "conversationId": "uuid",
  "question": "What is the refund policy?"
}
```

**Response:**
```json
{ "answer": "Customers can request a refund within 30 days..." }
```

**Errors:**
```json
{ "error": "Invalid request", "details": { "question": ["Question cannot be empty"] } }
```

### `GET /api/conversation/:id/messages`
Returns all messages for a conversation (for re-hydrating chat on page refresh).

### `GET /health`
Health check endpoint used by Render to monitor the service.

---

## ➕ Adding New Knowledge Base Documents

1. Add `.txt` or `.pdf` files to `backend/docs/`
2. Re-run ingestion: `cd backend && npm run ingest`
3. New content is immediately searchable (no server restart needed)

---

## 🗺️ What to Build Next

- **Streaming responses** — stream tokens from Groq using Server-Sent Events for a ChatGPT-like experience
- **Admin panel** — upload new docs via UI without touching the CLI
- **Source citations** — show which document each answer came from
- **Fallback to human** — detect low-confidence answers and route to a live agent
- **Evaluation suite** — a test set of question/answer pairs to measure retrieval recall when tuning chunk size or embedding model
- **Auth** — protect conversations with Clerk or NextAuth so users can retrieve their history

---

## 📝 License

MIT
