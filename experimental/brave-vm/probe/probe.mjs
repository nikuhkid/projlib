const status = document.querySelector('#status');
const button = document.querySelector('#start');
const log = window.projlibProbe = { started: false, completed: false, serial: '', errors: [] };
button.onclick = async () => {
  button.disabled = true;
  try {
    if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') throw new Error('The guest requires cross-origin isolation and SharedArrayBuffer.');
    log.started = true;
    status.textContent = 'Loading the 64-bit guest and official Brave binary…';
    const terminal = new Terminal({ cols: 120, rows: 40, scrollback: 5000 });
    terminal.open(document.querySelector('#terminal'));
    const write = terminal.write.bind(terminal);
    terminal.write = (data, callback) => {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
      log.serial = (log.serial + text).slice(-200000);
      if (log.serial.includes('PROJLIB_BRAVE_PROBE_COMPLETE') && log.serial.includes('id="proof"')
          && log.serial.includes('Actual Brave executed inside the guest')) {
        log.completed = true;
        status.textContent = 'Brave executed and rendered the controlled HTML probe.';
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
    const { default: createRuntime } = await import('/engine/out.js');
    settings.pty = slave;
    settings.mainScriptUrlOrBlob = new URL('/engine/out.js', location.href).href;
    settings.locateFile = name => new URL('/engine/' + name, location.href).href;
    settings.printErr = text => { log.errors.push(String(text)); terminal.writeln(String(text)); };
    settings.onAbort = reason => { log.errors.push(String(reason)); status.textContent = 'Guest aborted: ' + reason; };
    const readable = new Set();
    slave.onReadable(() => { for (const callback of readable) callback(); readable.clear(); });
    settings.preRun.push(runtime => {
      runtime.FS.writeFile('/pack/info', `t:${Math.round(Date.now() / 1000)}\n`);
      runtime.TTY.stream_ops.poll = (_stream, _timeout, callback) => {
        if (slave.readable) return 1;
        if (callback) { callback.registerCleanupFunc(() => readable.delete(callback)); readable.add(callback); }
        return 0;
      };
    });
    window.projlibRuntime = await createRuntime(settings);
    status.textContent = log.completed ? 'Brave probe completed.' : 'Guest running; waiting for Brave’s execution marker…';
  } catch (error) {
    log.errors.push(error.message);
    status.textContent = error.message;
  }
};
