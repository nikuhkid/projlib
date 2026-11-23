import test from 'node:test';
import assert from 'node:assert/strict';
import { homeControl } from '../worker/home-proxy.js';
import { HOME_SESSION_MS, issueSession, verifySession } from '../server/home-auth.mjs';

const workerNow = Date.UTC(2026, 10, 23, 23);
const origin = 'https://gateway.test';
const record = { key: 'diagnostic-test-signing-key' };
const env = { HOME_PROXY_ORIGIN: 'https://home.test', HOME_GATEWAY_KEY: 'fixture-bridge' };
const login = () => homeControl(new Request(origin + '/rewrite/home/login', {
  method: 'POST', headers: { origin }, body: JSON.stringify({ password: 'fixture-password' })
}), env);

test('a slightly fast host can verify without extending its signed twelve-hour grant or browser cookie', async t => {
  t.mock.method(Date, 'now', () => workerNow);
  const hostNow = workerNow + 2500;
  const grant = issueSession(record, hostNow);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.href, 'https://home.test/auth/login');
    assert.equal(options.headers.get('x-projlib-bridge'), 'fixture-bridge');
    return Response.json(grant);
  });
  const response = await login();
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.equal(state.authorized, true);
  assert.equal(state.route, 'home');
  assert.equal(state.expiresAt, grant.expiresAt);
  const cookies = response.headers.get('set-cookie');
  const token = /projlib_home_grant=([^; ,]+)/.exec(cookies)?.[1];
  assert.equal(token, grant.token);
  assert.match(cookies, /Max-Age=43200(?:;|,)/);
  assert(verifySession(token, record, hostNow + HOME_SESSION_MS - 1));
  assert.equal(verifySession(token, record, hostNow + HOME_SESSION_MS), null);
});

test('expired, malformed and excessively future host grants remain rejected', async t => {
  t.mock.method(Date, 'now', () => workerNow);
  let grant;
  t.mock.method(globalThis, 'fetch', async () => Response.json(grant));
  for (const invalid of [
    { token: 'fixture.token', expiresAt: workerNow },
    { token: 'invalid', expiresAt: workerNow + HOME_SESSION_MS },
    { token: 'fixture.token', expiresAt: workerNow + HOME_SESSION_MS + 61000 }
  ]) {
    grant = invalid;
    const response = await login();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});
