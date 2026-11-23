#!/bin/sh
set -eu
export HOME=/home/browser DISPLAY=:1
printf '\nPROJLIB_GUEST_ARCH='
uname -m
printf 'PROJLIB_BRAVE_VERSION='
brave-browser --version

Xvfb :1 -screen 0 1280x800x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
count=0
until [ -S /tmp/.X11-unix/X1 ]; do
    count=$((count + 1))
    [ "$count" -lt 120 ] || exit 1
    sleep 1
done
openbox >/tmp/openbox.log 2>&1 &
x11vnc -display :1 -localhost -forever -shared -nopw -rfbport 5900 >/tmp/vnc.log 2>&1 &
dbus-run-session -- brave-browser --disable-gpu --disable-dev-shm-usage \
    --no-first-run --no-default-browser-check --user-data-dir="$HOME/profile" \
    brave://settings/braveSync/setup >/tmp/brave.log 2>&1 &
exec /.vm/guest-helper --rfb-stdio
