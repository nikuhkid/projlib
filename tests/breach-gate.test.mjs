import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { BREACH_BOARDS, BREACH_PASSWORD, BREACH_RESULT_MS, BreachPuzzle, BreachResultPresenter, BreachAccessFlow, breachVerifyPassword } from '../js/breach-gate.js';
import { solveBreach } from './support/breach-solver.mjs';

function harness() {
  let time = 0, serial = 0;
  const timers = new Map(), events = [];
  const parts = { screen: { dataset: {}, hidden: true, style: { setProperty() {} }, focus() {} }, shell: {}, title: {}, protocol: {} };
  const presenter = new BreachResultPresenter(parts, (callback, delay) => { const id = ++serial; timers.set(id, { at: time + delay, callback }); return id; }, id => timers.delete(id));
  const flow = new BreachAccessFlow({ present: (...args) => presenter.present(...args), grant: () => events.push('grant'), redirect: url => events.push(url) });
  return { flow, parts, events, async advance(ms) { time += ms; for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.callback(); } await Promise.resolve(); } };
}

test('all twenty distinct puzzles are solvable through five targets within fourteen legal picks', () => {
  assert.equal(BREACH_BOARDS.length, 20);
  assert.equal(new Set(BREACH_BOARDS.map(board => board.cells.join(','))).size, 20);
  for (const board of BREACH_BOARDS) {
    assert.equal(board.size, 6); assert.equal(board.cells.length, 36); assert.equal(board.targets.length, 5);
    assert.equal(board.capacity, 14); assert.equal(board.seconds, 60);
    const puzzle = new BreachPuzzle(board, () => 0), path = solveBreach(board);
    for (const index of path) { assert(puzzle.allowed(index)); assert(puzzle.select(index)); }
    assert.equal(puzzle.result, 'won'); assert.equal(puzzle.completed(), 5); assert(path.length <= 14);
  }
});

test('invalid picks and timeout cannot advance or complete a puzzle', () => {
  let time = 0;
  const game = new BreachPuzzle(BREACH_BOARDS[0], () => time);
  for (const index of [-1, 36, 6, 0.5, '0']) assert.equal(game.select(index), false);
  assert.equal(game.started, null); assert(game.select(0));
  assert.equal(game.select(0), false); assert.equal(game.select(1), false);
  time = 60000; assert.equal(game.select(6), false); assert.equal(game.result, 'failed'); assert.equal(game.reason, 'TIME EXPIRED');
});

test('any denied result is terminal and redirects once, after the full 1500ms screen', async () => {
  assert.equal(BREACH_RESULT_MS, 1500);
  const h = harness(), result = h.flow.deny();
  assert.equal(h.parts.title.textContent, 'ACCESS DENIED'); assert(h.parts.shell.inert);
  assert.equal(await h.flow.unlock(), false); assert.equal(await h.flow.deny(), false);
  await h.advance(1499); assert.deepEqual(h.events, []); assert.equal(h.flow.stage, 'denying');
  await h.advance(1); assert(await result); assert.deepEqual(h.events, ['https://www.google.com/']); assert.equal(h.flow.stage, 'redirected');
  assert.equal(await h.flow.unlock(), false); assert.equal(await h.flow.deny(), false);
});

test('grant resolves once after 1500ms and a late failure cannot replace it', async () => {
  const h = harness(), result = h.flow.unlock();
  assert.equal(h.parts.title.textContent, 'ACCESS GRANTED'); assert.equal(await h.flow.deny(), false);
  await h.advance(1499); assert.deepEqual(h.events, []);
  await h.advance(1); assert(await result); assert.deepEqual(h.events, ['grant']); assert.equal(h.flow.stage, 'unlocked');
  assert.equal(await h.flow.unlock(), false);
});

test('password verifier retains PBKDF2 parameters and rejects an incorrect access key', async () => {
  assert.equal(BREACH_PASSWORD.iterations, 600000);
  assert.match(BREACH_PASSWORD.salt, /^[a-f0-9]{32}$/); assert.match(BREACH_PASSWORD.verifier, /^[a-f0-9]{64}$/);
  assert.equal(await breachVerifyPassword('incorrect-test-key', webcrypto), false);
  await assert.rejects(breachVerifyPassword('fixture', {}), /HTTPS or localhost/);
});

test('initial console is hidden and inert; no circuit, hints, reset or new-matrix controls are shipped', async () => {
  const html = await readFile('index.html', 'utf8'), source = await readFile('js/breach-gate.js', 'utf8');
  assert.match(html, /<div class="console-container" data-breach-protected hidden inert>/);
  assert(html.includes('<title>ProjLib Control Node [BETA]</title>'));
  for (const name of ['breach-circuit', 'breach-retry', 'breach-new', 'breach-help', 'strategy']) assert(!html.includes(`id="${name}"`));
  assert(!source.toLowerCase().includes('circuit')); assert(!source.includes('nextBoard'));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]); assert.equal(new Set(ids).size, ids.length);
});
