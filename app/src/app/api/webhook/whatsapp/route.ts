import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

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
          const { data: existing } = await supabase
            .from('inbox_items')
            .select('id')
            .eq('wa_message_id', messageId)
            .single();

          if (existing) continue;

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

                  const { data: uploadData } = await supabase.storage
                    .from('comprobantes')
                    .upload(fileName, imgBuffer, {
                      contentType: 'image/jpeg',
                    });

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

          // Lookup client by phone
          const { data: phoneMapping } = await supabase
            .from('client_phones')
            .select('client_id')
            .eq('phone_number', phone)
            .eq('is_active', true)
            .single();

          // Create inbox item
          await supabase.from('inbox_items').insert({
            source: 'whatsapp',
            status: imageUrl ? 'recibido' : 'recibido',
            wa_message_id: messageId,
            wa_phone_number: phone,
            wa_timestamp: timestamp,
            client_id: phoneMapping?.client_id || null,
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
