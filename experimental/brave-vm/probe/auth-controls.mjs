// The host password is sent only to this page's same-origin endpoint (HTTPS on
// a public host; loopback HTTP in this isolated laboratory). It is
// never retained in browser storage or placed in a URL or diagnostic record.
export async function installHostVerification({ onStatus, reconnect, isRunning }) {
  const panel = document.querySelector('#host-verification'); panel.hidden = false;
  const form = document.querySelector('#host-form');
  const password = document.querySelector('#host-password');
  const verify = document.querySelector('#verify-host');
  const logout = document.querySelector('#disconnect-host');
  const message = document.querySelector('#host-status');
  let busy = false;
  const request = async (action, body) => {
    const response = await fetch('/browser-vm/auth/' + action, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Wolfie could not be verified.');
    return result;
  };
  const apply = result => {
    onStatus(result);
    logout.disabled = !result.authorized;
    message.textContent = result.authorized
      ? 'Wolfie verified until ' + new Date(result.expiresAt).toLocaleTimeString() + '.'
      : isRunning() ? 'Verify Wolfie again to resume this browser’s network connection.' : 'Verify Wolfie to start Brave.';
  };
  const refresh = async () => { if (!busy) { try { apply(await request('status')); } catch { message.textContent = 'Wolfie could not be reached.'; onStatus({ authorized: false, expiresAt: 0 }); } } };
  form.onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    busy = true; verify.disabled = true;
    try {
      const value = password.value; password.value = '';
      const result = await request('login', { password: value });
      apply(result); await reconnect();
    } catch (error) { message.textContent = error.message; }
    finally { password.value = ''; busy = false; verify.disabled = false; }
  };
  logout.onclick = async () => {
    if (busy) return; busy = true; logout.disabled = true;
    try { apply(await request('logout', {})); }
    catch (error) { message.textContent = error.message; }
    finally { busy = false; }
  };
  await refresh();
  const timer = setInterval(refresh, 30000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
}
