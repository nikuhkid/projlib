# Home connection

The Cloudflare proxy is available without home verification. Scanner exposes a separate connection selector when Proxy Mode is enabled. Verifying the password defined in ProjLib Host selects Wolfie for this browser for twelve hours. The deadline is absolute. Browsing, refreshing, reopening ProjLib and selecting another connection do not extend it. When it expires, requests use Cloudflare until the host password is verified again.

The host stores a salted scrypt password verifier. It issues HMAC-signed grants with a twelve-hour lifetime and checks them before each HTTP request and WebSocket connection. Active home connections end at the deadline. Changing the host password rotates the signing key and ends existing home connections. Forget verification clears the current browser's grant. Clear browsing data also clears verification.

The browser receives a Secure, HttpOnly, partitioned cookie from the rewriting gateway. The password is not retained by the page or stored in localStorage. The separate Breach Protocol entrance continues to control presentation. It does not authorize home egress.

The route is Chrome to the existing Cloudflare Worker, then Wolfie, then the destination. Chrome executes and renders websites. The host pins validated public DNS addresses, rejects private destinations and the gateway itself, preserves virtual site headers and cookies, and streams responses. The Cloudflare-to-host pairing key is separate from the user-defined password and is excluded from destination requests.

An expired or revoked grant is rejected before the host submits the destination request, allowing safe fallback to Cloudflare. On an ambiguous home connection failure, the failed request is not replayed automatically. Subsequent requests select Cloudflare, and an unexpired verification can be used again when the host returns.

## Host candidate

Run `npm run home:build` to build `.local/home-release/`. Its launcher opens the loopback-only password and start/stop panel. The candidate bundles a dedicated copy of the local Node.js runtime with its licence, and uses the miniupnpc library in Wolfie's installed Remmie Python runtime and the existing No-IP TLS certificate. The Python and certificate paths are stored in the host's local configuration and can be changed there. The certificate is read in place and reloaded during lease renewal.

The host requests TCP 8443 through UPnP with fifteen-minute leases and renews them every five minutes while running. It checks mapping ownership before renewal or deletion. A failed renewal is retried with backoff, and a conflicting owner stops the host. A narrow program-specific Windows firewall rule is required for the dedicated host executable and this port. Installation, firewall changes and sign-in startup configuration require approval of the candidate.

The launcher's default data directory is alongside the candidate. Settings, verifier, pairing key and process lock stay there. Production installation should place this directory under the user's private application data and preserve it across updates. The launcher resumes the last Start/Stop choice. Set the host password in the local panel. Pair the host once with `npm run home:pair -- <path-to-config.json>`, which sends only the separate pairing key to the Worker's secret binding through standard input. The Cloudflare Worker uses the configured `HOME_PROXY_ORIGIN`; the home option stays unavailable until that pairing is configured.

## Verification

Automated checks cover twelve-hour expiry, tampering, password-change revocation, local control authorization, form bodies, multiple response cookies, decompression, ranges, WebSockets, private destination rejection, Cloudflare fallback, reload persistence and forgetting a browser's grant. Fake test passwords are used. These tests do not establish third-party account compatibility or a completed installation on Wolfie.
