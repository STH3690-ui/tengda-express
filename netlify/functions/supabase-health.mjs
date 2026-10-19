// Diagnostic-only same-origin relay. No credentials or user data accepted.
const TARGET = 'https://yvsgawbbnyeyvynwghsc.supabase.co/auth/v1/health';
export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  try {
    const upstream = await fetch(TARGET, { method: 'GET', signal: AbortSignal.timeout(8000), redirect: 'error' });
    return new Response(JSON.stringify({ reachable: upstream.ok, upstreamStatus: upstream.status }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  } catch {
    return new Response(JSON.stringify({ reachable: false, error: 'upstream_unreachable' }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }
};
export const config = { path: '/api/supabase-health' };
