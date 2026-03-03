import OpenAI from 'openai';
import { config } from './config.js';

export interface OcrExtraction {
  amount: number | null;
  date: string | null;           // YYYY-MM-DD
  reference: string | null;
  bank_name: string | null;
  account_number: string | null;
  description: string | null;
  amount_confidence: number;     // 0-1
  date_confidence: number;       // 0-1
  reference_confidence: number;  // 0-1
  raw_text: string;
}

const SYSTEM_PROMPT = `Sos un sistema de OCR especializado en comprobantes bancarios y de pago argentinos.
Analizá la imagen y extraé los siguientes datos:

1. **amount**: Monto total de la operación (número decimal, sin símbolos)
2. **date**: Fecha de la transacción en formato YYYY-MM-DD
3. **reference**: Número de comprobante/referencia/operación
4. **bank_name**: Nombre del banco o entidad (ej: Macro, Credicoop, Mercado Pago)
5. **account_number**: CBU, CVU, alias o número de cuenta si es visible
6. **description**: Breve descripción de lo que ves en el comprobante (1 oración)

Para cada campo extraído, evaluá tu confianza (0.0 a 1.0):
- **amount_confidence**: qué tan seguro estás del monto
- **date_confidence**: qué tan seguro estás de la fecha
- **reference_confidence**: qué tan seguro estás de la referencia

Si no podés extraer un campo, poné null y confianza 0.

Respondé ÚNICAMENTE con un JSON válido, sin texto extra ni markdown.`;

export async function processOcr(imageUrl: string): Promise<OcrExtraction | null> {
  if (!config.OPENAI_API_KEY) {
    console.warn('[OCR] OpenAI API key not configured, skipping OCR');
    return null;
  }

  try {
    const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'high' },
            },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || '';
    console.log(`[OCR] Raw response: ${text.slice(0, 200)}`);

    // Parse JSON — handle possible markdown code block wrapping
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(jsonStr);

    return {
      amount: parsed.amount ?? null,
      date: parsed.date ?? null,
      reference: parsed.reference ?? null,
      bank_name: parsed.bank_name ?? null,
      account_number: parsed.account_number ?? null,
      description: parsed.description ?? null,
      amount_confidence: Math.min(1, Math.max(0, parsed.amount_confidence ?? 0)),
      date_confidence: Math.min(1, Math.max(0, parsed.date_confidence ?? 0)),
      reference_confidence: Math.min(1, Math.max(0, parsed.reference_confidence ?? 0)),
      raw_text: text,
    };
  } catch (err) {
    console.error('[OCR] Processing error:', err);
    return null;
  }
}

/** Convert 0-1 float to 'alta' | 'media' | 'baja' */
export function confidenceLabel(score: number): 'alta' | 'media' | 'baja' {
  if (score >= 0.8) return 'alta';
  if (score >= 0.5) return 'media';
  return 'baja';
}
