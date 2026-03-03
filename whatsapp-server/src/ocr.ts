import OpenAI from 'openai';
import { config } from './config.js';

export interface OcrExtraction {
  amount: number | null;
  date: string | null;           // YYYY-MM-DD
  reference: string | null;
  bank_name: string | null;
  account_number: string | null;
  sender_name: string | null;    // Name of the person who sent the transfer
  sender_cuit: string | null;    // CUIT/CUIL of sender
  receiver_name: string | null;  // Name of the receiver
  receiver_cuit: string | null;  // CUIT/CUIL of receiver
  description: string | null;
  amount_confidence: number;     // 0-1
  date_confidence: number;       // 0-1
  reference_confidence: number;  // 0-1
  raw_text: string;
}

const SYSTEM_PROMPT = `Sos un sistema de OCR especializado en comprobantes bancarios y de pago argentinos.
Analizá la imagen y extraé los siguientes datos:

1. **amount**: Monto total de la operación (número decimal, sin símbolos. Ej: 63400.00)
2. **date**: Fecha de la transacción en formato YYYY-MM-DD
3. **reference**: Número de comprobante/referencia/operación
4. **bank_name**: Nombre del banco o entidad DESTINO donde se recibe el pago (ej: Macro, Credicoop, Mercado Pago)
5. **account_number**: CBU, CVU, alias o número de cuenta DESTINO si es visible
6. **sender_name**: Nombre completo de quien ENVÍA/ORDENA la transferencia
7. **sender_cuit**: CUIT/CUIL de quien envía
8. **receiver_name**: Nombre completo de quien RECIBE la transferencia
9. **receiver_cuit**: CUIT/CUIL de quien recibe
10. **description**: Breve descripción de lo que ves en el comprobante (1 oración)

Para cada campo numérico extraído, evaluá tu confianza (0.0 a 1.0):
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
      max_tokens: 1500,
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
    console.log(`[OCR] Raw response: ${text.slice(0, 300)}`);

    // Parse JSON — handle possible markdown code block wrapping
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(jsonStr);

    return {
      amount: parsed.amount ?? null,
      date: parsed.date ?? null,
      reference: parsed.reference ?? null,
      bank_name: parsed.bank_name ?? null,
      account_number: parsed.account_number ?? null,
      sender_name: parsed.sender_name ?? null,
      sender_cuit: parsed.sender_cuit ?? null,
      receiver_name: parsed.receiver_name ?? null,
      receiver_cuit: parsed.receiver_cuit ?? null,
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
