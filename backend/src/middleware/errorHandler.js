// src/middleware/errorHandler.js
// Centralized error handler — catches any error thrown inside route handlers
// and returns a consistent JSON error shape to the client.
//
// Express recognises a 4-argument middleware as an error handler.
// Place it AFTER all routes in server.js.

import logger from "../utils/logger.js";

export function errorHandler(err, req, res, next) {
  logger.error("Request error", {
    method: req.method,
    path: req.path,
    status: err.statusCode ?? 500,
    message: err.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });

  // Prisma not-found errors
  if (err.code === "P2025") {
    return res.status(404).json({ error: "Resource not found" });
  }

  // Prisma foreign key / constraint violations
  if (err.code?.startsWith("P2")) {
    return res.status(400).json({ error: "Database constraint error" });
  }

  // Default 500
  const statusCode = err.statusCode ?? 500;
  const message =
    process.env.NODE_ENV === "production"
      ? "An unexpected error occurred"
      : err.message;

  res.status(statusCode).json({ error: message });
}
