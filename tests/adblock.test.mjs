import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BraveEngine } from '../rewrite/adblock/brave-engine.js';

const wasm = await readFile('rewrite/adblock/vendor/brave-adblock.wasm');
const resources = JSON.parse(await readFile('rewrite/adblock/vendor/resources.json', 'utf8'));

test('Brave engine preserves network exceptions, first-party modes, cosmetic exceptions and scriptlet resources', async () => {
  const engine = await BraveEngine.create(wasm);
  engine.initialize([{ firstParty: false, permissions: 0, text: [
    '||ads.example^', '@@||ads.example/allowed^', '||fixture.test/own-ad.js$script',
    '@@||excepted.test^$generichide', '##.generic-ad', 'fixture.test##.site-ad',
    'fixture.test##+js(set-constant, projlibAdFixture, true)',
    'fixture.test##.sponsored:has-text(SPONSORED TEST):remove()'
  ].join('\n') }], resources);
  assert.equal(engine.check('https://ads.example/ad.js', 'https://fixture.test/', 'script').blocked, true);
  assert.equal(engine.check('https://ads.example/allowed/file.js', 'https://fixture.test/', 'script').blocked, false);
  assert.equal(engine.check('https://fixture.test/own-ad.js', 'https://fixture.test/', 'script').blocked, false);
  assert.equal(engine.check('https://fixture.test/own-ad.js', 'https://fixture.test/', 'script', 'GET', 'aggressive').blocked, true);
  assert.equal(engine.cosmetics('https://excepted.test/').generichide, true);
  assert.deepEqual(engine.selectors('https://excepted.test/', ['generic-ad'], []), []);
  assert(engine.cosmetics('https://fixture.test/').hide_selectors.includes('.site-ad'));
  assert(engine.selectors('https://fixture.test/', ['generic-ad'], []).includes('.generic-ad'));
  assert.match(engine.cosmetics('https://fixture.test/').injected_script, /setConstant\("projlibAdFixture", "true"\)/);
  const procedural = engine.cosmetics('https://fixture.test/').procedural_actions;
  assert.equal(procedural.length, 1);
  assert.deepEqual(JSON.parse(procedural[0]).selector, [
    { type: 'css-selector', arg: '.sponsored' },
    { type: 'has-text', arg: 'SPONSORED TEST' }
  ]);
  for (let index = 0; index < 1000; index++) {
    assert.equal(engine.check('https://fixture.test/ordinary.js?unicode=á日本語', 'https://fixture.test/', 'script').blocked, false);
  }
  assert.throws(() => engine.call({ operation: 'invalid' }), /Unknown blocking operation/);
});

test('the pinned Brave default lists block a real ad endpoint and keep ordinary pages available', async () => {
  const engine = await BraveEngine.create(wasm);
  const { lists } = JSON.parse(await readFile('rewrite/adblock/vendor/filters.json', 'utf8'));
  engine.initialize(lists, resources);
  const ad = engine.check('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', 'https://example.com/', 'script');
  assert.equal(ad.blocked, true);
  assert.match(ad.redirect, /^data:application\/javascript;base64,/);
  assert.equal(engine.check('https://example.com/style.css', 'https://example.com/', 'stylesheet').blocked, false);
  assert.equal(engine.check('https://www.youtube.com/', 'https://www.youtube.com/', 'document').blocked, false);
  assert(engine.cosmetics('https://www.youtube.com/').injected_script.length > 0);
});
