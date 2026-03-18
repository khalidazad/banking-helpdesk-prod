# 🚀 Deployment Guide

This guide walks through deploying the banking helpdesk to production:
- **Frontend** → Vercel
- **Backend API** → Render
- **Database** → Neon (PostgreSQL)
- **Vector Store** → Pinecone

---

## Prerequisites — accounts you need (all have free tiers)

| Service | Signup URL | What it's used for |
|---|---|---|
| GitHub | github.com | Hosts your code; Vercel + Render pull from here |
| Neon | neon.tech | Serverless PostgreSQL — stores conversations & messages |
| Pinecone | pinecone.io | Vector database — stores embedded document chunks |
| Groq | console.groq.com | LLM inference (Llama 3.1) — free tier is generous |
| OpenAI | platform.openai.com | Embeddings only — text-embedding-3-small is ~$0.02/1M tokens |
| Render | render.com | Hosts the Express backend |
| Vercel | vercel.com | Hosts the Next.js frontend |

---

## Step 1 — Push to GitHub

```bash
# From the project root (banking-helpdesk/)
git init
git add .
git commit -m "Initial production commit"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/banking-helpdesk.git
git push -u origin main
```

---

## Step 2 — Set up Neon Database

1. Go to [console.neon.tech](https://console.neon.tech)
2. Click **New Project** → name it `banking-helpdesk`
3. Choose region closest to your Render region (e.g. US West Oregon)
4. Copy the **Connection string** — it looks like:
   ```
   postgresql://user:password@ep-xxxx.us-west-2.aws.neon.tech/neondb?sslmode=require
   ```
5. Keep this tab open — you'll paste it into Render shortly

---

## Step 3 — Set up Pinecone Index

1. Go to [app.pinecone.io](https://app.pinecone.io)
2. Click **Create Index**
3. Fill in:
   - **Index name:** `banking-helpdesk`
   - **Dimensions:** `1536` (matches OpenAI `text-embedding-3-small`)
   - **Metric:** `cosine`
   - **Cloud/Region:** any free tier region
4. Click **Create Index**
5. Go to **API Keys** → copy your API key

> ⚠️ If you use HuggingFace embeddings instead of OpenAI, set dimensions to `384`

---

## Step 4 — Ingest your knowledge base

Before deploying, you need to populate Pinecone with your docs.

```bash
cd banking-helpdesk/backend

# Copy and fill in your env file
cp .env.example .env
# Edit .env and fill in:
#   DATABASE_URL        (from Neon)
#   PINECONE_API_KEY    (from Pinecone)
#   PINECONE_INDEX      banking-helpdesk
#   EMBEDDING_PROVIDER  openai
#   OPENAI_API_KEY      (from platform.openai.com)
#   GROQ_API_KEY        (from console.groq.com)

# Install deps and run ingestion
npm install
npx prisma generate
npx prisma migrate deploy
npm run ingest
```

You should see:
```
Step 1: Loading documents from /docs...
  ✓ Loaded 4 document(s)

Step 2: Splitting into chunks...
  ✓ Created 28 chunks

Step 3: Connecting to Pinecone...
  ✓ Connected to index: banking-helpdesk

Step 4: Embedding chunks and upserting to Pinecone...

🎉 Ingestion complete! Your knowledge base is ready.
```

---

## Step 5 — Deploy Backend to Render

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Click **Connect GitHub** and select your `banking-helpdesk` repo
3. Configure the service:
   - **Name:** `banking-helpdesk-api`
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy`
   - **Start Command:** `npm start`
4. **Add environment variables** (click "Add Environment Variable" for each):

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` |
   | `DATABASE_URL` | *(paste from Neon)* |
   | `PINECONE_API_KEY` | *(paste from Pinecone)* |
   | `PINECONE_INDEX` | `banking-helpdesk` |
   | `EMBEDDING_PROVIDER` | `openai` |
   | `OPENAI_API_KEY` | *(paste your key)* |
   | `GROQ_API_KEY` | *(paste your key)* |
   | `ALLOWED_ORIGIN` | *(leave blank for now — fill after Step 6)* |

5. Click **Create Web Service**
6. Wait ~3 minutes for first deploy. Your URL will be:
   ```
   https://banking-helpdesk-api.onrender.com
   ```

> **Note on free tier:** Render free tier spins down after 15 minutes of inactivity.
> The first request after sleep takes ~30 seconds. Upgrade to Starter ($7/mo) for always-on.

---

## Step 6 — Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your `banking-helpdesk` GitHub repo
3. Configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Next.js (auto-detected)
4. **Add environment variable:**

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://banking-helpdesk-api.onrender.com` |

5. Click **Deploy**
6. Your URL will be something like:
   ```
   https://banking-helpdesk.vercel.app
   ```

---

## Step 7 — Connect frontend ↔ backend (CORS)

1. Go back to **Render** → your `banking-helpdesk-api` service
2. Go to **Environment** → update `ALLOWED_ORIGIN`:
   ```
   https://banking-helpdesk.vercel.app
   ```
3. Render auto-redeploys with the new env var

---

## Step 8 — Verify deployment

Run the smoke test against your production URL:

```bash
cd backend
API_URL=https://banking-helpdesk-api.onrender.com node src/utils/smokeTest.js
```

Expected output:
```
🔍 Smoke Test — https://banking-helpdesk-api.onrender.com

1. Health check...
   ✓ Server is up

2. Creating conversation session...
   ✓ Conversation created: abc-123-...

3. Sending test chat message...
   ✓ Got answer (187 chars)
   Preview: "Customers can request a refund within 30 days..."

4. Fetching conversation history...
   ✓ 2 messages saved (user + assistant)

5. Testing validation (empty question should return 400)...
   ✓ Validation working correctly

6. Checking rate limit headers...
   ✓ Rate limit headers: present

🎉 All tests passed! Your deployment is healthy.
```

---

## Updating your knowledge base

When you update or add docs:

```bash
cd backend
# Add/edit files in docs/
npm run ingest   # re-embeds everything into Pinecone
```

No server restart needed — Pinecone is updated instantly.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Frontend shows "Could not connect" | CORS misconfigured | Check `ALLOWED_ORIGIN` on Render matches your Vercel URL exactly |
| "Pinecone index not found" | Wrong `PINECONE_INDEX` value | Check it matches the name you created in Pinecone dashboard |
| "Invalid API key" errors | Wrong key pasted | Re-check each key in Render environment variables |
| Answers say "I don't have info on that" | Ingestion not run | Run `npm run ingest` pointing at your production Neon DB |
| Render deploy fails on migrate | Neon SSL issue | Make sure `DATABASE_URL` ends with `?sslmode=require` |
| First request is slow (30s) | Render free tier cold start | Upgrade to Starter tier, or use a cron job to ping `/health` every 14 minutes |
