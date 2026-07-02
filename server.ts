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
      // and ensure turns alternate strictly by merging consecutive turns of the same role.
      const contents: any[] = [];
      if (history && Array.isArray(history)) {
        for (const msg of history) {
          if (!msg.content || typeof msg.content !== "string") continue;
          
          const role = msg.role === "assistant" ? "model" : "user";
          const lastTurn = contents[contents.length - 1];
          
          if (lastTurn && lastTurn.role === role) {
            lastTurn.parts.push({ text: msg.content });
          } else {
            contents.push({
              role: role,
              parts: [{ text: msg.content }],
            });
          }
        }
      }

      // Append the current user prompt
      const lastTurn = contents[contents.length - 1];
      if (lastTurn && lastTurn.role === "user") {
        lastTurn.parts.push({ text: prompt });
      } else {
        contents.push({ role: "user", parts: [{ text: prompt }] });
      }

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
      console.error("=== EXPRESS GEMINI API ERROR ===");
      console.error("Message:", error?.message);
      console.error("Stack:", error?.stack);
      if (error?.status) console.error("HTTP Status Code:", error.status);
      if (error?.statusCode) console.error("HTTP Status Code (alt):", error.statusCode);
      if (error?.cause) console.error("Cause/Root Error:", error.cause);
      try {
        console.error("Detailed Error JSON:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      } catch (jsonErr) {
        console.error("Could not serialize error object. Raw error:", error);
      }
      console.error("=================================");

      res.status(500).json({ 
        error: error?.message || "Ocorreu um erro de comunicação com o servidor do Gemini.",
        details: error?.stack || String(error)
      });
    }
  });

  // Endpoint to parse checklist description
  app.post("/api/gemini/parse-checklist", async (req, res) => {
    try {
      const { description } = req.body;
      if (!description) {
        return res.status(400).json({ error: "A descrição é obrigatória." });
      }

      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return res.status(400).json({ 
          error: "Chave do Gemini API não configurada." 
        });
      }

      const ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const prompt = `
        Analise a seguinte descrição de estado de uma viatura policial e extraia as informações para um checklist.
        Retorne APENAS um objeto JSON com os campos que encontrar.
        
        Campos possíveis:
        - mapaDiario: 'SIM' ou 'NÃO'
        - equipamentos: array de strings (ex: ["Giroflex", "Sirene"])
        - luzFarolAlto, luzFarolBaixo, luzLanterna, luzPlaca: 'Todos funcionam', 'Direito queimado', 'Esquerdo queimado', 'Todas queimados', 'Funciona', 'Queimada'
        - luzFreioLanternaTraseira: array de strings (ex: ["TODAS FUNCIONANDO", "Luz de Freio Dir. Queimada"])
        - pneus: 'Novo', 'Meia vida', 'Inutilizável (Motivo de baixa)'
        - sistemaFreio: 'Freio funcionando', 'Freio falhando', 'Sem Freios (Motivo de baixa)'
        - oleoMotor: 'Nível Normal', 'Nível Baixo', 'Nível sem condições (Baixar VTR)'
        - proxTrocaOleoKm: string com o KM
        - partesInternas: array de strings (ex: ["SEM ALTERAÇÃO", "BANCOS"])
        - partesExternas: array de strings (ex: ["Sem Alteração", "PINTURA"])
        - sistemaTracao: 'Kit de tração em condições', 'Kit de tração desgastado', 'Kit de tração sem condições (Baixar VTR)'
        - limpeza: 'SIM' ou 'NÃO'
        - descricaoAlteracoes: string com detalhes adicionais
        
        Descrição: "${description}"
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      res.json(JSON.parse(response.text || "{}"));
    } catch (error: any) {
      console.error("Parse Checklist Error:", error);
      res.status(500).json({ error: error?.message || "Erro ao processar checklist." });
    }
  });

  // Endpoint to extract license plate from base64 image
  app.post("/api/gemini/extract-plate", async (req, res) => {
    try {
      const { base64Image } = req.body;
      if (!base64Image) {
        return res.status(400).json({ error: "A imagem é obrigatória." });
      }

      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return res.status(400).json({ 
          error: "Chave do Gemini API não configurada." 
        });
      }

      const ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const prompt = "Identifique a placa da viatura nesta imagem. Retorne APENAS a placa (ex: ABC1D23) ou a palavra 'NONE' se não encontrar.";

      let rawBase64 = base64Image;
      let mimeType = "image/jpeg";
      if (base64Image.includes(",")) {
        const parts = base64Image.split(",");
        rawBase64 = parts[1];
        const match = parts[0].match(/data:(.*?);base64/);
        if (match) {
          mimeType = match[1];
        }
      }

      const imagePart = {
        inlineData: {
          data: rawBase64,
          mimeType: mimeType,
        },
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [prompt, imagePart],
      });

      const plate = (response.text || "").trim().toUpperCase();
      res.json({ plate });
    } catch (error: any) {
      console.error("Extract Plate Error:", error);
      res.status(500).json({ error: error?.message || "Erro ao extrair placa." });
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
