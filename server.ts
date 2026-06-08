import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { extractLicensePlateFromImage, parseChecklistDescription } from "./src/services/geminiService.ts";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set body parser limits for base64 images
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API router/endpoints
  app.post("/api/extract-plate", async (req, res) => {
    try {
      const { base64Image } = req.body;
      if (!base64Image) {
        return res.status(400).json({ error: "No image provided" });
      }

      console.log("[Server] Received plate extraction request...");
      const plate = await extractLicensePlateFromImage(base64Image);
      console.log("[Server] Extracted plate:", plate);

      res.json({ plate });
    } catch (error: any) {
      console.error("[Server] Error in /api/extract-plate:", error);
      res.status(500).json({ error: error.message || "Failed to extract license plate" });
    }
  });

  app.post("/api/parse-checklist", async (req, res) => {
    try {
      const { description } = req.body;
      if (!description) {
        return res.status(400).json({ error: "No description provided" });
      }

      const parsedData = await parseChecklistDescription(description);
      res.json(parsedData);
    } catch (error: any) {
      console.error("[Server] Error in /api/parse-checklist:", error);
      res.status(500).json({ error: error.message || "Failed to parse description" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Running in development mode, mounting Vite...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server] Running in production mode, serving static files...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
