/**
 * inbox-ingest.ts
 *
 * Bridges WhatsApp messages from Baileys → Supabase inbox_items.
 * When an image arrives:
 *   1. Upload to Supabase Storage ("comprobantes" bucket)
 *   2. Look up sender phone → client mapping
 *   3. Create inbox_item with status "ocr_procesando"
 *   4. Run OCR with OpenAI Vision
 *   5. Update inbox_item with extracted data → status "ocr_listo"
 *   6. Create ocr_results record
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

import { config } from './config.js';
import { getSupabase, isSupabaseConfigured } from './supabase.js';
import { processOcr, confidenceLabel } from './ocr.js';
import type { WhatsAppMessage } from './types.js';

export async function ingestToInbox(msg: WhatsAppMessage, localMediaPath: string | null): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.log('[Ingest] Supabase not configured, skipping inbox ingestion');
    return;
  }

  // Only ingest images and documents (potential comprobantes)
  if (!['image', 'document'].includes(msg.messageType)) {
    return;
  }

  // Skip group messages unless configured
  if (msg.remoteJid.endsWith('@g.us') && !config.INGEST_GROUPS) {
    return;
  }

  // Skip messages we sent (fromMe) — unless it's an image we forwarded to ourselves
  // Actually, keep fromMe images too since Andrés might forward comprobantes to himself

  if (!localMediaPath) {
    console.warn(`[Ingest] No media file for message ${msg.id}, skipping`);
    return;
  }

  const supabase = getSupabase();
  if (!supabase) return;

  try {
    // 1. Check idempotency — don't create duplicate inbox_items
    const { data: existing } = await supabase
      .from('inbox_items')
      .select('id')
      .eq('wa_message_id', msg.id)
      .maybeSingle();

    if (existing) {
      console.log(`[Ingest] Message ${msg.id} already ingested, skipping`);
      return;
    }

    // 2. Upload image to Supabase Storage
    const fullPath = join(config.MEDIA_DIR, localMediaPath.replace('/media/', ''));
    const fileBuffer = readFileSync(fullPath);

    const ext = localMediaPath.split('.').pop() || 'jpg';
    const storagePath = `wa-${msg.sessionId}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('comprobantes')
      .upload(storagePath, fileBuffer, {
        contentType: msg.mimeType || 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error(`[Ingest] Upload error:`, uploadError.message);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('comprobantes')
      .getPublicUrl(storagePath);

    console.log(`[Ingest] Uploaded to Supabase Storage: ${storagePath}`);

    // 3. Look up sender phone → client
    const cleanPhone = msg.phoneNumber.replace(/\D/g, '');
    const { data: phoneMapping } = await supabase
      .from('client_phones')
      .select('client_id')
      .eq('phone_number', cleanPhone)
      .eq('is_active', true)
      .maybeSingle();

    // Try with different phone formats (with/without country code prefix)
    let clientId = phoneMapping?.client_id || null;
    if (!clientId) {
      // Try without leading country code (54 for Argentina)
      const altPhones = [
        cleanPhone,
        cleanPhone.replace(/^549/, ''),    // Remove 549 prefix
        cleanPhone.replace(/^54/, ''),     // Remove 54 prefix
        `549${cleanPhone}`,               // Add 549 prefix
        `54${cleanPhone}`,                // Add 54 prefix
      ];

      for (const altPhone of altPhones) {
        const { data: altMapping } = await supabase
          .from('client_phones')
          .select('client_id')
          .eq('phone_number', altPhone)
          .eq('is_active', true)
          .maybeSingle();

        if (altMapping?.client_id) {
          clientId = altMapping.client_id;
          break;
        }
      }
    }

    // 4. Create inbox_item with "ocr_procesando" status
    const { data: inboxItem, error: insertError } = await supabase
      .from('inbox_items')
      .insert({
        source: 'whatsapp',
        status: config.OPENAI_API_KEY ? 'ocr_procesando' : 'recibido',
        wa_message_id: msg.id,
        wa_phone_number: cleanPhone,
        wa_timestamp: new Date(msg.timestamp * 1000).toISOString(),
        client_id: clientId,
        original_image_url: publicUrl,
        notes: msg.textContent ? `Caption: ${msg.textContent}` : null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(`[Ingest] Insert error:`, insertError.message);
      return;
    }

    const inboxItemId = inboxItem.id;
    console.log(`[Ingest] Created inbox_item ${inboxItemId} for message ${msg.id}`);

    // 5. Run OCR (async, don't block message processing)
    runOcrInBackground(inboxItemId, publicUrl).catch((err) =>
      console.error(`[Ingest] Background OCR error:`, err)
    );

  } catch (err) {
    console.error(`[Ingest] Error processing message ${msg.id}:`, err);
  }
}

async function runOcrInBackground(inboxItemId: string, imageUrl: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const startTime = Date.now();
  const ocr = await processOcr(imageUrl);

  if (!ocr) {
    // OCR failed or not configured — leave as "recibido"
    await supabase
      .from('inbox_items')
      .update({ status: 'recibido' })
      .eq('id', inboxItemId);
    return;
  }

  const processingTimeMs = Date.now() - startTime;

  // 6. Update inbox_item with OCR results
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
    .eq('id', inboxItemId);

  // 7. Create ocr_results record
  await supabase
    .from('ocr_results')
    .insert({
      inbox_item_id: inboxItemId,
      raw_text: ocr.raw_text,
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

  console.log(
    `[Ingest] OCR complete for ${inboxItemId}: ` +
    `$${ocr.amount} | ${ocr.date} | ref:${ocr.reference} | ${processingTimeMs}ms`
  );
}
