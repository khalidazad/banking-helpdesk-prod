// src/rag/ingestDocs.js
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getEmbeddings } from "./embeddings.js";

// __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// docs/ folder is relative to the backend root (two levels up from src/rag/)
const DOCS_PATH = path.resolve(__dirname, "../../docs");

async function loadDocuments() {
  if (!fs.existsSync(DOCS_PATH)) {
    throw new Error(`Docs folder not found at: ${DOCS_PATH}\nCreate backend/docs/ and add your .txt files.`);
  }

  const files = fs.readdirSync(DOCS_PATH);
  const txtFiles = files.filter((f) => f.endsWith(".txt"));
  const pdfFiles = files.filter((f) => f.endsWith(".pdf"));

  if (txtFiles.length === 0 && pdfFiles.length === 0) {
    throw new Error(`No .txt or .pdf files found in ${DOCS_PATH}`);
  }

  const documents = [];

  // Load .txt files (no extra dependency needed)
  for (const file of txtFiles) {
    const filePath = path.join(DOCS_PATH, file);
    console.log(`  Loading: ${file}`);
    const text = fs.readFileSync(filePath, "utf8");
    documents.push(new Document({ pageContent: text, metadata: { source: file } }));
  }

  // Load .pdf files using dynamic import to avoid ESM/CJS conflict
  if (pdfFiles.length > 0) {
    let pdfParse;
    try {
      const mod = await import("pdf-parse/lib/pdf-parse.js");
      pdfParse = mod.default ?? mod;
    } catch {
      console.warn("  ⚠ pdf-parse not available — skipping PDF files.");
      console.warn("    To enable PDFs run: npm install pdf-parse");
      return documents;
    }

    for (const file of pdfFiles) {
      const filePath = path.join(DOCS_PATH, file);
      console.log(`  Loading PDF: ${file}`);
      const buffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(buffer);
      documents.push(new Document({ pageContent: pdfData.text, metadata: { source: file } }));
    }
  }

  return documents;
}

async function ingest() {
  console.log("\n🏦 Banking Helpdesk — Document Ingestion\n");

  if (!process.env.PINECONE_API_KEY) throw new Error("Missing PINECONE_API_KEY in .env");
  if (!process.env.PINECONE_INDEX)   throw new Error("Missing PINECONE_INDEX in .env");
  if (!process.env.EMBEDDING_PROVIDER) throw new Error("Missing EMBEDDING_PROVIDER in .env");

  console.log("Step 1: Loading documents from /docs...");
  const rawDocs = await loadDocuments();
  console.log(`  ✓ Loaded ${rawDocs.length} document(s)\n`);

  console.log("Step 2: Splitting into chunks...");
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 100,
  });
  const chunks = await splitter.splitDocuments(rawDocs);
  console.log(`  ✓ Created ${chunks.length} chunks\n`);

  console.log("Step 3: Connecting to Pinecone...");
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pinecone.Index(process.env.PINECONE_INDEX);
  console.log(`  ✓ Connected to index: ${process.env.PINECONE_INDEX}\n`);

  console.log("Step 4: Embedding and upserting to Pinecone...");
  console.log("  (This takes 30–60 seconds on first run)\n");
  const embeddings = getEmbeddings();
  await PineconeStore.fromDocuments(chunks, embeddings, { pineconeIndex: index });

  console.log("  ✓ All chunks embedded and stored\n");
  console.log("🎉 Ingestion complete! Your knowledge base is ready.\n");
}

ingest().catch((err) => {
  console.error("\n❌ Ingestion failed:", err.message);
  process.exit(1);
});