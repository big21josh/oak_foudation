export const getSupabaseUrl = (): string | undefined =>
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

export const getSupabaseKey = (): string | undefined =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isConfigured = (): boolean => {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  return Boolean(url && key);
};
