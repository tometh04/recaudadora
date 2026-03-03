import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

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

function confidenceLabel(score: number): 'alta' | 'media' | 'baja' {
  if (score >= 0.8) return 'alta';
  if (score >= 0.5) return 'media';
  return 'baja';
}

// POST /api/ocr/process
// Body: { inbox_item_id: string, image_url?: string }
// If image_url is not provided, it reads it from the inbox_item
export async function POST(request: NextRequest) {
  try {
    const { inbox_item_id, image_url } = await request.json();

    if (!inbox_item_id) {
      return NextResponse.json({ error: 'inbox_item_id is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const supabase = await createServiceRoleClient();

    // Get the inbox item
    const { data: item, error: fetchError } = await supabase
      .from('inbox_items')
      .select('id, original_image_url, status')
      .eq('id', inbox_item_id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Inbox item not found' }, { status: 404 });
    }

    const imgUrl = image_url || item.original_image_url;
    if (!imgUrl) {
      return NextResponse.json({ error: 'No image URL available' }, { status: 400 });
    }

    // Update status to processing
    await supabase
      .from('inbox_items')
      .update({ status: 'ocr_procesando' })
      .eq('id', inbox_item_id);

    const startTime = Date.now();

    // Call OpenAI Vision
    const openai = new OpenAI({ apiKey });
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
              image_url: { url: imgUrl, detail: 'high' },
            },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || '';
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(jsonStr);

    const processingTimeMs = Date.now() - startTime;

    const ocr = {
      amount: parsed.amount ?? null,
      date: parsed.date ?? null,
      reference: parsed.reference ?? null,
      bank_name: parsed.bank_name ?? null,
      account_number: parsed.account_number ?? null,
      description: parsed.description ?? null,
      amount_confidence: Math.min(1, Math.max(0, parsed.amount_confidence ?? 0)),
      date_confidence: Math.min(1, Math.max(0, parsed.date_confidence ?? 0)),
      reference_confidence: Math.min(1, Math.max(0, parsed.reference_confidence ?? 0)),
    };

    // Update inbox_item
    await supabase
      .from('inbox_items')
      .update({
        status: 'ocr_listo',
        amount: ocr.amount,
        transaction_date: ocr.date,
        reference_number: ocr.reference,
        ocr_amount_confidence: confidenceLabel(ocr.amount_confidence),
        ocr_date_confidence: confidenceLabel(ocr.date_confidence),
        ocr_reference_confidence: confidenceLabel(ocr.reference_confidence),
      })
      .eq('id', inbox_item_id);

    // Create ocr_results record
    await supabase
      .from('ocr_results')
      .insert({
        inbox_item_id,
        raw_text: text,
        extracted_amount: ocr.amount,
        extracted_date: ocr.date,
        extracted_reference: ocr.reference,
        amount_confidence: ocr.amount_confidence,
        date_confidence: ocr.date_confidence,
        reference_confidence: ocr.reference_confidence,
        model_version: 'gpt-4o-mini',
        processing_time_ms: processingTimeMs,
        raw_response: {
          amount: ocr.amount,
          date: ocr.date,
          reference: ocr.reference,
          bank_name: ocr.bank_name,
          account_number: ocr.account_number,
          description: ocr.description,
        },
      });

    return NextResponse.json({
      status: 'ok',
      inbox_item_id,
      ocr,
      processing_time_ms: processingTimeMs,
    });
  } catch (error: any) {
    console.error('OCR processing error:', error);
    return NextResponse.json(
      { error: error.message || 'OCR processing failed' },
      { status: 500 }
    );
  }
}
