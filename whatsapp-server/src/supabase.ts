import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  if (!_client) {
    _client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return !!(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY);
}
