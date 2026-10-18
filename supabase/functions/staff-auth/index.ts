import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { createHandler } from './handler.mjs';

// Non-secret settings locked to the V3.2 TEST environment.
// Server credentials continue to come exclusively from Supabase runtime secrets.
const TEST_REF = 'amknufvdvqfhrgtobpwg';
const TEST_ORIGIN = 'https://tengda-v31-test.netlify.app';
const env = (name: string): string | undefined => {
  if (name === 'TD_ENVIRONMENT') return 'tengda-v32-test';
  if (name === 'TD_TEST_PROJECT_REF') return TEST_REF;
  if (name === 'TD_ALLOWED_ORIGINS') return TEST_ORIGIN;
  return Deno.env.get(name);
};
Deno.serve(createHandler({ createClient, env }));
