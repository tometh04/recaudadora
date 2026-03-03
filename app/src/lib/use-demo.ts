// Returns true when Supabase is not configured (demo mode)
export function isDemoMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !url || url === 'https://your-project.supabase.co';
}
