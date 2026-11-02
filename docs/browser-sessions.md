# Browser sessions

## Goal

Support normal website sessions for services such as Instagram, Facebook, and ChatGPT while keeping ProjLib's public Pages interface and proxy routing. Browser identification alone is insufficient: the current HTML proxy excludes destination cookies and authorization headers, and uses an opaque sandbox origin.

## Selected host

Run the browser backend on Wolfie. The user selected this route because the machine already stays online. Use project-local dependencies; keep the existing lightweight proxy working during implementation.

## Implementation

- Use a real Chromium browser with its operating-system sandbox enabled.
- Create a separate incognito browser context for each visitor. Keep cookies and storage in that context, separate from the host's regular browser profile.
- Display remote page frames in ProjLib; route pointer, keyboard, navigation, and tab controls to that visitor's session. Website JavaScript executes in its original origin inside Chromium.
- Connect Wolfie outbound over an authenticated WebSocket to a Cloudflare Worker and Durable Object relay. No public inbound listener, tunnel daemon, desktop access, or DevTools port is exposed. Host authentication is internal; visitors do not need a ProjLib account.
- Use unpredictable session capabilities, origin checks, bounded message sizes, session and idle limits, and no logging of keyboard input or browser credentials.
- Restrict browser network access to public HTTP(S) destinations through a DNS-pinning egress proxy. Block local/private addresses, file URLs, host downloads, and direct DevTools access.
- Leave Windows startup/service installation out of the prototype. Review any persistent machine configuration separately.

## Verification

Test session ownership, cookie/storage isolation, blocked local network access, protocol validation, navigation, input, streaming, and cleanup before publishing the new mode. Verify Instagram, Facebook, and ChatGPT independently. Actual sign-in requires the user to enter credentials in the website; never request credentials in chat. A successful public page load does not prove a working authenticated session.

## Status

The Cloudflare relay is deployed and the Wolfie host connects outbound. The Pages configuration enables browser sessions. The lightweight proxy remains available with `browserSessions: false` for rollback. No Windows startup task or service is installed.

Local verification includes a real browser login fixture, per-visitor isolation, resume, input/frames through the relay, and context cleanup. A subsequent regression check confirms mouse clicks and drags reach a cross-origin frame at a narrow viewport. Public-site checks rendered Facebook and Instagram sign-in forms. ChatGPT showed an interactive human-verification checkbox; no challenge or account sign-in was completed.

The public Pages smoke check passes for page rendering, refresh, reconnection, mobile resizing, and End session. Subsequent user testing reached a repeating Instagram CAPTCHA in Brave on a computer, with Meta branding, so Instagram login remains blocked. Brave displays the remote stream; the destination executes in Chromium on Wolfie. ChatGPT also reaches a challenge in a fresh installed Edge session. Anonymous tests stored cookies and observed no failed resource requests during the observation period, but these tests do not diagnose the user's authenticated challenge. Cloudflare's unsupported-automation policy applies to its own challenges; Meta branding does not identify the underlying verification provider or establish the loop's cause. Do not describe real account compatibility as complete.
