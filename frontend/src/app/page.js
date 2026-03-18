"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// ── Suggested questions shown before any chat ────────────────────────────────
const SUGGESTIONS = [
  "How do I reset my password?",
  "What is your refund policy?",
  "My card was declined — what should I do?",
  "How long do ACH transfers take?",
  "How do I report a lost card?",
];

export default function Home() {
  const [messages, setMessages]           = useState([]);
  const [input, setInput]                 = useState("");
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [sessionReady, setSessionReady]   = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  // ── Create conversation session on mount ──────────────────────────────────
  useEffect(() => {
    async function createSession() {
      try {
        const res = await fetch(`${API_URL}/api/conversation`, { method: "POST" });
        if (!res.ok) throw new Error("Failed to start session");
        const data = await res.json();
        setConversationId(data.id);
        setSessionReady(true);
      } catch (err) {
        setError("Could not connect to the helpdesk. Please refresh the page.");
      }
    }
    createSession();
  }, []);

  // ── Auto-scroll to latest message ─────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const question = (text ?? input).trim();
    if (!question || loading || !sessionReady) return;

    setInput("");
    setError(null);

    // Optimistically add user message
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, question }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `Server error (${res.status})`);
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      // Remove the optimistic user message on failure
      setMessages((prev) => prev.slice(0, -1));
      setInput(question); // Restore the input so the user doesn't lose their message
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, sessionReady, conversationId]);

  // ── Handle Enter key ───────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className={styles.shell}>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <span className={styles.logoMark}>S</span>
          <span className={styles.logoText}>SecureBank</span>
        </div>

        <nav className={styles.sidebarNav}>
          <span className={styles.navLabel}>Support topics</span>
          {[
            { icon: "💳", label: "Cards & Payments" },
            { icon: "🔐", label: "Account Security" },
            { icon: "↩️",  label: "Refunds" },
            { icon: "🏦", label: "Loans & Credit" },
            { icon: "🌍", label: "International" },
          ].map(({ icon, label }) => (
            <button
              key={label}
              className={styles.navItem}
              onClick={() => sendMessage(`Tell me about ${label}`)}
            >
              <span className={styles.navIcon}>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.statusDot} />
          <span>AI Helpdesk online</span>
        </div>
      </aside>

      {/* ── Main chat area ───────────────────────────────────────────── */}
      <main className={styles.main}>

        {/* Header */}
        <header className={styles.header}>
          <div>
            <h1 className={styles.headerTitle}>Help Center</h1>
            <p className={styles.headerSub}>AI-powered banking support</p>
          </div>
          <div className={styles.headerBadge}>
            <span className={styles.headerDot} />
            Online
          </div>
        </header>

        {/* Messages */}
        <div className={styles.messages}>

          {/* Empty state */}
          {isEmpty && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🏦</div>
              <h2 className={styles.emptyTitle}>How can we help you today?</h2>
              <p className={styles.emptySub}>
                Ask anything about your account, payments, cards, or policies.
              </p>
              <div className={styles.suggestions}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className={styles.suggestionBtn}
                    onClick={() => sendMessage(s)}
                    disabled={!sessionReady}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`${styles.message} ${
                msg.role === "user" ? styles.messageUser : styles.messageAI
              }`}
            >
              {msg.role === "assistant" && (
                <div className={styles.avatar}>AI</div>
              )}
              <div className={styles.bubble}>
                {msg.content.split("\n").map((line, j) => (
                  <p key={j} className={styles.line}>{line}</p>
                ))}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className={`${styles.message} ${styles.messageAI}`}>
              <div className={styles.avatar}>AI</div>
              <div className={`${styles.bubble} ${styles.typingBubble}`}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className={styles.errorBanner}>
              ⚠ {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className={styles.inputArea}>
          {!sessionReady && !error && (
            <div className={styles.connecting}>Connecting to helpdesk…</div>
          )}
          <div className={styles.inputRow}>
            <textarea
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={sessionReady ? "Ask a question…" : "Connecting…"}
              disabled={!sessionReady || loading}
              rows={1}
            />
            <button
              className={styles.sendBtn}
              onClick={() => sendMessage()}
              disabled={!input.trim() || !sessionReady || loading}
              aria-label="Send message"
            >
              {loading ? (
                <span className={styles.spinner} />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </button>
          </div>
          <p className={styles.disclaimer}>
            Answers are generated from official bank documentation. For complex issues, contact a human agent.
          </p>
        </div>

      </main>
    </div>
  );
}
