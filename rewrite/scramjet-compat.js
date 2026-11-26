// SPDX-License-Identifier: AGPL-3.0-only
// Scramjet 1.1.0's Google-specific factory returns eval without executing its
// argument. Use the ordinary indirect-eval path already used on other domains.
// Direct eval, argument handling and the JavaScript rewriter stay unchanged.
// The replacement is pinned to the distributed bundle, not a fuzzy match.
const googleFactory = [
  '"accounts.google.com"===this.url.hostname?(console.log("USING STRICT EVAL - BOTGUARD"),r=Function(`',
  '\t\t\t"use strict";',
  '\t\t\treturn eval;',
  '\t\t`)):r=this.global.eval'
].join('\n');

export function patchGoogleIndirectEval(bundle) {
  if (bundle.split(googleFactory).length !== 2) {
    throw new Error('Scramjet indirect-eval module changed. Review the Google compatibility adaptation before building.');
  }
  return bundle.replace(googleFactory, 'r=this.global.eval');
}
