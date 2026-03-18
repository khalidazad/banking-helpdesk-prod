// src/utils/smokeTest.js
// Quick end-to-end smoke test — run after deployment to verify everything works.
//
// Usage:
//   API_URL=https://your-backend.onrender.com node src/utils/smokeTest.js
//   API_URL=http://localhost:3000 node src/utils/smokeTest.js

import "dotenv/config";

const BASE = process.env.API_URL ?? "http://localhost:3000";

async function run() {
  console.log(`\n🔍 Smoke Test — ${BASE}\n`);

  // ── 1. Health check ──────────────────────────────────────────────────────
  console.log("1. Health check...");
  const health = await fetch(`${BASE}/health`);
  const healthData = await health.json();
  if (health.status !== 200 || healthData.status !== "ok") {
    throw new Error(`Health check failed: ${JSON.stringify(healthData)}`);
  }
  console.log("   ✓ Server is up\n");

  // ── 2. Create conversation ───────────────────────────────────────────────
  console.log("2. Creating conversation session...");
  const convRes = await fetch(`${BASE}/api/conversation`, { method: "POST" });
  if (convRes.status !== 201) {
    throw new Error(`Expected 201, got ${convRes.status}`);
  }
  const conv = await convRes.json();
  if (!conv.id) throw new Error("No conversation ID returned");
  console.log(`   ✓ Conversation created: ${conv.id}\n`);

  // ── 3. Send a chat message ───────────────────────────────────────────────
  console.log("3. Sending test chat message...");
  const chatRes = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: conv.id,
      question: "What is the refund policy?",
    }),
  });
  if (chatRes.status !== 200) {
    const err = await chatRes.json();
    throw new Error(`Chat failed (${chatRes.status}): ${JSON.stringify(err)}`);
  }
  const chat = await chatRes.json();
  if (!chat.answer || chat.answer.length < 10) {
    throw new Error(`Answer too short or missing: "${chat.answer}"`);
  }
  console.log(`   ✓ Got answer (${chat.answer.length} chars)`);
  console.log(`   Preview: "${chat.answer.slice(0, 100)}..."\n`);

  // ── 4. Fetch conversation history ────────────────────────────────────────
  console.log("4. Fetching conversation history...");
  const histRes = await fetch(`${BASE}/api/conversation/${conv.id}/messages`);
  const hist = await histRes.json();
  if (!hist.messages || hist.messages.length !== 2) {
    throw new Error(`Expected 2 messages, got ${hist.messages?.length}`);
  }
  console.log(`   ✓ 2 messages saved (user + assistant)\n`);

  // ── 5. Validation error test ─────────────────────────────────────────────
  console.log("5. Testing validation (empty question should return 400)...");
  const badRes = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId: conv.id, question: "" }),
  });
  if (badRes.status !== 400) {
    throw new Error(`Expected 400 for empty question, got ${badRes.status}`);
  }
  console.log("   ✓ Validation working correctly\n");

  // ── 6. Rate limit header check ───────────────────────────────────────────
  console.log("6. Checking rate limit headers...");
  const hasRateHeader = chatRes.headers.get("ratelimit-limit") !== null;
  console.log(`   ${hasRateHeader ? "✓" : "⚠"} Rate limit headers: ${hasRateHeader ? "present" : "not detected (may be behind proxy)"}\n`);

  console.log("🎉 All tests passed! Your deployment is healthy.\n");
}

run().catch((err) => {
  console.error("\n❌ Smoke test FAILED:", err.message);
  process.exit(1);
});
