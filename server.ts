import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { documentsRouter } from "./server/routes/documents.js";
import { chatRouter } from "./server/routes/chat.js";
import { systemRouter } from "./server/routes/system.js";
import { rateLimiterMiddleware } from "./server/services/rateLimiter.js";
import { config } from "./server/config.js";

async function startServer() {
  const app = express();
  const PORT = config.port;

  // Basic security & parsing middlewares
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));

  // CORS headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Id");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // Apply Redis-backed sliding window rate limiter to API routes
  app.use("/api", rateLimiterMiddleware());

  // Mount API routers
  app.use("/api/documents", documentsRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api", chatRouter);
  app.use("/api", systemRouter);

  // Top-level aliases for direct assignment contract (e.g. POST /chat, GET /health)
  app.use("/chat", rateLimiterMiddleware(), chatRouter);
  app.use("/documents", rateLimiterMiddleware(), documentsRouter);
  app.use("/health", (req, res) => res.redirect("/api/health"));
  app.use("/ready", (req, res) => res.redirect("/api/ready"));

  // Vite middleware for development & Static fallback for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global Error Handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[Server Error]", err);
    res.status(err.status || 500).json({
      error: err.name || "Internal Server Error",
      message: err.message || "An unexpected error occurred",
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`=========================================`);
    console.log(` LibrAI Assistant running on port ${PORT}`);
    console.log(` API Docs & Endpoints:`);
    console.log(`   - POST /api/documents (Upload PDF/TXT)`);
    console.log(`   - POST /api/chat      (Grounded Chat)`);
    console.log(`   - GET  /api/health    (Liveness Check)`);
    console.log(`   - GET  /api/ready     (Readiness Check)`);
    console.log(`=========================================`);
  });
}

startServer().catch((err) => {
  console.error("Failed to bootstrap server:", err);
  process.exit(1);
});
