import { runtimeArguments } from './runtime-arguments.mjs';
import { loadProfile, saveProfile, MAX_PROFILE_BYTES } from './profile-store.mjs';
import { installHostVerification } from './auth-controls.mjs';

const status = document.querySelector('#status');
const button = document.querySelector('#start');
const log = window.projlibProbe = { started: false, completed: false, serial: '', errors: [] };
const desktopMode = new URLSearchParams(location.search).get('desktop') === '1';
const diagnosticMode = new URLSearchParams(location.search).get('diagnose') === '1';
const networkProbe = new URLSearchParams(location.search).get('networkProbe') === '1';
const storageProbe = new URLSearchParams(location.search).get('storageProbe') === '1';
const inputProbe = new URLSearchParams(location.search).get('inputProbe') === '1';
const relayMode = new URLSearchParams(location.search).get('relay') === '1';
const persistentProfile = storageProbe || new URLSearchParams(location.search).get('profile') === '1';
const scriptedBoot = desktopMode || diagnosticMode || networkProbe || storageProbe || inputProbe;
let hostAuthorized = !relayMode;
if (relayMode) {
  button.disabled = true;
  void installHostVerification({
    isRunning: () => log.started,
    onStatus: result => { hostAuthorized = result.authorized; if (!log.started) button.disabled = !hostAuthorized; },
    reconnect: async () => { if (window.projlibRelayTransport) await window.projlibRelayTransport.reconnect(); }
  });
}
button.onclick = async () => {
  button.disabled = true;
  try {
    if (!hostAuthorized) throw new Error('Verify Wolfie before starting Brave.');
    if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') throw new Error('The guest requires cross-origin isolation and SharedArrayBuffer.');
    log.started = true;
    let savingStorageFixture = false;
    let savingDesktopProfile = false;
    let autoSaveTimer;
    window.addEventListener('pagehide', () => clearInterval(autoSaveTimer), { once: true });
    const restoredProfile = persistentProfile ? await loadProfile({ fixture: storageProbe }) : null;
    log.profileLoaded = Boolean(restoredProfile);
    status.textContent = 'Loading the 64-bit guest and official Brave binary…';
    const terminal = new Terminal({ cols: 120, rows: 40, scrollback: 5000 });
    terminal.open(document.querySelector('#terminal'));
    if (networkProbe && new URLSearchParams(location.search).get('reconnectProbe') === '1') {
      window.projlibContinueNetworkProbe = () => terminal.input('PROJLIB_NETWORK_CONTINUE\n', true);
    }
    document.querySelector('#terminal').hidden = desktopMode;
    let display;
    if (inputProbe) {
      const { GuestDisplayChannel } = await import('./display.mjs');
      display = new GuestDisplayChannel(value => terminal.input(value, true));
      window.projlibChannel = display;
      display.oninputverified = () => {
        log.inputVerified = true; log.completed = true;
        status.textContent = 'The full disposable input fixture reached the guest intact.';
      };
      display.onopen = () => {
        const ready = setInterval(() => {
          if (!display.inputAckCapable) return;
          clearInterval(ready);
          display.send(new TextEncoder().encode('projlib-disposable-input-fixture:'.repeat(400)));
        }, 10);
      };
    }
    if (desktopMode) {
      const { GuestDisplayChannel } = await import('./display.mjs');
      const { default: RFB } = await import('/vendor/novnc/novnc.mjs');
      const target = document.querySelector('#desktop'); target.hidden = false;
      display = new GuestDisplayChannel(value => terminal.input(value, true));
      const saveButton = document.querySelector('#save-profile');
      const closeButton = document.querySelector('#close-profile');
      saveButton.hidden = !persistentProfile;
      closeButton.hidden = !persistentProfile;
      display.onprofilecapability = () => {
        saveButton.disabled = !persistentProfile;
        closeButton.disabled = !persistentProfile || !display.closeCapable;
        if (persistentProfile && !autoSaveTimer) autoSaveTimer = setInterval(() => {
          if (!savingDesktopProfile) window.saveProjlibProfile().catch(error => { log.profileSaveError = error.message; status.textContent = error.message; });
        }, 120000);
      };
      display.onclosecapability = () => { closeButton.disabled = !persistentProfile; };
      window.saveProjlibProfile = async ({ close = false } = {}) => {
        if (!persistentProfile || savingDesktopProfile) throw new Error('A local profile save is unavailable or already running.');
        savingDesktopProfile = true; saveButton.disabled = true; closeButton.disabled = true;
        try {
          status.textContent = close ? 'Closing Brave and saving its profile on this device…' : 'Saving the profile on this device…';
          const size = await display.snapshotProfile({ close });
          const bytes = window.projlibRuntime.FS.readFile('/.vm/profile-export.tar');
          if (bytes.length !== size || size > MAX_PROFILE_BYTES) throw new Error('The profile snapshot is incomplete.');
          log.profileSave = await saveProfile(bytes);
          if (close) {
            if (!display.browserStopped) throw new Error('Brave did not confirm that it closed.');
            clearInterval(autoSaveTimer); log.profileClosed = true;
            window.projlibDisplay.viewOnly = true;
            window.projlibRelayTransport?.close();
          }
          status.textContent = close ? 'Brave is closed and its profile is saved. You can close this tab.' : 'Profile saved on this device.';
        } finally { savingDesktopProfile = false; saveButton.disabled = Boolean(log.profileClosed); closeButton.disabled = Boolean(log.profileClosed); }
      };
      saveButton.onclick = () => window.saveProjlibProfile().catch(error => { status.textContent = error.message; });
      closeButton.onclick = () => window.saveProjlibProfile({ close: true }).catch(error => { status.textContent = error.message; });
      window.projlibChannel = display;
      window.projlibDisplay = new RFB(target, display);
      window.projlibDisplay.scaleViewport = true;
      window.projlibDisplay.addEventListener('connect', () => {
        status.textContent = persistentProfile ? 'Guest display connected. Local profile controls are enabled.' : 'Local guest display connected. This prototype profile is temporary.';
        log.displayConnected = true;
      });
      window.projlibDisplay.addEventListener('disconnect', event => { log.displayDisconnect = event.detail; clearInterval(autoSaveTimer); });
      window.projlibDisplay.addEventListener('securityfailure', event => { log.displayFailure = event.detail; });
      queueMicrotask(() => display.flush());
    }
    const write = terminal.write.bind(terminal);
    terminal.write = (data, callback) => {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
      if (display) {
        // Do not retain or print RFB screen contents, including eventual account/Sync data.
        display.consume(text);
        if (display.readyState !== 1) log.serial = display.bootText;
        callback?.(); return;
      }
      log.serial = (log.serial + text).slice(-200000);
      if (log.serial.includes('PROJLIB_BRAVE_PROBE_COMPLETE') && log.serial.includes('id="proof"')
          && log.serial.includes('Actual Brave executed inside the guest')) {
        log.completed = true;
        log.domRendered = true;
        status.textContent = 'Brave executed and rendered the controlled HTML probe.';
      }
      if (networkProbe && log.serial.includes('PROJLIB_TLS_PUBLIC_EGRESS_PASS')) {
        log.completed = true; log.networkVerified = true;
        status.textContent = 'Guest TLS and public egress through the native Wolfie relay passed.';
      }
      if (storageProbe && log.serial.includes('PROJLIB_STORAGE_EXPORT_READY') && !savingStorageFixture) {
        savingStorageFixture = true;
        const bytes = window.projlibRuntime.FS.readFile('/.vm/profile-export.tar');
        if (!new TextDecoder().decode(bytes).includes('projlib-local-profile-round-trip-fixture')) throw new Error('The profile fixture did not reach the browser filesystem.');
        saveProfile(bytes, { fixture: true }).then(saved => {
          log.profileSave = saved; log.completed = true; log.storageExportVerified = true;
          status.textContent = 'The guest profile fixture was saved in local browser storage.';
        }).catch(error => { log.errors.push(error.message); status.textContent = error.message; });
      }
      if (storageProbe && log.serial.includes('PROJLIB_STORAGE_IMPORT_VERIFIED')) {
        log.completed = true; log.storageImportVerified = true;
        status.textContent = 'The guest restored its profile fixture after restarting the browser.';
      }
      write(data, callback);
    };
    const { master, slave } = openpty();
    terminal.loadAddon(master);
    const settings = window.Module = { preRun: [], locateFile: name => new URL('/engine/' + name, location.href).href };
    // Set the asset base before the packager starts fetching the large guest image.
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = '/engine/load.js';
      script.onload = resolve; script.onerror = () => reject(new Error('The candidate image loader is unavailable.'));
      document.head.append(script);
    });
    await import('/engine/arg-module.js');
    settings.arguments = runtimeArguments(settings.arguments, new URLSearchParams(location.search));
    if (relayMode) {
      const { RelaySocket } = await import('./relay-socket.mjs');
      const device = settings.arguments.findIndex(value => value.startsWith('virtio-net-pci,'));
      if (device < 0) throw new Error('The guest network device is missing.');
      settings.arguments[device] += ',mac=02:00:00:00:00:01';
      settings.websocket = { url: new URL('/browser-vm/network', location.href).href.replace(/^http/, 'ws'), subprotocol: 'binary' };
      settings.projlibRelaySocket = class extends RelaySocket {
        constructor(url, protocols) {
          super(url, protocols, { onState: state => { log.relayTransport = state; } });
          window.projlibRelayTransport = this;
        }
      };
    }
    const { default: createRuntime } = await import('/engine/out.js');
    settings.pty = slave;
    settings.mainScriptUrlOrBlob = new URL('/engine/out.js', location.href).href;
    settings.locateFile = name => new URL('/engine/' + name, location.href).href;
    settings.printErr = text => { log.errors.push(String(text)); terminal.writeln(String(text)); };
    settings.onAbort = reason => { log.errors.push(String(reason)); status.textContent = 'Guest aborted: ' + reason; };
    const readable = new Set();
    slave.onReadable(() => { for (const callback of readable) callback(); readable.clear(); });
    settings.preRun.push(runtime => {
      let info = `t:${Math.round(Date.now() / 1000)}\n`;
      if (networkProbe && new URLSearchParams(location.search).get('reconnectProbe') === '1') info += 'env:PROJLIB_RECONNECT_PROBE=1\n';
      if (new URLSearchParams(location.search).get('jitless') === '1') info += 'env:PROJLIB_JITLESS=1\n';
      if (relayMode) info += 'n:02:00:00:00:00:01\n';
      if (scriptedBoot) {
        runtime.FS.mkdir('/.vm');
        runtime.FS.mkdir('/.vm/diagnostics', 0o777);
        runtime.FS.chmod('/.vm/diagnostics', 0o777);
        runtime.FS.writeFile('/.vm/diagnostics/write-test.txt', '');
        runtime.FS.chmod('/.vm/diagnostics/write-test.txt', 0o666);
        runtime.FS.writeFile('/.vm/profile-export.tar', '');
        runtime.FS.chmod('/.vm/profile-export.tar', 0o666);
        runtime.FS.writeFile('/.vm/profile-import.tar', restoredProfile?.bytes || new Uint8Array());
        if (new URLSearchParams(location.search).get('debug') === '1') runtime.FS.writeFile('/.vm/diagnostics/enabled', '');
        runtime.FS.writeFile('/.vm/start.sh', window.projlibDesktopAssets.script);
        runtime.FS.writeFile('/.vm/fonts.sh', window.projlibDesktopAssets.fontScript);
        if (window.projlibDesktopAssets.helper) {
          runtime.FS.writeFile('/.vm/guest-helper', window.projlibDesktopAssets.helper);
          runtime.FS.chmod('/.vm/guest-helper', 0o755);
        }
        if (window.projlibDesktopAssets.strace) {
          runtime.FS.writeFile('/.vm/guest-strace', window.projlibDesktopAssets.strace);
          runtime.FS.chmod('/.vm/guest-strace', 0o755);
          runtime.FS.writeFile('/.vm/trace.sh', window.projlibDesktopAssets.traceScript);
        }
        info += 'm:.vm\ne:/bin/sh\nc:/.vm/start.sh\n';
      }
      runtime.FS.writeFile('/pack/info', info);
      if (new URLSearchParams(location.search).get('io') !== 'bounded') runtime.TTY.stream_ops.poll = (_stream, _timeout, callback) => {
        if (slave.readable) return 1;
        if (callback) { callback.registerCleanupFunc(() => readable.delete(callback)); readable.add(callback); }
        return 0;
      };
    });
    if (scriptedBoot) {
      const [script, helper] = await Promise.all([fetch(inputProbe ? '/guest/input.sh' : storageProbe ? '/guest/storage.sh' : networkProbe ? '/guest/network.sh' : desktopMode ? '/guest/start.sh' : '/guest/diagnose.sh'), desktopMode || storageProbe || inputProbe ? fetch('/engine/guest-helper') : null]);
      if (!script.ok || (helper && !helper.ok)) throw new Error('The guest startup assets are not present in the candidate.');
      window.projlibDesktopAssets = { script: await script.text(), helper: helper ? new Uint8Array(await helper.arrayBuffer()) : null };
      const fonts = await fetch('/guest/fonts.sh');
      if (!fonts.ok) throw new Error('The guest font setup is missing.');
      window.projlibDesktopAssets.fontScript = await fonts.text();
      if (desktopMode && new URLSearchParams(location.search).get('trace') === '1') {
        const trace = await fetch('/engine/guest-strace');
        if (!trace.ok) throw new Error('The optional guest diagnostic tool is missing.');
        window.projlibDesktopAssets.strace = new Uint8Array(await trace.arrayBuffer());
        const traceScript = await fetch('/guest/trace.sh');
        if (!traceScript.ok) throw new Error('The optional guest diagnostic script is missing.');
        window.projlibDesktopAssets.traceScript = await traceScript.text();
      }
    }
    window.projlibRuntime = await createRuntime(settings);
    status.textContent = log.completed ? 'Brave probe completed.' : 'Guest running; waiting for Brave’s execution marker…';
  } catch (error) {
    log.errors.push(error.message);
    status.textContent = error.message;
  }
};
