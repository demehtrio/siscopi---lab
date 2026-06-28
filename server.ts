import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser middleware
  app.use(express.json());

  // API endpoints
  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { prompt, history } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "O prompt é obrigatório." });
      }

      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return res.status(400).json({ 
          error: "Chave do Gemini API não configurada. Por favor, adicione a variável GEMINI_API_KEY no menu Settings > Secrets do Google AI Studio." 
        });
      }

      // Lazy initialization of Gemini client
      const ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      // Map roles from UI ("user" and "assistant") to Gemini format ("user" and "model")
      const contents: any[] = [];
      if (history && Array.isArray(history)) {
        for (const msg of history) {
          contents.push({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }],
          });
        }
      }
      contents.push({ role: "user", parts: [{ text: prompt }] });

      const systemInstruction = `Você é o Assistente SisCOpI AI, um assistente digital inteligente integrado ao Sistema de Cadastramento Operacional Integrado (SisCOpI).
O SisCOpI é utilizado para gestão de efetivo, cadastro de viaturas (VTR), checklist de viaturas e controle operacional das escalas e lançamentos.
Você ajuda policiais militares, comandantes de guarnição e operadores de frota a resolverem dúvidas sobre o uso do aplicativo, preenchimento de checklists, boas práticas de manutenção de viaturas, e procedimentos operacionais padrão.
Instruções:
- Seja sempre extremamente profissional, respeitoso (usando termos como 'Senhor', 'Garnição', 'Policial'), prestativo e claro.
- Responda em português brasileiro.
- Use formatação Markdown de forma elegante para listas, tabelas, destaques em negrito e blocos de código se necessário.
- Incentive a realização de checklists completos para garantir a segurança operacional de todos os policiais na rua.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ 
        error: error?.message || "Ocorreu um erro de comunicação com o servidor do Gemini." 
      });
    }
  });

  // Serve static files / Vite middleware
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
