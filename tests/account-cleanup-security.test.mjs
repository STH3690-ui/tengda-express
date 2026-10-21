import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/staff-auth/handler.mjs';

const settings = {
  SUPABASE_URL: 'https://testref.supabase.co',
  SUPABASE_ANON_KEY: 'public-key',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only-secret',
  TD_TEST_PROJECT_REF: 'testref',
  TD_ENVIRONMENT: 'tengda-v32-test',
  TD_ALLOWED_ORIGINS: 'https://station.test',
};

test('public staff-auth endpoint never exposes single or bulk account deletion', async () => {
  const calls = [];
  const handler = createHandler({
    env: name => settings[name],
    createClient: () => ({
      auth: {
        admin: {
          async deleteUser(id) {
            calls.push({ action: 'deleteUser', id });
            return { error: null };
          },
        },
      },
    }),
  });

  for (const action of ['delete', 'delete-user', 'bulk-delete', 'delete-all']) {
    const response = await handler(new Request('https://testref.supabase.co/functions/v1/staff-auth', {
      method: 'POST',
      headers: {
        origin: 'https://station.test',
        authorization: 'Bearer owner-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action, user_ids: ['11111111-1111-4111-8111-111111111111'] }),
    }));

    assert.equal(response.status, 400, action);
    assert.deepEqual(await response.json(), { ok: false, message: '未知操作' });
  }

  assert.deepEqual(calls, [], 'no Auth delete operation may be reached from the public endpoint');
});
