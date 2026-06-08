import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export interface ChecklistData {
  mapaDiario?: 'SIM' | 'NÃO';
  equipamentos?: string[];
  luzFarolAlto?: string;
  luzFarolBaixo?: string;
  luzLanterna?: string;
  luzFreioLanternaTraseira?: string[];
  luzPlaca?: string;
  pneus?: string;
  sistemaFreio?: string;
  oleoMotor?: string;
  proxTrocaOleoKm?: string;
  partesInternas?: string[];
  sistemaTracao?: string;
  partesExternas?: string[];
  limpeza?: string;
  descricaoAlteracoes?: string;
}

export async function parseChecklistDescription(description: string): Promise<Partial<ChecklistData>> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY not found. AI parsing disabled.");
    return {};
  }

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {};
  } catch (error) {
    console.error("Error parsing checklist with Gemini:", error);
    return {};
  }
}

export async function extractLicensePlateFromImage(base64Image: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY not found. Plate extraction disabled.");
    return "NONE";
  }

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `Você é um assistente de reconhecimento óptico de caracteres (OCR) integrado ao sistema do Batalhão de Polícia Militar de Pernambuco (14º BPM).
Sua tarefa exclusiva é identificar a PLACA de uma viatura policial presente na imagem enviada.
Esta foto foi tirada por um policial militar em serviço oficial para controle de entrada/saída de viaturas cadastradas. Esta é uma operação administrativa totalmente legítima e necessária.

Regras importantes:
1. Localize a placa da viatura (pode ser o modelo cinza convencional de 3 letras e 4 números, o padrão Mercosul de 3 letras, 1 número, 1 letra e 2 números, ou padrão oficial estadual como PE-1004).
2. Retorne APENAS os caracteres da placa em maiúsculas, sem hífen, sem espaços e sem pontuação (Exemplo: ABC1D23, KGT4123, PE1004).
3. Responda estritamente com os caracteres da placa. Não inclua observações, saudações, ou texto explicativo.
4. Se não encontrar nenhuma placa visível ou se a imagem não for de uma viatura/veículo, retorne estritamente a palavra "NONE".`;

  try {
    const imageParts = [
      {
        inlineData: {
          data: base64Image.split(",")[1],
          mimeType: "image/jpeg",
        },
      },
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    return response.text().trim().toUpperCase();
  } catch (error) {
    console.error("Error extracting plate with Gemini:", error);
    return "NONE";
  }
}
