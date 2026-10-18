/* Username/password authentication. Privileged operations live in staff-auth. */
'use strict';
async function tdStaffRequest(body) {
  if (!db) throw new Error('登录服务尚未连接');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let result, error;
  try { ({ data: result, error } = await db.functions.invoke('staff-auth', { body, signal: controller.signal })); }
  finally { clearTimeout(timeout); }
  if (error) {
    let message = '账号服务请求失败，请确认测试后台已部署并检查网络';
    try { const response = await error.context?.json(); if (response?.message) message = response.message; } catch {}
    throw new Error(message);
  }
  if (!result?.ok) throw new Error(result?.message || '账号操作失败');
  return result;
}
async function tdStaffLogin(event) {
  event.preventDefault();
  const form = event.target, button = form.querySelector('button');
  button.disabled = true;
  try {
    const fields = new FormData(form);
    const result = await tdStaffRequest({ action: 'login', username: String(fields.get('username') || '').trim(), password: String(fields.get('password') || '') });
    const { data: signedIn, error } = await db.auth.setSession(result.session);
    if (error || !signedIn?.user) throw error || new Error('登录未返回用户');
    user = signedIn.user;
    await enter();
    form.reset();
  } catch (error) {
    notify('登录失败：' + error.message, true);
    $('auth').classList.remove('hidden');
  } finally { button.disabled = false; }
}
async function tdCreateStaff(event) {
  event.preventDefault();
  if (role !== 'owner') return notify('仅管理员可创建员工账号', true);
  const form = event.target, button = form.querySelector('button');
  button.disabled = true;
  try {
    const fields = Object.fromEntries(new FormData(form));
    await tdStaffRequest({ ...fields, action: 'create' });
    form.reset();
    notify('员工账号已创建，待管理员批准');
    await refresh();
  } catch (error) { notify('创建失败：' + error.message, true); }
  finally { button.disabled = false; }
}
async function tdSetStaffActive(id, active) {
  if (role !== 'owner') return notify('无权限', true);
  if (!confirm(active ? '批准这个员工账号？' : '停用这个员工账号？')) return;
  try {
    await tdStaffRequest({ action: 'set-active', member_id: id, active });
    notify(active ? '已批准' : '已停用');
    await refresh();
  } catch (error) { notify('操作失败：' + error.message, true); }
}
document.getElementById('loginForm').addEventListener('submit', tdStaffLogin);
connect();
