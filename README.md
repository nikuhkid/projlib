# ProjLib Control Node [BETA]

ProjLib is a public, themed website directory and web-proxy console. Pick a site from one of six categories or enter an HTTP(S) address. The selected page opens inside the console. The original project name, directory, eight themes, and artwork are preserved.

- **Proxy Mode:** a real, sandboxed Chromium browser on Wolfie opens the website at its original origin. ProjLib streams its view and sends your pointer/keyboard input through an encrypted Cloudflare relay. Each visitor gets a separate incognito context, including cookies and storage.
- **Direct Mode:** opens the destination directly in the iframe. Sites that forbid embedding will refuse to appear.
- **Controls:** address bar (Scanner), Home, Refresh, Fullscreen, themes, Open original, browser tabs, Back/Forward, Keyboard, and End session.
- **Public access:** no ProjLib account or visitor login. Destination websites still require their own normal sign-in. Theme/mode preferences use local storage; an unpredictable session capability uses tab-scoped session storage for reconnection. Website credentials and cookies stay in the remote browser context, never in ProjLib's repository or logs.

The interface is hosted on **GitHub Pages** at <https://nikuhkid.github.io/projlib/>. The proxy runs separately on **Cloudflare Workers**: Pages serves static files and cannot run a proxy backend.

The interface uses <https://projlib-proxy.fabmigfarcos.workers.dev> as its gateway. New visitors start in Proxy Mode; an existing saved Direct Mode preference is respected. Cloudflare authorization is only needed to administer deployments. Wolfie must have the browser host running for browser sessions to work.

## Browser sessions

Website JavaScript, redirects, HTTPS/WSS, login forms, and cookies execute normally inside Chromium, under the website's own origin. Refresh, navigation, and a ProjLib page reload preserve the current session. Separate visitors cannot share cookies or storage. The backend does not use Wolfie's normal browser profile. TLS to the destination ends in Chromium; the local egress guard does not intercept HTTPS.

There are at most two simultaneous visitors and four tabs per visitor. End session destroys the visitor's context. Sessions also end after 20 minutes without input, one minute disconnected, a host restart, or critically low host memory. Cookies are temporary; they are not saved as a persistent account profile. On phones, tap Keyboard to enter text; swipe inside the view to scroll. Text paste works, but copying text out of the remote browser is not implemented.

This version streams images and input. Audio, camera/microphone, file uploads/downloads, passkeys, and screen-reader access to the remote page are not implemented. Facebook and Instagram's sign-in forms rendered in the Wolfie smoke check, but user testing reached a repeating Instagram CAPTCHA. Instagram account access is therefore still blocked. ChatGPT presented a human-verification checkbox and has not reached a verified login. A fresh test with installed Edge also reached ChatGPT's challenge; changing the browser brand alone did not remove it.

Cloudflare lists automated browsers and automation frameworks, including Playwright, as [unsupported for production challenges](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/). This affects the suitability of this architecture for challenge-protected services. Cookies and login persistence work in the controlled fixture; that does not demonstrate that Meta or ChatGPT will accept the remote browser. The provider and cause of Instagram's CAPTCHA loop have not yet been identified.

The browser uses its actual Chromium identity. No fixed Chrome version, false navigation metadata, stealth plugin, or challenge bypass is injected. This is not anonymous browsing: destinations see Wolfie's public IP, and hosting providers carry the connection. Public internet destinations on standard ports are allowed; local/private networks, IP literals, file URLs, and DevTools access are blocked.

## Lightweight proxy fallback

Setting `browserSessions` to `false` restores the original stateless HTML proxy, also retained at `/proxy/…` for regression tests and rollback.

The Worker handles public HTTP(S) destinations on standard ports. It rewrites HTML attributes, `srcset`, CSS URLs/imports, redirects, GET/POST forms, JavaScript fetch/XHR, and ordinary dynamically inserted links. It streams binary resources and forwards range requests.

Browser detection receives the visitor's actual `User-Agent` and default browser client hints (brand, mobile flag, and platform). Opening ProjLib in Chrome therefore identifies HTTP requests as that Chrome browser, while JavaScript still runs in the same real browser. Other browsers keep their own identity; no fixed Chrome version is fabricated. This improves browser detection but does not add missing cookies, storage, or other browser capabilities.

That fallback excludes cookies and authorization headers, and uses an opaque sandbox origin. It cannot provide normal website login sessions. Some bookmarked domains may have expired since the original directory was written. **Open original** is always available.

## Local development

Requires Node.js 22 or newer and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4173/projlib/>. All asset paths are relative so the project works under the GitHub Pages `/projlib/` path.

The Worker can run separately:

```sh
npm run worker:dev
```

For local proxy testing, set `proxyBase` in `hubData.json` to the origin Wrangler prints, and pass `--var FRONTEND_ORIGIN:http://127.0.0.1:4173` to `worker:dev`. Restore the production endpoint before publishing.

## Configuration

`hubData.json` contains:

- `defaultHome`: the website Home opens.
- `proxyBase`: the deployed Worker origin, without a `/proxy/` suffix. Proxy Mode is enabled by default when this is set. An empty value leaves Direct Mode available.
- `browserSessions`: use the Wolfie browser backend when `true`, or the stateless HTML rewriting proxy when `false`.
- `categories`: the six dropdowns and their site names/URLs. The existing bookmarks are retained.
- `themes`: the eight CSS/JavaScript theme pairs.

Theme and mode preferences are optional: startup still works if the browser blocks local storage. Theme animations respect reduced-motion preferences and clean up when switched.

## Deployment

### Cloudflare Worker

```sh
npx wrangler login
npm run worker:deploy
```

`worker/wrangler.jsonc` configures the `projlib-proxy` Worker on `workers.dev`, with the GitHub Pages origin allowed to embed it. There is no Cloudflare Access gate or visitor authentication. Put the printed Worker origin in `hubData.json` → `proxyBase`. Cloudflare credentials stay in Wrangler's local authentication store; never put them in the frontend or repository.

### Wolfie browser host

```sh
npx playwright install chromium --only-shell
npm run browser:init
```

The init command creates a host secret in the ignored `.local/browser-host-key`. Set the Worker's `BROWSER_HOST_KEY` secret from that file via Wrangler's standard input; never paste its content into code, chat, a URL, or a command-line argument. On PowerShell:

```powershell
Get-Content -Raw .local/browser-host-key | npx wrangler secret put BROWSER_HOST_KEY --config worker/wrangler.jsonc
npm run browser:host
```

Use `npm run browser:stop` from this checkout to close the host and all its private browser contexts gracefully.

The host connects outbound to `/browser/host`. The Worker authenticates it and routes visitors through a Durable Object. There is no public inbound server, desktop access, or CDP port. Only the egress guard binds loopback. `/browser/health` reports whether the host is connected, without exposing visitor data. Host logs contain connection status only. No Windows service, startup task, or machine setting is installed by these commands; run the host manually after a reboot.

The egress guard validates all DNS answers and connects to a pinned public IP. Chromium's implicit loopback proxy bypass is disabled and WebRTC is restricted to proxied traffic. Input commands are allowlisted, message sizes/rates bounded, and slow clients cannot accumulate unlimited frames. See [browser-sessions.md](docs/browser-sessions.md) for the implementation boundary.

### GitHub Pages

The `.github/workflows/pages.yml` workflow runs Worker tests, builds an explicit allowlist of browser assets into `dist/`, and publishes it using GitHub's Pages Actions. Tooling, tests, and Worker source are excluded from the published artifact. Configure **Settings → Pages → Source → GitHub Actions**, then push to `main`. Only the Pages website needs to be public; the repository can remain private when the account plan supports it.

## Verification

```sh
npx playwright install chromium --only-shell
npm test
npm run test:browser
npm run build
```

Worker tests execute Cloudflare's actual HTMLRewriter and Durable Object relay in Miniflare. Host tests use real sandboxed Chromium against a fake login fixture to verify cookie/storage isolation, navigation, frame streaming, input validation, ownership, and cleanup. Browser checks cover the complete Pages → Worker/relay → Wolfie browser → destination path, including typed login, refresh/resume, isolation, mobile width, End session, and legacy controls/themes. These tests do not claim compatibility with every third-party site.

## Repository structure

```text
index.html            Console markup
hubData.json          Directory, themes, and proxy endpoint
css/style.css         Console layout and controls
css/themes/           Theme styles
js/core.js            Configuration, URL, and preference helpers
js/ui.js              Dropdowns, theme loading, and status messages
js/apps.js            Navigation and control handlers
js/browser-session.js Remote view, input, tabs, and reconnection
js/themes/            Theme effects and cleanup hooks
assets/               Original theme artwork
worker/               Cloudflare proxy and Wrangler configuration
server/               Wolfie browser host, sessions, and network guard
scripts/              Static server and Pages asset build
tests/                Worker and browser tests
.github/workflows/    GitHub Pages deployment
```

Older `css/base.css`, `css/components.css`, `css/themes.css`, and dark-theme files remain in the repository for reference; the current console does not load them.

## License and credits

All Rights Reserved; see [LICENSE](LICENSE). The existing license is unchanged.

Original interface assets and themes are retained. Fonts: Orbitron (Google Fonts). Icons: Remix Icon. The proxy uses Cloudflare Workers' HTMLRewriter; no external public proxy is required.
