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
 *   6. Auto-find or CREATE client from OCR sender data
 *   7. Auto-find or CREATE account from OCR receiver/bank data
 *   8. Update inbox_item with extracted data → status "ocr_listo"
 *   9. Create ocr_results record
 */

import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';

import { config } from './config.js';
import { getSupabase, isSupabaseConfigured } from './supabase.js';
import { processOcr, confidenceLabel } from './ocr.js';
import { convertPdfToJpeg, fileToBase64DataUrl } from './pdf-to-image.js';
import type { WhatsAppMessage } from './types.js';

// ============================================================
// Billeteras virtuales vs bancos tradicionales
// ============================================================

const BILLETERAS = ['mercado pago', 'mercadopago', 'uala', 'ualá', 'brubank', 'naranja x', 'naranja', 'personal pay', 'modo', 'bimo', 'lemon', 'buenbit'];

function isBilletera(bankName: string): boolean {
  const lower = bankName.toLowerCase();
  return BILLETERAS.some(b => lower.includes(b));
}

// ============================================================
// Main ingestion
// ============================================================

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

    // 2b. For PDFs: convert first page to JPEG for OCR + preview
    const isPdf = (msg.mimeType || '').includes('pdf') || ext === 'pdf';
    let ocrLocalPath = fullPath;
    let ocrMimeType = msg.mimeType || 'image/jpeg';
    let processedImageUrl: string | null = null;

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
          processedImageUrl = jpegPublicUrl;
          console.log(`[Ingest] PDF preview JPEG uploaded: ${jpegStoragePath}`);
        }

        ocrLocalPath = jpegPath;
        ocrMimeType = 'image/jpeg';
        console.log(`[Ingest] PDF converted to JPEG for OCR: ${jpegPath}`);
      } else {
        console.warn(`[Ingest] PDF conversion failed, will try base64 fallback`);
        ocrLocalPath = fullPath;
        ocrMimeType = 'image/jpeg';
      }
    }

    // 3. Look up sender phone → client (initial, before OCR)
    const cleanPhone = msg.phoneNumber.replace(/\D/g, '');
    const initialClientId = await findClientByPhone(cleanPhone);

    // 4. Create inbox_item with "ocr_procesando" status
    const { data: inboxItem, error: insertError } = await supabase
      .from('inbox_items')
      .insert({
        source: 'whatsapp',
        status: config.OPENAI_API_KEY ? 'ocr_procesando' : 'recibido',
        wa_message_id: msg.id,
        wa_phone_number: cleanPhone,
        wa_timestamp: new Date(msg.timestamp * 1000).toISOString(),
        client_id: initialClientId,
        original_image_url: publicUrl,
        processed_image_url: processedImageUrl,
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
    runOcrInBackground(inboxItemId, ocrLocalPath, ocrMimeType, cleanPhone, msg.pushName).catch((err) =>
      console.error(`[Ingest] Background OCR error:`, err)
    );

  } catch (err) {
    console.error(`[Ingest] Error processing message ${msg.id}:`, err);
  }
}

// ============================================================
// Find client by phone (existing records only)
// ============================================================

async function findClientByPhone(cleanPhone: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

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

// ============================================================
// Find or CREATE client from OCR data + phone
// ============================================================

async function findOrCreateClient(
  cleanPhone: string,
  pushName: string | null,
  senderName: string | null,
  senderCuit: string | null,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  // 1. Try finding by phone first
  const byPhone = await findClientByPhone(cleanPhone);
  if (byPhone) {
    console.log(`[Ingest] Client found by phone: ${byPhone}`);
    return byPhone;
  }

  // 2. Try finding by CUIT if available
  if (senderCuit) {
    const normalizedCuit = senderCuit.replace(/[-\s]/g, '');
    const { data: byCuit } = await supabase
      .from('b2b_clients')
      .select('id')
      .eq('tax_id', normalizedCuit)
      .eq('is_active', true)
      .maybeSingle();

    if (byCuit) {
      console.log(`[Ingest] Client found by CUIT ${normalizedCuit}: ${byCuit.id}`);
      // Also register this phone for future lookups
      await registerPhone(byCuit.id, cleanPhone);
      return byCuit.id;
    }
  }

  // 3. Try finding by name (exact match)
  const name = senderName || pushName;
  if (name) {
    const { data: byName } = await supabase
      .from('b2b_clients')
      .select('id')
      .ilike('name', name.trim())
      .eq('is_active', true)
      .maybeSingle();

    if (byName) {
      console.log(`[Ingest] Client found by name "${name}": ${byName.id}`);
      await registerPhone(byName.id, cleanPhone);
      return byName.id;
    }
  }

  // 4. Not found → CREATE new client
  const clientName = senderName || pushName || `WhatsApp ${cleanPhone}`;
  const normalizedCuit = senderCuit ? senderCuit.replace(/[-\s]/g, '') : null;

  const { data: newClient, error: createError } = await supabase
    .from('b2b_clients')
    .insert({
      name: clientName,
      tax_id: normalizedCuit,
      contact_phone: cleanPhone,
      notes: `Auto-creado desde WhatsApp${senderCuit ? ` | CUIT: ${senderCuit}` : ''}`,
    })
    .select('id')
    .single();

  if (createError) {
    console.error(`[Ingest] Error creating client:`, createError.message);
    return null;
  }

  console.log(`[Ingest] Created new client "${clientName}" → ${newClient.id}`);

  // Register phone for this new client
  await registerPhone(newClient.id, cleanPhone);

  return newClient.id;
}

/** Register a phone number for a client (idempotent) */
async function registerPhone(clientId: string, cleanPhone: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  // Check if already registered
  const { data: existing } = await supabase
    .from('client_phones')
    .select('id')
    .eq('phone_number', cleanPhone)
    .maybeSingle();

  if (existing) return;

  const { error } = await supabase
    .from('client_phones')
    .insert({
      client_id: clientId,
      phone_number: cleanPhone,
      label: 'WhatsApp',
    });

  if (error) {
    // UNIQUE violation is OK (race condition)
    if (!error.message.includes('duplicate') && !error.message.includes('unique')) {
      console.error(`[Ingest] Error registering phone:`, error.message);
    }
  } else {
    console.log(`[Ingest] Registered phone ${cleanPhone} for client ${clientId}`);
  }
}

// ============================================================
// Find or CREATE account from OCR data
// ============================================================

async function findOrCreateAccount(
  bankName: string | null,
  accountNumber: string | null,
  receiverName: string | null,
  receiverCuit: string | null,
): Promise<string | null> {
  if (!bankName) return null;

  const supabase = getSupabase();
  if (!supabase) return null;

  const normalizedBank = bankName.toLowerCase().trim();

  // 1. Try finding existing account by bank_name or cbu
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, bank_name, cbu, account_number')
    .eq('is_active', true);

  if (accounts && accounts.length > 0) {
    // Direct match on bank_name
    for (const account of accounts) {
      const accName = (account.name || '').toLowerCase();
      const accBank = (account.bank_name || '').toLowerCase();
      const accCbu = (account.cbu || '').toLowerCase();

      // Match by CBU/CVU
      if (accountNumber && accCbu && accountNumber.includes(accCbu)) {
        console.log(`[Ingest] Account matched by CBU: ${account.name} (${account.id})`);
        return account.id;
      }

      // Match by bank name
      if (
        accName.includes(normalizedBank) ||
        accBank.includes(normalizedBank) ||
        normalizedBank.includes(accName) ||
        normalizedBank.includes(accBank)
      ) {
        console.log(`[Ingest] Account matched by bank: ${account.name} (${account.id})`);
        return account.id;
      }
    }

    // Alias matching
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
          console.log(`[Ingest] Account matched via alias: ${account.name} (${account.id})`);
          return account.id;
        }
      }
    }
  }

  // 2. Not found → CREATE new account
  const accountType = isBilletera(bankName) ? 'billetera' : 'banco';
  const displayName = receiverName
    ? `${bankName} - ${receiverName}`
    : bankName;

  const { data: newAccount, error: createError } = await supabase
    .from('accounts')
    .insert({
      name: displayName,
      account_type: accountType,
      bank_name: bankName,
      cbu: accountNumber || null,
      notes: `Auto-creado desde OCR${receiverCuit ? ` | CUIT receptor: ${receiverCuit}` : ''}`,
    })
    .select('id')
    .single();

  if (createError) {
    console.error(`[Ingest] Error creating account:`, createError.message);
    return null;
  }

  console.log(`[Ingest] Created new account "${displayName}" (${accountType}) → ${newAccount.id}`);
  return newAccount.id;
}

// ============================================================
// Background OCR + auto-create client/account
// ============================================================

async function runOcrInBackground(
  inboxItemId: string,
  localFilePath: string,
  mimeType: string,
  cleanPhone: string,
  pushName: string | null,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const startTime = Date.now();

  // Read local file and convert to base64 data URL for OpenAI Vision
  let dataUrl: string;
  try {
    const buffer = readFileSync(localFilePath);
    const base64 = buffer.toString('base64');
    const ocrMime = mimeType.includes('pdf') ? 'image/jpeg' : mimeType;
    dataUrl = `data:${ocrMime};base64,${base64}`;
    console.log(`[Ingest] Prepared base64 data URL for OCR (${Math.round(buffer.length / 1024)}KB, ${ocrMime})`);
  } catch (err) {
    console.error(`[Ingest] Failed to read file for OCR: ${localFilePath}`, err);
    await supabase.from('inbox_items').update({ status: 'recibido' }).eq('id', inboxItemId);
    return;
  }

  // Clean up converted JPEG files after reading
  if (localFilePath.includes('_page') && localFilePath.endsWith('.jpg')) {
    try { unlinkSync(localFilePath); } catch {}
  }

  const ocr = await processOcr(dataUrl);

  if (!ocr) {
    await supabase
      .from('inbox_items')
      .update({ status: 'recibido' })
      .eq('id', inboxItemId);
    return;
  }

  const processingTimeMs = Date.now() - startTime;

  // ---- Auto-find or CREATE client ----
  const clientId = await findOrCreateClient(
    cleanPhone,
    pushName,
    ocr.sender_name,
    ocr.sender_cuit,
  );

  // ---- Auto-find or CREATE account ----
  const accountId = await findOrCreateAccount(
    ocr.bank_name,
    ocr.account_number,
    ocr.receiver_name,
    ocr.receiver_cuit,
  );

  // Update inbox_item with OCR results + client + account
  const updatePayload: Record<string, any> = {
    status: 'ocr_listo',
    amount: ocr.amount,
    transaction_date: ocr.date,
    reference_number: ocr.reference,
    ocr_amount_confidence: confidenceLabel(ocr.amount_confidence),
    ocr_date_confidence: confidenceLabel(ocr.date_confidence),
    ocr_reference_confidence: confidenceLabel(ocr.reference_confidence),
  };

  if (clientId) {
    updatePayload.client_id = clientId;
  }
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
    `$${ocr.amount} | ${ocr.date} | ref:${ocr.reference} | ` +
    `sender:${ocr.sender_name || 'unknown'} → client:${clientId || 'none'} | ` +
    `bank:${ocr.bank_name} → acct:${accountId || 'none'} | ${processingTimeMs}ms`
  );
}
