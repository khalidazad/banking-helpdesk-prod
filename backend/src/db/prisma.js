// src/db/prisma.js
// Singleton Prisma client
// Module-level singleton: Node.js caches module exports, so this
// client is created ONCE and reused across all imports.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["error"],
});

// Gracefully close the connection pool when the process exits.
// Without this, Neon serverless connections may linger.
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

export default prisma;
