#!/bin/sh
set -eu
printf '\nPROJLIB_GUEST_ARCH='
uname -m
printf 'PROJLIB_ENTROPY='
cat /proc/sys/kernel/random/entropy_avail
printf 'PROJLIB_CPU_FLAGS='
sed -n '/^flags/{p;q;}' /proc/cpuinfo
brave-browser --version &
probe_pid=$!
for count in 1 2 3 4 5 6 7 8 9 10 11 12; do
    [ -d "/proc/$probe_pid" ] || break
    sleep 5
    printf '\nPROJLIB_PROCESS_SAMPLE=%s\n' "$count"
    for directory in /proc/[0-9]*; do
        name=$(cat "$directory/comm" 2>/dev/null || true)
        case "$name" in
            brave*|chrome*|crashpad*)
                printf 'PROCESS=%s %s ' "${directory##*/}" "$name"
                cat "$directory/wchan" 2>/dev/null || true
                printf '\n'
                sed -n '/^State:/p; /^Threads:/p; /^VmRSS:/p' "$directory/status" 2>/dev/null || true
                ;;
        esac
    done
done
wait "$probe_pid"
printf 'PROJLIB_BRAVE_PROBE_BEGIN\n'
. /.vm/fonts.sh
set --
if [ "${PROJLIB_JITLESS:-0}" = 1 ]; then set -- --js-flags=--jitless; fi
env -u DISPLAY dbus-run-session -- /bin/sh -c '
    export DBUS_SYSTEM_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS"
    exec brave-browser "$@"
' projlib-brave --headless --ozone-platform=headless \
    "$@" \
    --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage \
    --no-first-run --no-default-browser-check --user-data-dir="$HOME/profile" \
    --dump-dom 'data:text/html,<title>ProjLib Brave engine probe</title><p id="proof">Actual Brave executed inside the guest</p>' &
render_pid=$!
if [ -f /.vm/diagnostics/enabled ]; then
    while kill -0 "$render_pid" 2>/dev/null; do
        sleep 20
        printf 'PROJLIB_RENDER_PROCESS_SAMPLE\n'
        cat /proc/uptime
        for directory in /proc/[0-9]*; do
            name=$(cat "$directory/comm" 2>/dev/null || true)
            case "$name" in
                brave*|chrome*)
                    printf 'PROCESS=%s %s ' "${directory##*/}" "$name"
                    cat "$directory/wchan" 2>/dev/null || true
                    printf '\n'
                    cat "$directory/stat" 2>/dev/null || true
                    cat "$directory/syscall" 2>/dev/null || true
                    ;;
            esac
        done
    done
fi
wait "$render_pid"
printf '\nPROJLIB_BRAVE_PROBE_COMPLETE\n'
exec sleep infinity
