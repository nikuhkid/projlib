# ProjLib Control Node [BETA]

ProjLib is a public, themed website directory and web-proxy console. Pick a site from one of six categories or enter an HTTP(S) address. The selected page opens inside the console. The original project name, directory, eight themes, and artwork are preserved.

- **Proxy Mode:** a separate Cloudflare Worker retrieves pages and rewrites ordinary links, images, stylesheets, forms, redirects, and browser fetch/XHR requests through the proxy.
- **Direct Mode:** opens the destination directly in the iframe. Sites that forbid embedding will refuse to appear.
- **Controls:** address bar (Scanner), Home, Refresh, Fullscreen, theme cycling, and Open original.
- **Public access:** no Wix SDK, visitor account, email allowlist, login screen, or restricted view. Optional browser preferences store only the selected theme and mode.

The interface is hosted on **GitHub Pages** at <https://nikuhkid.github.io/projlib/>. The proxy runs separately on **Cloudflare Workers**: Pages serves static files and cannot run a proxy backend.

**Current deployment:** the public interface is published on GitHub Pages, with its proxy at <https://projlib-proxy.fabmigfarcos.workers.dev>. The Worker is deployed and `proxyBase` points to it. New visitors start in Proxy Mode; an existing saved Direct Mode preference is respected. The switch works without visitor sign-in or approval. Cloudflare authorization is needed only to administer deployments from Wrangler.

## What this proxy supports

The Worker handles public HTTP(S) destinations on standard ports. It rewrites HTML attributes, `srcset`, CSS URLs/imports, redirects, GET/POST forms, JavaScript fetch/XHR, and ordinary dynamically inserted links. It streams binary resources and forwards range requests.

This is a stateless web proxy, not a VPN or a complete browser emulator. Cookies and authorization headers are not forwarded, and proxied documents are sandboxed without shared storage. Destination sign-ins, anti-bot challenges, DRM/video players, WebSockets, service workers, JavaScript module imports, and applications tied to their original origin may not work. Some bookmarked domains may also have expired since the original directory was written. **Open original** is always available. Browsing is not anonymous to the destination or hosting providers.

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

### GitHub Pages

The `.github/workflows/pages.yml` workflow runs Worker tests, builds an explicit allowlist of browser assets into `dist/`, and publishes it using GitHub's Pages Actions. Tooling, tests, and Worker source are excluded from the published artifact. Configure **Settings → Pages → Source → GitHub Actions**, then push to `main`. Only the Pages website needs to be public; the repository can remain private when the account plan supports it.

## Verification

```sh
npm test
npx playwright install chromium --only-shell
npm run test:browser
npm run build
```

The Worker tests execute Cloudflare's actual HTMLRewriter in Miniflare with deterministic upstream responses. Browser checks cover anonymous startup, all categories/themes, address validation, mode switching, cross-origin refresh, blocked local storage, configuration failures, mobile width, and the complete interface → Worker → destination path. These tests do not claim compatibility with every bookmarked third-party site.

## Repository structure

```text
index.html            Console markup
hubData.json          Directory, themes, and proxy endpoint
css/style.css         Console layout and controls
css/themes/           Theme styles
js/core.js            Configuration, URL, and preference helpers
js/ui.js              Dropdowns, theme loading, and status messages
js/apps.js            Navigation and control handlers
js/themes/            Theme effects and cleanup hooks
assets/               Original theme artwork
worker/               Cloudflare proxy and Wrangler configuration
scripts/              Static server and Pages asset build
tests/                Worker and browser tests
.github/workflows/    GitHub Pages deployment
```

Older `css/base.css`, `css/components.css`, `css/themes.css`, and dark-theme files remain in the repository for reference; the current console does not load them.

## License and credits

All Rights Reserved; see [LICENSE](LICENSE). The existing license is unchanged.

Original interface assets and themes are retained. Fonts: Orbitron (Google Fonts). Icons: Remix Icon. The proxy uses Cloudflare Workers' HTMLRewriter; no external public proxy is required.
