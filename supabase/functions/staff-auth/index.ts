import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { createHandler } from './handler.mjs';

// Public, project-specific configuration. Secrets come only from the Edge runtime.
// No production fallback to a test project or a wildcard origin is allowed.
const PRODUCTION_REF = 'yvsgawbbnyeyvynwghsc';
const env = (name: string): string | undefined => {
  if (name === 'TD_ENVIRONMENT') return 'tengda-v32-production';
  if (name === 'TD_PROJECT_REF') return PRODUCTION_REF;
  if (name === 'TD_ALLOWED_ORIGINS') return 'https://tengda-express-station.netlify.app';
  return Deno.env.get(name);
};
Deno.serve(createHandler({ createClient, env }));
