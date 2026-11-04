import test from 'node:test';
import assert from 'node:assert/strict';
import { CookieStore } from '../rewrite/cookie-store.js';

test('rewriter cookies survive restoration and respect domains, paths, HttpOnly, and deletion', () => {
  const store = new CookieStore();
  const site = new URL('https://accounts.example.com/login');
  store.setCookies(['session=secret; HttpOnly; Secure; Path=/', 'scoped=value; Domain=example.com; Path=/account'], site);
  assert.equal(store.getCookies(site, true), '');
  assert.equal(store.getCookies(new URL('https://other.example.com/'), false), '');
  assert.equal(store.getCookies(new URL('https://notexample.com/account'), false), '');
  assert.equal(store.getCookies(new URL('https://accounts.example.com/accounting'), false), 'session=secret');
  const restored = new CookieStore();
  restored.load(JSON.parse(store.dump()));
  assert.equal(restored.getCookies(site, false), 'session=secret');
  assert.equal(restored.getCookies(new URL('https://other.example.com/account/'), false), 'scoped=value');
  restored.setCookies(['session=gone; Max-Age=0; Path=/; Secure'], site);
  assert.equal(restored.getCookies(site, false), '');
  restored.setCookies(['bad=value; Domain=com', 'other=value; Domain=elsewhere.com'], site);
  assert.equal(restored.getCookies(site, false), '');
});
