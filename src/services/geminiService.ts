import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

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
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });
    const text = response.text || "";
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
    throw new Error("A chave de API GEMINI_API_KEY do servidor não está configurada.");
  }

  const prompt = `Identify the vehicle license plate in the image.
Return ONLY the alphanumeric characters of the plate in uppercase, without spaces, hifens, or any other punctuation (for example: ABC1D23, KGT4123, PE1004).
If no license plate is visible in the image, or if it cannot be identified, return strictly "NONE".
Do not include any extra words, comments, introductions or reasoning.`;

  try {
    const parts = base64Image.split(",");
    const rawData = parts.length > 1 ? parts[1] : parts[0];
    const mimeMatch = base64Image.match(/^data:([^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";

    const imagePart = {
      inlineData: {
        data: rawData,
        mimeType: mimeType,
      },
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [prompt, imagePart],
    });
    
    const plateText = response.text || "";
    const result = plateText.trim().toUpperCase();
    console.log("[Gemini API] Plate OCR result:", result);
    return result;
  } catch (error: any) {
    console.error("Error extracting plate with Gemini:", error);
    throw new Error(`Erro na API do Gemini: ${error.message || error}`);
  }
}
