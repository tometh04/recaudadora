import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load .env manually (no external dependency needed)
const envPath = join(rootDir, '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  MAX_MESSAGES: parseInt(process.env.MAX_MESSAGES || '10000', 10),
  AUTH_DIR: join(rootDir, process.env.AUTH_DIR || 'auth_sessions'),
  MEDIA_DIR: join(rootDir, process.env.MEDIA_DIR || 'media'),

  // Supabase — for creating inbox_items
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // OpenAI — for OCR on receipt images
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

  // Only ingest images from direct chats (not groups)
  INGEST_GROUPS: process.env.INGEST_GROUPS === 'true',
};
