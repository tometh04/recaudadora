import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

const CLASSIFICATION_PROMPT = `Mirá esta imagen y respondé ÚNICAMENTE con un JSON válido:
{"is_comprobante": true} o {"is_comprobante": false}

Respondé true SOLO si la imagen es un comprobante de pago, transferencia bancaria, recibo, depósito, o cualquier constancia de transacción financiera.
Respondé false si es una foto personal, meme, captura de conversación, selfie, paisaje, producto, o cualquier otra cosa que NO sea un comprobante financiero.`;

// GET — WhatsApp webhook verification
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST — WhatsApp incoming messages
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createServiceRoleClient();

    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        if (change.field !== 'messages') continue;
        const messages = change.value?.messages || [];

        for (const message of messages) {
          const messageId = message.id;
          const phone = message.from;
          const timestamp = message.timestamp
            ? new Date(parseInt(message.timestamp) * 1000).toISOString()
            : new Date().toISOString();

          // Idempotency: skip if already processed
          const { data: existingRows } = await supabase
            .from('inbox_items')
            .select('id')
            .eq('wa_message_id', messageId)
            .limit(1);

          if (existingRows && existingRows.length > 0) continue;

          let imageUrl: string | null = null;

          // Handle image messages
          if (message.type === 'image' && message.image?.id) {
            // Download media from WhatsApp API
            const mediaRes = await fetch(
              `https://graph.facebook.com/v18.0/${message.image.id}`,
              {
                headers: {
                  Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
                },
              }
            );

            if (mediaRes.ok) {
              const mediaData = await mediaRes.json();

              if (mediaData.url) {
                const imgRes = await fetch(mediaData.url, {
                  headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
                  },
                });

                if (imgRes.ok) {
                  const imgBuffer = await imgRes.arrayBuffer();
                  const fileName = `wa-${messageId}.jpg`;

                  const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('comprobantes')
                    .upload(fileName, imgBuffer, {
                      contentType: 'image/jpeg',
                    });

                  if (uploadError) {
                    console.error('Storage upload error:', uploadError.message);
                  }

                  if (uploadData) {
                    const {
                      data: { publicUrl },
                    } = supabase.storage
                      .from('comprobantes')
                      .getPublicUrl(fileName);
                    imageUrl = publicUrl;
                  }
                }
              }
            }
          }

          // Classify image: is it a comprobante?
          let isComprobante = true; // default: let it through (fail-open)
          if (imageUrl && process.env.OPENAI_API_KEY) {
            try {
              const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 10000 });
              const res = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                max_tokens: 50,
                messages: [
                  { role: 'system', content: CLASSIFICATION_PROMPT },
                  {
                    role: 'user',
                    content: [
                      { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
                    ],
                  },
                ],
              });
              const text = res.choices[0]?.message?.content?.trim() || '';
              const json = JSON.parse(text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim());
              isComprobante = json.is_comprobante === true;
            } catch (e) {
              console.error('Classification error (fail-open):', e);
              isComprobante = true; // if classification fails, let it through
            }
          }

          // Lookup client by phone (use limit(1) instead of .single() to avoid throws)
          const { data: phoneMappings } = await supabase
            .from('client_phones')
            .select('client_id')
            .eq('phone_number', phone)
            .eq('is_active', true)
            .limit(1);

          // Create inbox item
          await supabase.from('inbox_items').insert({
            source: 'whatsapp',
            status: isComprobante ? 'recibido' : 'descartado',
            wa_message_id: messageId,
            wa_phone_number: phone,
            wa_timestamp: timestamp,
            client_id: phoneMappings?.[0]?.client_id || null,
            original_image_url: imageUrl,
          });
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ status: 'ok' });
  }
}
