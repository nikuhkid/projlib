#!/bin/sh
set -eu
export HOME=/home/browser DISPLAY=:1
/.vm/guest-helper --profile-import
. /.vm/fonts.sh
set --
if [ "${PROJLIB_JITLESS:-0}" = 1 ]; then set -- --js-flags=--jitless; fi
printf '\nPROJLIB_GUEST_ARCH='
uname -m
printf 'PROJLIB_BRAVE_VERSION='
brave-browser --version
printf 'PROJLIB_CPU_FLAGS='
sed -n '/^flags/{p;q;}' /proc/cpuinfo

Xvfb :1 -screen 0 1280x800x24 -nolisten tcp -extension MIT-SHM >/tmp/xvfb.log 2>&1 &
display_pid=$!
count=0
until [ -S /tmp/.X11-unix/X1 ]; do
    if ! kill -0 "$display_pid" 2>/dev/null; then
        printf 'PROJLIB_DISPLAY_START_FAILED\n'
        cat /tmp/xvfb.log
        exit 1
    fi
    count=$((count + 1))
    [ "$count" -lt 120 ] || exit 1
    sleep 1
done
printf 'PROJLIB_X11_READY\n'
openbox >/tmp/openbox.log 2>&1 &
if command -v xsetroot >/dev/null 2>&1; then xsetroot -solid '#503080'; fi
x11vnc -display :1 -localhost -forever -shared -nopw -noshm -rfbport 5900 >/tmp/vnc.log 2>&1 &
dbus-run-session -- /bin/sh -c '
    export DBUS_SYSTEM_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS"
    exec brave-browser "$@"
' projlib-brave --disable-gpu --disable-dev-shm-usage \
    "$@" \
    --enable-logging=stderr --v=1 \
    --no-first-run --no-default-browser-check --user-data-dir="$HOME/profile" \
    brave://settings/braveSync/setup >/tmp/brave.log 2>&1 &
if [ -x /.vm/guest-strace ]; then
    /bin/sh /.vm/trace.sh &
fi
# Process sampling is expensive in full CPU emulation. Enable it explicitly only
# in a disposable diagnostic guest, never for an eventual personal profile.
if [ -f /.vm/diagnostics/enabled ]; then (
    while :; do
        {
            printf 'PROJLIB_PROCESS_SAMPLE\n'
            cat /proc/uptime
            printf 'PROJLIB_CLOCKSOURCE='
            cat /sys/devices/system/clocksource/clocksource0/current_clocksource 2>/dev/null || true
            printf 'PROJLIB_AVAILABLE_CLOCKS='
            cat /sys/devices/system/clocksource/clocksource0/available_clocksource 2>/dev/null || true
            dmesg 2>/dev/null | grep -E 'clocksource|[Tt][Ss][Cc]|timekeeping' | tail -n 10 || true
            printf 'precreated file is writable\n' >/.vm/diagnostics/write-test.txt 2>/dev/null || true
            for directory in /proc/[0-9]*; do
                name=$(cat "$directory/comm" 2>/dev/null || true)
                case "$name" in
                    brave*|chrome*|crashpad*|Xvfb|x11vnc|openbox)
                        printf 'PROCESS=%s %s ' "${directory##*/}" "$name"
                        cat "$directory/wchan" 2>/dev/null || true
                        printf '\n'
                        cat "$directory/stat" 2>/dev/null || true
                        cat "$directory/syscall" 2>/dev/null || true
                        sed -n '/^State:/p; /^Threads:/p; /^VmRSS:/p' "$directory/status" 2>/dev/null || true
                        ;;
                esac
            done
            tail -n 20 /tmp/brave.log
            tail -n 10 /tmp/brave-main.strace /tmp/strace.log 2>/dev/null || true
            tail -n 8 /tmp/vnc.log
        } >/tmp/projlib-diagnostics.txt
        printf '\nPROJLIB_DIAGNOSTICS:%s\n' "$(base64 -w 0 /tmp/projlib-diagnostics.txt)"
        sleep 20
    done
) & fi
printf 'PROJLIB_DISPLAY_HELPER_START\n'
/.vm/guest-helper --rfb-stdio || {
    printf 'PROJLIB_DISPLAY_HELPER_FAILED\n'
    cat /tmp/xvfb.log /tmp/vnc.log /tmp/brave.log
    exit 1
}
printf 'PROJLIB_DISPLAY_HELPER_EXITED\n'
cat /tmp/vnc.log /tmp/brave.log
