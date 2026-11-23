#!/bin/sh
set -eu
export HOME=/home/browser
/.vm/guest-helper --profile-import
. /.vm/fonts.sh
printf 'PROJLIB_BRAVE_VERSION='
brave-browser --version
env -u DISPLAY dbus-run-session -- brave-browser --headless=new --disable-gpu \
    --disable-dev-shm-usage --no-first-run --no-default-browser-check \
    --user-data-dir="$HOME/profile" --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port=9222 --remote-allow-origins=http://localhost \
    about:blank >/tmp/brave-canvas.log 2>&1 &
exec /.vm/guest-helper --cdp-stdio
