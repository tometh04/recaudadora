import DashboardShell from '@/components/layout/DashboardShell';
import { DEMO_PROFILE } from '@/lib/demo-data';
import type { Profile } from '@/types/database';

async function getProfile(): Promise<Profile | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isDemo = !url || url === 'https://your-project.supabase.co';

  if (isDemo) {
    return DEMO_PROFILE;
  }

  // Dynamic imports to avoid errors when Supabase is not configured
  const { createServerSupabaseClient } = await import('@/lib/supabase/server');
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { redirect } = await import('next/navigation');
    redirect('/login');
    return null; // unreachable, but satisfies TS
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single();

  return profile as Profile | null;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

  return (
    <DashboardShell initialProfile={profile}>{children}</DashboardShell>
  );
}
