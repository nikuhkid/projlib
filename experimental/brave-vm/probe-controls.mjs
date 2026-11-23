import { resolve } from 'node:path';

// Reloadable controls for long-running blank-profile tests. This deliberately
// accepts fixed fixture actions rather than arbitrary code or account material.
export async function probeControl(page, directory, input) {
  const command = input.trim();
  if (command === 'screenshot') {
    await page.screenshot({ path: resolve(directory, 'brave-desktop.png'), fullPage: true });
    return 'Saved the local guest display screenshot.';
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
