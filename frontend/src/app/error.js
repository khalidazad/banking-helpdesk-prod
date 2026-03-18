"use client";

// src/app/error.js
// Next.js App Router uses this as the error boundary for the page.
// Shown if an unhandled error occurs during rendering.

export default function Error({ error, reset }) {
  return (
    <div style={{
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--navy)",
      flexDirection: "column",
      gap: "16px",
      textAlign: "center",
      padding: "24px",
    }}>
      <div style={{ fontSize: "40px" }}>⚠️</div>
      <h2 style={{ color: "#e8edf5", fontSize: "20px", fontWeight: 600 }}>
        Something went wrong
      </h2>
      <p style={{ color: "#8fa3bf", fontSize: "14px", maxWidth: "320px" }}>
        {error?.message ?? "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        style={{
          background: "#00D4AA",
          color: "#0A1628",
          border: "none",
          borderRadius: "8px",
          padding: "10px 24px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
