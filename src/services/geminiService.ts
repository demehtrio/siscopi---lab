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
  try {
    const response = await fetch('/api/gemini/parse-checklist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error parsing checklist with Gemini:", error);
    return {};
  }
}

export async function extractLicensePlateFromImage(base64Image: string): Promise<string> {
  try {
    const response = await fetch('/api/gemini/extract-plate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ base64Image }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    return data.plate || "NONE";
  } catch (error) {
    console.error("Error extracting plate with Gemini:", error);
    return "NONE";
  }
}
