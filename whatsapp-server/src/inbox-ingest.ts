/**
 * inbox-ingest.ts
 *
 * Bridges WhatsApp messages from Baileys → Supabase inbox_items.
 * When an image/document arrives:
 *   1. Upload to Supabase Storage ("comprobantes" bucket)
 *   2. For PDFs: convert first page to JPEG for OCR
 *   3. Look up sender phone → client mapping
 *   4. Create inbox_item with status "ocr_procesando"
 *   5. Run OCR with OpenAI Vision
 *   6. Auto-match bank_name → account in accounts table
 *   7. Update inbox_item with extracted data → status "ocr_listo"
 *   8. Create ocr_results record
 */

import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';

import { config } from './config.js';
import { getSupabase, isSupabaseConfigured } from './supabase.js';
import { processOcr, confidenceLabel } from './ocr.js';
import { convertPdfToJpeg, fileToBase64DataUrl } from './pdf-to-image.js';
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

    // 2. Upload original file to Supabase Storage
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

    // 2b. For PDFs: convert first page to JPEG and upload that too
    let ocrImageUrl = publicUrl;
    const isPdf = (msg.mimeType || '').includes('pdf') || ext === 'pdf';

    if (isPdf) {
      console.log(`[Ingest] PDF detected, converting first page to image...`);
      const jpegPath = convertPdfToJpeg(fullPath);

      if (jpegPath && existsSync(jpegPath)) {
        const jpegBuffer = readFileSync(jpegPath);
        const jpegStoragePath = storagePath.replace(`.${ext}`, '_page1.jpg');

        const { error: jpegUploadError } = await supabase.storage
          .from('comprobantes')
          .upload(jpegStoragePath, jpegBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (!jpegUploadError) {
          const { data: { publicUrl: jpegPublicUrl } } = supabase.storage
            .from('comprobantes')
            .getPublicUrl(jpegStoragePath);
          ocrImageUrl = jpegPublicUrl;
          console.log(`[Ingest] PDF page 1 uploaded: ${jpegStoragePath}`);
        }

        // Clean up temp JPEG file
        try { unlinkSync(jpegPath); } catch {}
      } else {
        // Fallback: send the PDF as base64 data URL (won't work with OpenAI Vision,
        // but at least the inbox_item gets created)
        console.warn(`[Ingest] PDF conversion failed, OCR may not work`);
      }
    }

    // 3. Look up sender phone → client
    const cleanPhone = msg.phoneNumber.replace(/\D/g, '');
    let clientId = await findClientByPhone(cleanPhone);

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

    // 5. Run OCR in background (non-blocking)
    runOcrInBackground(inboxItemId, ocrImageUrl).catch((err) =>
      console.error(`[Ingest] Background OCR error:`, err)
    );

  } catch (err) {
    console.error(`[Ingest] Error processing message ${msg.id}:`, err);
  }
}

/** Look up client by phone number, trying multiple formats */
async function findClientByPhone(cleanPhone: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  // Try multiple phone formats (Argentine numbers)
  const phonesToTry = [
    cleanPhone,
    cleanPhone.replace(/^549/, ''),
    cleanPhone.replace(/^54/, ''),
    `549${cleanPhone}`,
    `54${cleanPhone}`,
  ];

  for (const phone of phonesToTry) {
    const { data } = await supabase
      .from('client_phones')
      .select('client_id')
      .eq('phone_number', phone)
      .eq('is_active', true)
      .maybeSingle();

    if (data?.client_id) return data.client_id;
  }

  return null;
}

/** Try to match OCR bank_name to an account in the accounts table */
async function matchAccount(bankName: string | null): Promise<string | null> {
  if (!bankName) return null;

  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, bank_name')
    .eq('is_active', true);

  if (!accounts || accounts.length === 0) return null;

  const normalizedBank = bankName.toLowerCase().trim();

  // Exact or partial match on name or bank_name
  for (const account of accounts) {
    const accName = (account.name || '').toLowerCase();
    const accBank = (account.bank_name || '').toLowerCase();

    if (
      accName.includes(normalizedBank) ||
      accBank.includes(normalizedBank) ||
      normalizedBank.includes(accName) ||
      normalizedBank.includes(accBank)
    ) {
      console.log(`[Ingest] Matched bank "${bankName}" → account "${account.name}" (${account.id})`);
      return account.id;
    }
  }

  // Common aliases
  const aliases: Record<string, string[]> = {
    'mercado pago': ['mercadopago', 'mp', 'mercado libre'],
    'banco macro': ['macro'],
    'banco credicoop': ['credicoop'],
    'banco nacion': ['nacion', 'bna'],
    'banco provincia': ['provincia', 'bapro'],
    'banco galicia': ['galicia'],
    'banco santander': ['santander'],
    'banco bbva': ['bbva', 'frances'],
    'banco hsbc': ['hsbc'],
    'brubank': ['brubank'],
    'uala': ['ualá', 'uala'],
    'naranja x': ['naranja'],
  };

  for (const account of accounts) {
    const accName = (account.name || '').toLowerCase();
    const accBank = (account.bank_name || '').toLowerCase();

    for (const [key, alts] of Object.entries(aliases)) {
      const bankMatches = normalizedBank.includes(key) || alts.some(a => normalizedBank.includes(a));
      const accMatches = accName.includes(key) || accBank.includes(key) ||
        alts.some(a => accName.includes(a) || accBank.includes(a));

      if (bankMatches && accMatches) {
        console.log(`[Ingest] Matched bank "${bankName}" → account "${account.name}" via alias`);
        return account.id;
      }
    }
  }

  return null;
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

  // Auto-match account by bank name
  const accountId = await matchAccount(ocr.bank_name);

  // Update inbox_item with OCR results + auto-matched account
  const updatePayload: Record<string, any> = {
    status: 'ocr_listo',
    amount: ocr.amount,
    transaction_date: ocr.date,
    reference_number: ocr.reference,
    ocr_amount_confidence: confidenceLabel(ocr.amount_confidence),
    ocr_date_confidence: confidenceLabel(ocr.date_confidence),
    ocr_reference_confidence: confidenceLabel(ocr.reference_confidence),
  };

  if (accountId) {
    updatePayload.account_id = accountId;
  }

  await supabase
    .from('inbox_items')
    .update(updatePayload)
    .eq('id', inboxItemId);

  // Create ocr_results record
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
        sender_name: ocr.sender_name,
        sender_cuit: ocr.sender_cuit,
        receiver_name: ocr.receiver_name,
        receiver_cuit: ocr.receiver_cuit,
        description: ocr.description,
      },
    });

  console.log(
    `[Ingest] OCR complete for ${inboxItemId}: ` +
    `$${ocr.amount} | ${ocr.date} | ref:${ocr.reference} | bank:${ocr.bank_name} | acct:${accountId || 'none'} | ${processingTimeMs}ms`
  );
}
