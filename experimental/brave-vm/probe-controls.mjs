import { resolve } from 'node:path';

// Reloadable controls for long-running blank-profile tests. This deliberately
// accepts fixed fixture actions rather than arbitrary code or account material.
export async function probeControl(page, directory, input) {
  const command = input.trim();
  if (command === 'screenshot') {
    await page.screenshot({ path: resolve(directory, 'brave-desktop.png'), fullPage: true });
    return 'Saved the local guest display screenshot.';
  }
  const canvasMode = await page.evaluate(() => Boolean(window.projlibBrowserCanvas));
  if (canvasMode) await page.evaluate(() => {
    const browser = window.projlibBrowserCanvas;
    if (browser.braveAliases) return;
    const original = browser.navigate.bind(browser);
    browser.navigate = async url => {
      const result = await original(url.replace(/^brave:\/\//i, 'chrome://'));
      if (result.errorText) throw new Error('Brave could not open that address (' + result.errorText + ').');
      await browser.call('Page.bringToFront'); return result;
    };
    browser.braveAliases = true;
  });
  if (canvasMode && ['navigate-sync','paste-sync','physical-sync','navigate-example','paste-example','physical-example'].includes(command)) {
    if (command.endsWith('sync')) await page.locator('#browser-sync').click();
    else { await page.locator('#browser-address').fill('https://example.com/'); await page.locator('#browser-tools').dispatchEvent('submit'); }
    return 'Opened the selected fixture through the local Brave controls.';
  }
  if (canvasMode && command === 'canvas-fixture') {
    await page.evaluate(() => window.projlibBrowserCanvas.navigate('data:text/html,' + encodeURIComponent('<style>body{font:24px sans-serif;margin:20px}input{font:inherit;width:500px;height:45px}</style><input id="typing" aria-label="Typing fixture"><p id="proof">Actual Brave local canvas</p>')));
    return 'Opened the controlled canvas input fixture.';
  }
  if (canvasMode && command === 'type-fixture') {
    await page.locator('#desktop canvas').click({ position: { x: 100, y: 40 } });
    await page.keyboard.type('verified-local-input', { delay: 100 });
    return 'Typed synthetic input through the local browser canvas.';
  }
  if (canvasMode && command === 'inspect-fixture') {
    const rendered = await page.evaluate(async () => {
      const result = await window.projlibBrowserCanvas.call('Runtime.evaluate', { expression: 'document.getElementById("proof")?.textContent === "Actual Brave local canvas"', returnByValue: true });
      return result.result?.value === true;
    });
    return 'Controlled native page rendered: ' + rendered;
  }
  if (canvasMode && command === 'inspect-sync') {
    const state = await page.evaluate(async () => {
      const result = await window.projlibBrowserCanvas.call('Runtime.evaluate', { expression: `(() => { const roots=[document]; let sync=false; while(roots.length) { const root=roots.pop(); for(const element of root.querySelectorAll('*')) { if(element.tagName.toLowerCase().includes('brave-sync')) sync=true; if(element.shadowRoot) roots.push(element.shadowRoot); } } return {nativeSyncRoute:location.pathname.includes('braveSync'),nativeSyncComponent:sync}; })()`, returnByValue: true });
      const state = result.result?.value || {};
      window.projlibProbe.syncUiVerified = state.nativeSyncRoute === true && state.nativeSyncComponent === true;
      return state;
    });
    return 'Native Sync UI check: ' + JSON.stringify(state);
  }
  if (canvasMode && command === 'latency-fixture') {
    const elapsed = await page.evaluate(async () => {
      const started = performance.now();
      const result = await window.projlibBrowserCanvas.call('Runtime.evaluate', { expression: '1+1', returnByValue: true });
      if (result.result?.value !== 2) throw new Error('The fixed responsiveness fixture failed.');
      const elapsedMs = Math.round(performance.now()-started);
      window.projlibProbe.canvasRoundtripMs = elapsedMs; return elapsedMs;
    });
    return 'Local native browser command round-trip: ' + elapsed + ' ms.';
  }
  if (canvasMode && command === 'check-home-egress') {
    const expected = (await (await fetch('https://api.ipify.org/')).text()).trim();
    const verified = await page.evaluate(async expected => {
      const browser = window.projlibBrowserCanvas;
      await browser.navigate('https://api.ipify.org/');
      const deadline = Date.now()+120000;
      while (Date.now()<deadline) {
        const result = await browser.call('Runtime.evaluate', { expression: 'document.body?.innerText.trim()', returnByValue: true });
        if (result.result?.value === expected) { window.projlibProbe.browserEgressVerified = true; return true; }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return false;
    }, expected);
    return 'Native Brave egress matches Wolfie: ' + verified;
  }
  if (canvasMode && command === 'refresh-canvas') {
    await page.evaluate(async () => {
      const browser = window.projlibBrowserCanvas;
      await browser.call('Page.bringToFront');
      const frame = await browser.call('Page.captureScreenshot', { format: 'jpeg', quality: 55, captureBeyondViewport: false });
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(frame.data), character => character.charCodeAt(0))], { type: 'image/jpeg' }));
      browser.context.drawImage(bitmap, 0, 0, browser.canvas.width, browser.canvas.height); bitmap.close(); browser.frames++;
    });
    return 'Refreshed the native local browser surface.';
  }
  if (canvasMode && command === 'verify-fixture') {
    const verified = await page.evaluate(async () => {
      const result = await window.projlibBrowserCanvas.call('Runtime.evaluate', { expression: 'document.getElementById("proof")?.textContent === "Actual Brave local canvas" && document.getElementById("typing")?.value === "verified-local-input"', returnByValue: true });
      const passed = result.result?.value === true;
      window.projlibProbe.canvasFixtureVerified = passed; window.projlibProbe.domRendered = passed;
      return passed;
    });
    return 'Native rendered DOM and actual canvas keyboard verified: ' + verified;
  }
  if (['navigate-sync', 'navigate-example', 'paste-sync', 'paste-example'].includes(command)) {
    const address = command.endsWith('sync') ? 'brave://settings/braveSync/setup' : 'https://example.com/';
    await page.evaluate(async ({ address, paste }) => {
      const display = window.projlibDisplay;
      if (!display || display._rfbConnectionState !== 'connected') throw new Error('The guest display is not connected.');
      if (paste) { display.clipboardPasteFrom(address); await new Promise(resolve => setTimeout(resolve, 2000)); }
      // Standard X11 keysyms avoid mixing QEMU scan codes and X11 keycodes.
      display.sendKey(0xffe3, undefined, true); display.sendKey(0x6c); display.sendKey(0xffe3, undefined, false);
      if (paste) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        display.sendKey(0xffe3, undefined, true); display.sendKey(0x76); display.sendKey(0xffe3, undefined, false);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else for (const letter of address) { display.sendKey(letter.codePointAt(0)); await new Promise(resolve => setTimeout(resolve, 10)); }
      display.sendKey(0xff0d);
    }, { address, paste: command.startsWith('paste-') });
    return 'Sent the selected fixture address through the guest input channel.';
  }
  if (command === 'save-profile' || command === 'close-profile') {
    if (command === 'close-profile') await page.waitForFunction(() => !document.querySelector('#close-profile').disabled, undefined, { timeout: 120000 });
    await page.evaluate(close => window.saveProjlibProfile({ close }), command === 'close-profile');
    return command === 'close-profile' ? 'Brave exited and its final profile checkpoint is saved on this device.' : 'Saved the actual Brave profile checkpoint on this device.';
  }
  if (command === 'press-escape') {
    await page.evaluate(() => window.projlibDisplay.sendKey(0xff1b)); return 'Sent Escape to the disposable guest.';
  }
  if (command === 'physical-sync' || command === 'physical-example') {
    const address = command === 'physical-sync' ? 'brave://settings/braveSync' : 'https://example.com/';
    await page.locator('#desktop canvas').click({ position: { x: 400, y: 75 } });
    await page.keyboard.press('Control+L');
    await page.keyboard.type(address, { delay: 80 });
    await page.keyboard.press('Enter');
    return 'Typed the selected fixture address through the actual viewer keyboard events.';
  }
  const click = /^click-guest (\d+) (\d+)$/.exec(command);
  if (click) {
    const x = Number(click[1]), y = Number(click[2]);
    if (x >= 1280 || y >= 800) throw new Error('Use coordinates inside the 1280 by 800 guest display.');
    const canvas = page.locator('#desktop canvas'); const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('The guest canvas is unavailable.');
    await page.mouse.click(bounds.x + bounds.width*x/1280, bounds.y + bounds.height*y/800);
    return 'Clicked the specified point in the disposable guest.';
  }
  return null;
}
