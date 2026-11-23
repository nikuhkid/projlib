#!/bin/sh
# Disposable blank-profile laboratory only. Samples executable code, never
# profile files, screen contents, keyboard input or data mappings.
set -eu
sleep 45
selected=''
for directory in /proc/[0-9]*; do
    [ "$(cat "$directory/comm" 2>/dev/null || true)" = brave ] || continue
    selected="${directory##*/}"
    break
done
[ -n "$selected" ] || exit 1
/.vm/guest-strace -i -p "$selected" -qq -tt -s 0 -o /tmp/brave-main.strace >/tmp/strace.log 2>&1 &
tracer=$!
sleep 1
for sample in 1 2 3; do
    kill -STOP "$selected"
    sleep 0.2
    kill -CONT "$selected"
    sleep 1
done
kill -INT "$tracer" 2>/dev/null || true
wait "$tracer" || true
{
    printf 'PROJLIB_STARTUP_TRACE\n'
    tail -n 25 /tmp/brave-main.strace /tmp/strace.log
    for pc in $(sed -n '/SIGSTOP/s/^\[\([0-9a-f]*\)\].*/\1/p' /tmp/brave-main.strace | tail -n 3); do
        while read -r range permissions offset device inode pathname; do
            case "$permissions" in *x*) ;; *) continue ;; esac
            start=$((0x${range%-*}))
            end=$((0x${range#*-}))
            address=$((0x$pc))
            [ "$address" -ge "$start" ] && [ "$address" -lt "$end" ] || continue
            printf 'EXECUTABLE_PC=%s MODULE=%s FILE_OFFSET=%s\n' "$pc" "$pathname" "$((address-start+0x$offset))"
            dd if="/proc/$selected/mem" iflag=skip_bytes,count_bytes skip="$address" count=32 status=none 2>/dev/null | od -An -tx1 || true
        done <"/proc/$selected/maps"
    done
    tail -n 25 /tmp/brave.log
} >/tmp/projlib-startup-trace.txt
printf '\nPROJLIB_DIAGNOSTICS:%s\n' "$(base64 -w 0 /tmp/projlib-startup-trace.txt)"
