import { createHealth } from '../lib/supabase-proxy.mjs';
export default createHealth();
export const config = { path: '/api/supabase-health' };
