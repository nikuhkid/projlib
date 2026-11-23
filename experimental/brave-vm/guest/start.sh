#!/bin/sh
set -eu

printf '\nPROJLIB_GUEST_ARCH='
uname -m
printf 'PROJLIB_BRAVE_VERSION='
brave-browser --version

if [ "${PROJLIB_PROBE_ONLY:-1}" = "1" ]; then
    printf 'PROJLIB_BRAVE_PROBE_BEGIN\n'
    # Keep Chromium's own sandbox enabled, even inside the Wasm guest.
    dbus-run-session -- brave-browser --headless --disable-gpu --disable-dev-shm-usage \
        --no-first-run --no-default-browser-check --user-data-dir="$HOME/profile" \
        --dump-dom 'data:text/html,<title>ProjLib Brave engine probe</title><p id="proof">Actual Brave executed inside the guest</p>'
    printf '\nPROJLIB_BRAVE_PROBE_COMPLETE\n'
    exec sleep infinity
fi

Xvfb :1 -screen 0 1280x800x24 -nolisten tcp &
display_pid=$!
trap 'kill "$display_pid" 2>/dev/null || true' EXIT INT TERM
sleep 1
openbox >/tmp/openbox.log 2>&1 &
# This display endpoint is inside the local Wasm guest, never on Wolfie's LAN.
x11vnc -display :1 -localhost -forever -shared -nopw -rfbport 5900 >/tmp/vnc.log 2>&1 &
exec dbus-run-session -- brave-browser --disable-gpu --disable-dev-shm-usage \
    --no-first-run --no-default-browser-check --user-data-dir="$HOME/profile" \
    brave://settings/braveSync/setup
