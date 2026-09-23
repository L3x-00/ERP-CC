import { esUrlSupabaseLoopback } from '../../supabase/semillas/guardia-supabase-local.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!esUrlSupabaseLoopback(url)) {
  throw new Error('La suite de integración exige NEXT_PUBLIC_SUPABASE_URL explícita de loopback.');
}
for (const nombre of ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
  if (!process.env[nombre]?.trim()) {
    throw new Error(`La suite de integración exige ${nombre} del stack local.`);
  }
}
