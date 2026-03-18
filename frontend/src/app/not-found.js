// src/app/not-found.js
// Shown for any unmatched route

export default function NotFound() {
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
    }}>
      <div style={{ fontSize: "48px" }}>🏦</div>
      <h2 style={{ color: "#e8edf5", fontSize: "24px", fontWeight: 600 }}>
        Page not found
      </h2>
      <a href="/" style={{ color: "#00D4AA", fontSize: "14px" }}>
        ← Back to Help Center
      </a>
    </div>
  );
}
