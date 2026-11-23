// SPDX-License-Identifier: AGPL-3.0-only
import { getDomain } from 'tldts';

// This bootstrap runs before the rewritten site's scripts. Brave's original cosmetic
// executor runs unchanged, with its renderer IPC calls connected to our service worker.
export function start(config, runtime) {
  const controller = navigator.serviceWorker.controller;
  const send = controller?.postMessage.bind(controller);
  const makeFunction = Function;
  const channelClass = MessageChannel;
  const cc = window.content_cosmetic = {
    cosmeticStyleSheet: new CSSStyleSheet(), allSelectorsToRules: new Map(),
    firstRunQueue: new Set(), hide1pContent: config.mode === 'aggressive',
    generichide: Boolean(config.resources.generichide),
    proceduralActionFilters: config.resources.procedural_actions.map(value => JSON.parse(value)),
    hasProceduralActions: config.resources.procedural_actions.length > 0,
    fetchNewClassIdRulesThrottlingMs: 100
  };
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, cc.cosmeticStyleSheet];
  const actionStyles = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, actionStyles];
  function addSelectors(selectors) {
    for (const selector of selectors) {
      if (typeof selector !== 'string' || cc.allSelectorsToRules.has(selector)) continue;
      try {
        const index = cc.cosmeticStyleSheet.cssRules.length;
        cc.cosmeticStyleSheet.insertRule(selector + '{display:none!important}', index);
        cc.allSelectorsToRules.set(selector, index);
        cc.firstRunQueue.add(selector);
      } catch { /* An invalid CSS selector must not interrupt the website. */ }
    }
    cc.tryScheduleQueuePump?.();
  }
  addSelectors(config.resources.hide_selectors);
  const domain = getDomain(new URL(config.url).hostname) || new URL(config.url).hostname;
  const cf_worker = {
    hiddenClassIdSelectors(value) {
      if (!send) return;
      const data = JSON.parse(value);
      const total = Math.max(data.classes.length, data.ids.length);
      for (let offset = 0; offset < Math.min(total, 10000); offset += 250) {
        const channel = new channelClass();
        const timer = setTimeout(() => channel.port1.close(), 10000);
        channel.port1.onmessage = event => {
          clearTimeout(timer); channel.port1.close();
          if (Array.isArray(event.data.selectors)) addSelectors(event.data.selectors);
        };
        send({ type: 'projlib:blocker-selectors', classes: data.classes.slice(offset, offset + 250), ids: data.ids.slice(offset, offset + 250) }, [channel.port2]);
      }
    },
    injectStylesheet(css) {
      try { actionStyles.insertRule(css, actionStyles.cssRules.length); } catch { /* Invalid procedural CSS. */ }
    },
    isFirstPartyUrl(value) {
      try {
        let url = new URL(value, config.url);
        if (url.origin === location.origin && url.pathname.startsWith('/rewrite/site/')) url = new URL(decodeURIComponent(url.pathname.slice('/rewrite/site/'.length)));
        return (getDomain(url.hostname) || url.hostname) === domain;
      } catch { return false; }
    }
  };
  makeFunction('cf_worker', runtime)(cf_worker);
}
