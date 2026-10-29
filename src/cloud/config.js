// Supabase project for Waking Dream FPV (Sydney). The publishable key is designed to be public:
// row-level security in the database decides what each signed-in person can see.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jirvugtgclgdbysrfjsc.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_1s8PEHe6R0g4OVrC6_MlJQ_-pXp3jFX';
// Cloud features need a real web address (sign-in links come back to it). The offline single file can't use them.
export const cloudAvailable = () => typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !!SUPABASE_URL;
