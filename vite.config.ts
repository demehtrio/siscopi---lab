import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import packageJson from './package.json';

const buildTimestamp = new Date().toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

function geminiApiPlugin(env: Record<string, string>) {
  return {
    name: 'gemini-api-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        // Handle CORS & OPTIONS preflight
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        const urlObj = new URL(req.url || '', 'http://localhost');
        const pathname = urlObj.pathname.replace(/\/$/, ''); // Normaliza removendo barra final se houver

        if (pathname === '/api/gemini/generate' && req.method === 'POST') {
          try {
            let body = '';
            req.on('data', (chunk: any) => {
              body += chunk;
            });
            req.on('end', async () => {
              try {
                const { prompt, history } = JSON.parse(body);
                if (!prompt) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: "O prompt é obrigatório." }));
                  return;
                }

                const key = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
                if (!key) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ 
                    error: "Chave do Gemini API não configurada. Por favor, adicione a variável GEMINI_API_KEY no menu Settings > Secrets do Google AI Studio." 
                  }));
                  return;
                }

                const { GoogleGenAI } = await import("@google/genai");
                const ai = new GoogleGenAI({
                  apiKey: key,
                  httpOptions: {
                    headers: {
                      "User-Agent": "aistudio-build",
                    },
                  },
                });

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

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ text: response.text }));
              } catch (err: any) {
                console.error("=== VITE GEMINI PLUGIN EXECUTION ERROR ===");
                console.error("Message:", err?.message);
                console.error("Stack:", err?.stack);
                if (err?.status) console.error("HTTP Status Code:", err.status);
                if (err?.statusCode) console.error("HTTP Status Code (alt):", err.statusCode);
                if (err?.cause) console.error("Cause/Root Error:", err.cause);
                try {
                  console.error("Detailed Error JSON:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
                } catch (jsonErr) {
                  console.error("Could not serialize error object. Raw error:", err);
                }
                console.error("==========================================");

                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ 
                  error: err?.message || "Erro ao processar requisição do Gemini.",
                  details: err?.stack || String(err)
                }));
              }
            });
          } catch (err: any) {
            console.error("=== VITE GEMINI PLUGIN PARSE ERROR ===");
            console.error("Message:", err?.message);
            console.error("Stack:", err?.stack);
            try {
              console.error("Detailed Error JSON:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
            } catch (jsonErr) {
              console.error("Could not serialize error object. Raw error:", err);
            }
            console.error("======================================");

            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || "Erro ao receber dados." }));
          }
          return;
        } else if (pathname === '/api/gemini/generate' && req.method === 'GET') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: "Método Não Permitido (GET). Esta rota aceita apenas requisições POST com o prompt no corpo da mensagem.",
            details: "Se você foi redirecionado para esta rota através de um GET, verifique se a sua requisição POST original foi interceptada ou redirecionada por políticas de cookies ou restrições de terceiros no navegador."
          }));
          return;
        } else if (pathname === '/api/gemini/parse-checklist' && req.method === 'POST') {
          try {
            let body = '';
            req.on('data', (chunk: any) => { body += chunk; });
            req.on('end', async () => {
              try {
                const { description } = JSON.parse(body);
                if (!description) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: "A descrição é obrigatória." }));
                  return;
                }

                const key = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
                if (!key) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: "Chave do Gemini API não configurada." }));
                  return;
                }

                const { GoogleGenAI } = await import("@google/genai");
                const ai = new GoogleGenAI({
                  apiKey: key,
                  httpOptions: { headers: { "User-Agent": "aistudio-build" } },
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
                  config: { responseMimeType: "application/json" },
                });

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(JSON.parse(response.text || "{}")));
              } catch (err: any) {
                console.error("Vite Parse Checklist Error:", err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err?.message || "Erro no parse de checklist." }));
              }
            });
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message }));
          }
          return;
        } else if (pathname === '/api/gemini/parse-checklist' && req.method === 'GET') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: "Método Não Permitido (GET). Esta rota aceita apenas requisições POST com a descrição no corpo da mensagem.",
            details: "Se você foi redirecionado para esta rota através de um GET, verifique se a sua requisição POST original foi interceptada ou redirecionada por políticas de cookies ou restrições de terceiros no navegador."
          }));
          return;
        } else if (pathname === '/api/gemini/extract-plate' && req.method === 'POST') {
          try {
            let body = '';
            req.on('data', (chunk: any) => { body += chunk; });
            req.on('end', async () => {
              try {
                const { base64Image } = JSON.parse(body);
                if (!base64Image) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: "A imagem é obrigatória." }));
                  return;
                }

                const key = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
                if (!key) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: "Chave do Gemini API não configurada." }));
                  return;
                }

                const { GoogleGenAI } = await import("@google/genai");
                const ai = new GoogleGenAI({
                  apiKey: key,
                  httpOptions: { headers: { "User-Agent": "aistudio-build" } },
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
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ plate }));
              } catch (err: any) {
                console.error("Vite Extract Plate Error:", err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err?.message || "Erro na extração de placa." }));
              }
            });
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message }));
          }
          return;
        } else if (pathname === '/api/gemini/extract-plate' && req.method === 'GET') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: "Método Não Permitido (GET). Esta rota aceita apenas requisições POST com a imagem em base64 no corpo da mensagem.",
            details: "Se você foi redirecionado para esta rota através de um GET, verifique se a sua requisição POST original foi interceptada ou redirecionada por políticas de cookies ou restrições de terceiros no navegador."
          }));
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), geminiApiPlugin(env)],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      '__APP_VERSION__': JSON.stringify(packageJson.version),
      '__BUILD_DATE__': JSON.stringify(buildTimestamp),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
