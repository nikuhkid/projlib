import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { patchGoogleIndirectEval } from '../rewrite/scramjet-compat.js';

test('the Google eval adaptation rejects an absent, changed or ambiguous upstream module', async () => {
  const upstream = await readFile('node_modules/@mercuryworkshop/scramjet/dist/scramjet.all.js', 'utf8');
  assert.throws(() => patchGoogleIndirectEval('unrecognized vendor build'), /indirect-eval module changed/);
  assert.throws(() => patchGoogleIndirectEval(upstream.replace('USING STRICT EVAL - BOTGUARD', 'changed upstream hook')), /indirect-eval module changed/);
  assert.throws(() => patchGoogleIndirectEval(upstream + upstream), /indirect-eval module changed/);
});
