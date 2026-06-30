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
        if (req.url === '/api/gemini/generate' && req.method === 'POST') {
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
                console.error("Vite Gemini Plugin Execution Error:", err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err?.message || "Erro ao processar requisição do Gemini." }));
              }
            });
          } catch (err: any) {
            console.error("Vite Gemini Plugin Parse Error:", err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || "Erro ao receber dados." }));
          }
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
