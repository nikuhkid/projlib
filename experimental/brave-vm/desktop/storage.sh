#!/bin/sh
set -eu
mkdir -p "$HOME/profile"
printf '\000\001\377\200\177' >/tmp/projlib-expected-binary
/.vm/guest-helper --profile-import
if [ -f "$HOME/profile/Preferences.fixture" ]; then
    [ "$(cat "$HOME/profile/Preferences.fixture")" = 'projlib-local-profile-round-trip-fixture' ]
    cmp /tmp/projlib-expected-binary "$HOME/profile/Default/Network/Cookies.fixture"
    [ "$(cat "$HOME/profile/Default/Network/Cookies.fixture-wal")" = 'journal-fixture' ]
    [ "$(cat "$HOME/.cache/fontconfig/fixture")" = 'font-cache-fixture' ]
    printf 'PROJLIB_STORAGE_IMPORT_VERIFIED\n'
    exec sleep infinity
fi
printf 'projlib-local-profile-round-trip-fixture' >"$HOME/profile/Preferences.fixture"
mkdir -p "$HOME/profile/Default/Network" "$HOME/.cache/fontconfig"
cp /tmp/projlib-expected-binary "$HOME/profile/Default/Network/Cookies.fixture"
printf 'journal-fixture' >"$HOME/profile/Default/Network/Cookies.fixture-wal"
printf 'font-cache-fixture' >"$HOME/.cache/fontconfig/fixture"
/.vm/guest-helper --profile-export
printf 'PROJLIB_STORAGE_EXPORT_READY\n'
exec sleep infinity
