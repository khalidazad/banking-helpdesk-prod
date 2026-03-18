// src/app/loading.js
// Next.js App Router shows this while the page first renders

export default function Loading() {
  return (
    <div style={{
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--navy)",
      flexDirection: "column",
      gap: "16px",
    }}>
      <div style={{
        width: "36px",
        height: "36px",
        border: "3px solid rgba(0,212,170,0.2)",
        borderTopColor: "#00D4AA",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
