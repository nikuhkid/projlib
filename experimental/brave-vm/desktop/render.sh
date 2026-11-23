#!/bin/sh
# Disposable guest only. DevTools listens inside this guest, never on Wolfie.
set -eu
printf 'PROJLIB_GUEST_ARCH='
uname -m
brave-browser --version
. /.vm/fonts.sh
env -u DISPLAY dbus-run-session -- brave-browser --headless=new \
    --disable-gpu --disable-dev-shm-usage --no-first-run --no-default-browser-check \
    --user-data-dir="$HOME/profile" --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port=9222 --remote-allow-origins=http://localhost \
    about:blank >/tmp/brave-render-probe.log 2>&1 &
/.vm/guest-helper --render-probe
exec sleep infinity
