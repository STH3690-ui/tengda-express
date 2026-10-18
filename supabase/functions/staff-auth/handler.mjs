const USERNAME = /^[a-z0-9_]{3,30}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVALID_LOGIN = '用户名、密码不正确，或账号尚未批准 / 已停用';
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function check(condition, message, status = 400) { if (!condition) throw new HttpError(status, message); }
export function createHandler({ createClient, env, randomUUID = () => crypto.randomUUID() }) {
  const url = env('SUPABASE_URL'), key = env('SUPABASE_ANON_KEY'), secret = env('SUPABASE_SERVICE_ROLE_KEY');
  const origins = new Set((env('TD_ALLOWED_ORIGINS') || '').split(',').map(x => x.trim()).filter(Boolean));
  const ready = env('TD_ENVIRONMENT') === 'tengda-v32-test' && env('TD_TEST_PROJECT_REF') &&
    url === `https://${env('TD_TEST_PROJECT_REF')}.supabase.co` && key && secret && origins.size;
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (origin && origins.has(origin)) Object.assign(headers, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    const reply = (status, result) => new Response(JSON.stringify(result), { status, headers });
    if (origin && !origins.has(origin)) return reply(403, { ok: false, message: '来源未授权' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { ok: false, message: '只接受 POST' });
    if (!ready) return reply(503, { ok: false, message: '测试账号后台尚未配置完成' });
    try {
      // Limit bytes before parsing (Content-Length alone is not trustworthy).
      const reader = request.body?.getReader(); let length = 0, chunks = [];
      check(reader, '请求不能为空');
      for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength;
        if (length > 8192) { await reader.cancel(); throw new HttpError(413, '请求过大'); } chunks.push(value); }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, '请求格式错误'); }
      check(body && typeof body === 'object' && !Array.isArray(body), '请求格式错误');
      const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      if (body.action === 'login') {
        check(username.length > 0 && username.length <= 254 && typeof body.password === 'string' && body.password.length > 0 && body.password.length <= 128, INVALID_LOGIN, 401);
        // Atomic persistent limiter: independent of Edge Function instance lifetime.
        const { data: allowed, error: rateError } = await admin.rpc('td_login_attempt_v32', { p_login: username });
        check(!rateError, '登录服务暂不可用', 503);
        check(allowed === true, '尝试过于频繁，请15分钟后重试', 429);
        const { data: accounts, error: lookupError } = await admin.rpc('td_login_identity_v32', { p_login: username });
        check(!lookupError, '登录服务暂不可用', 503);
        // Always perform a password verification, including unknown usernames.
        const account = accounts?.[0];
        const email = account?.auth_email || `${randomUUID()}@${env('TD_TEST_PROJECT_REF')}.supabase.co`;
        const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: signedIn, error } = await auth.auth.signInWithPassword({ email, password: body.password });
        check(!error && account && signedIn?.session && signedIn?.user?.id === account.id, INVALID_LOGIN, 401);
        const { data: member, error: memberError } = await admin.from('td_members').select('active').eq('id', account.id).maybeSingle();
        check(!memberError && member?.active === true, INVALID_LOGIN, 401);
        return reply(200, { ok: true, session: { access_token: signedIn.session.access_token, refresh_token: signedIn.session.refresh_token } });
      }
      check(['create', 'set-active'].includes(body.action), '未知操作');
      const authorization = request.headers.get('authorization') || '';
      check(/^Bearer \S+$/.test(authorization), '请先以管理员身份登录', 401);
      const caller = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
      const { data: authenticated, error: authError } = await caller.auth.getUser(authorization.slice(7));
      check(!authError && authenticated?.user, '登录已失效', 401);
      const { data: owner, error: ownerError } = await caller.from('td_members').select('role,active').eq('id', authenticated.user.id).maybeSingle();
      check(!ownerError && owner?.active === true && owner?.role === 'owner', '仅管理员可管理账号', 403);
      if (body.action === 'set-active') {
        check(UUID.test(body.member_id || '') && typeof body.active === 'boolean', '账号参数错误');
        // Check the target before any Auth admin operation; owner accounts are protected.
        const { data: target, error: targetError } = await admin.from('td_members').select('role').eq('id', body.member_id).maybeSingle();
        check(!targetError && target && target.role !== 'owner', '管理员账号不可在这里修改', 409);
        if (body.active) {
          // Unban first. A failed final transaction still leaves the account inactive in RLS.
          const { error: unbanError } = await admin.auth.admin.updateUserById(body.member_id, { ban_duration: 'none' });
          check(!unbanError, 'Auth 启用失败，账号仍未批准', 503);
        }
        // Authorization is checked again under the caller's JWT inside the transaction.
        const { error } = await caller.rpc('td_set_staff_active_v32', { p_member: body.member_id, p_active: body.active });
        check(!error, '账号状态更新失败，管理员账号不可在这里修改', 409);
        if (!body.active) {
          // Revoke business access first. A stale JWT is rejected by database guards immediately.
          const { error: banError } = await admin.auth.admin.updateUserById(body.member_id, { ban_duration: '876000h' });
          check(!banError, '业务访问已停用，但 Auth 禁用未完成，请重试停用', 503);
        }
        return reply(200, { ok: true });
      }
      check(USERNAME.test(username), '用户名须为3–30位英文字母、数字或下划线');
      const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
      const phone = typeof body.contact_phone === 'string' ? body.contact_phone.trim() : '';
      const contactEmail = typeof body.email === 'string' ? body.email.trim() : '';
      check(displayName.length > 0 && displayName.length <= 60 && phone.length <= 30, '姓名或联系电话格式错误');
      check(!contactEmail || (contactEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)), '邮箱格式错误');
      check(typeof body.password === 'string' && body.password.length >= 12 && body.password.length <= 128, '密码长度须为12–128位');
      // Random internal identity on this project's real domain, never a fabricated example domain.
      // Contact email is optional profile data; Auth never sends mail to this internal identity.
      const { data: created, error: creationError } = await admin.auth.admin.createUser({
        email: `${randomUUID()}@${env('TD_TEST_PROJECT_REF')}.supabase.co`, password: body.password,
        email_confirm: true, ban_duration: '876000h', user_metadata: { display_name: displayName },
      });
      check(!creationError && created?.user, '创建账号失败，请检查 Auth 密码策略', 409);
      const { error: profileError } = await caller.rpc('td_provision_staff_v32', {
        p_user: created.user.id, p_username: username, p_name: displayName, p_email: contactEmail || null, p_phone: phone,
      });
      if (profileError) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
        // Never log raw errors, passwords, JWTs, email identities or keys.
        if (cleanupError) console.error('staff-auth provisioning cleanup failed; inspect pending Auth users');
        throw new HttpError(409, '创建失败：用户名可能已存在，或数据库迁移尚未完成');
      }
      return reply(201, { ok: true, member_id: created.user.id });
    } catch (error) {
      return reply(error instanceof HttpError ? error.status : 500, {
        ok: false, message: error instanceof HttpError ? error.message : '账号服务暂不可用',
      });
    }
  };
}
