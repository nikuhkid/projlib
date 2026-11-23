#!/bin/sh
set -eu
printf 'PROJLIB_NETWORK_PROBE_BEGIN\n'
result=$(curl --fail --silent --show-error --max-time 25 https://api.ipify.org/)
case "$result" in
    *[!0-9.]*|'') printf 'PROJLIB_NETWORK_PROBE_FAILED\n'; exit 1 ;;
esac
# This request uses curl's normal certificate verification. Its TLS stream is
# originated in the guest, carried over the relay and terminated at api.ipify.org.
# Keep the returned address out of the diagnostic record.
printf 'PROJLIB_TLS_PUBLIC_EGRESS_PASS\n'
if [ "${PROJLIB_RECONNECT_PROBE:-0}" = 1 ]; then
    printf 'PROJLIB_NETWORK_RECONNECT_READY\n'
    IFS= read -r command
    [ "$command" = PROJLIB_NETWORK_CONTINUE ] || exit 1
    result=$(curl --fail --silent --show-error --max-time 60 https://api.ipify.org/)
    case "$result" in
        *[!0-9.]*|'') printf 'PROJLIB_NETWORK_RECONNECT_FAILED\n'; exit 1 ;;
    esac
    printf 'PROJLIB_NETWORK_RECONNECT_PASS\n'
fi
exec sleep infinity
