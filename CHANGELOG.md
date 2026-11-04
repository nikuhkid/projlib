# Changelog

## 2026-11-04

- Added local browser rendering through a pinned Scramjet rewriting component, with HTTP and WebSocket traffic relayed through the Cloudflare Worker.
- Fixed cookie restoration, domain/path handling, response-cookie persistence, stylesheet notification deadlocks, storage clearing, and relative module imports in the integration.
- Added Clear browsing data, a top-level proxy viewer link, and an AGPL source page with downloadable adaptations, complete upstream source, dependency notices and checksums.
- Verified local rendering, fake-account login, refresh and service worker restoration, browser-profile isolation, modules, WebSockets, storage clearing and local interaction while offline. Real Instagram and ChatGPT account compatibility remains unverified.

## 2026-11-02

- Reduced browser-stream overhead with binary JPEG transfer, bounded frame pipelining, Responsive/Sharper choices, scaled pointer mapping, and coalesced scrolling. Controlled slower-link measurements used 49% fewer bytes per frame and improved median frame cadence from 372 ms to 144 ms.
- Added isolated, sandboxed Chromium sessions on Wolfie, streamed through an authenticated outbound Cloudflare Durable Object relay. No public desktop or DevTools port is exposed.
- Added per-visitor cookies/storage, tab controls, keyboard/paste/touch input, session reconnection, idle cleanup, resource limits, and DNS-pinned public-network egress.
- Verified login persistence, visitor isolation, session cleanup, and the complete interface/relay/browser path with a fake account fixture. Facebook and Instagram sign-in forms render; ChatGPT requires human verification. Real account sign-ins remain unverified.
- User testing reached a repeating Instagram CAPTCHA. Documented the unresolved account-access limitation and Cloudflare's unsupported automated-browser environment; an installed Edge comparison did not remove ChatGPT's challenge.
- Confirmed the reported check has Meta branding and is viewed in Brave on a computer. Kept its cause separate from Cloudflare's challenge policy, and added a cross-origin mouse click/drag regression check at a narrow viewport.
- Removed Wix identity helpers, email allowlists, authorization checks, and masked link views.
- Reconnected the original console: six category dropdowns, URL input, Proxy Mode, Home, Refresh, Fullscreen, and eight themes.
- Fixed the invalid pasted patch instruction in the main theme script, cross-origin refresh errors, theme cleanup leaks, and the inaccessible proxy checkbox.
- Added loading timeouts, useful error messages, an Open original link, safe URL handling, optional preferences, reduced-motion support, and mobile layout fixes.
- Replaced the defunct third-party proxy dependency with a self-hosted, stateless Cloudflare Worker.
- Added Pages deployment, a browser-asset-only build, Worker runtime tests, and browser integration tests.
- Replaced the duplicated draft README with documentation of the implemented behavior and its limits.
- Made the repository public with explicit approval and enabled GitHub Pages.
- Completed Cloudflare authorization on Wolfie, deployed `projlib-proxy`, and connected the Pages interface to its public Worker endpoint. Proxy Mode is enabled by default for new visitors; existing mode preferences are respected.
- Restored the visitor's User-Agent and default browser client hints on proxy requests, keeping server-side browser detection consistent with the real browser rendering the page.
