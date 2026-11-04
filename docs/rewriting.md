# Local website rendering

The user approved publishing the separate Scramjet rewriting component under AGPL on 4 November 2026. The component consists of `rewrite/` and `scripts/build-rewrite.mjs`. The separately deployed gateway and existing ProjLib programs retain the terms in the root LICENSE.

Chrome on the visitor's device executes and renders the website. A service worker rewrites HTML, CSS, JavaScript, navigation and browser APIs using pinned Scramjet 1.1.0. Bare-mux 2.1.9 connects it to the ProjLib Worker transport. Browser scrolling, selection, typing, audio and native form controls use the local browser. Website requests still require a connection to the backend.

The GitHub Pages console embeds `/rewrite/` on the separate Worker origin. Its service worker is scoped to `/rewrite/`. The console, Worker management routes and remote browser relay are outside that scope. `rewriteProxy: true` selects this viewer. With it disabled, `browserSessions: true` selects the previous Wolfie browser, and disabling both selects the legacy stateless HTML proxy.

## Transport and storage

The shared worker sends HTTP requests to `/rewrite/fetch`. Request and response metadata travel in explicit headers, while bodies are streamed as binary data. Upload bodies are buffered and limited to 16 MiB. A 30-second timeout applies until upstream response headers arrive. The response body can continue streaming afterwards. Each redirect goes back through the transport and destination validation.

`/rewrite/socket` bridges text and binary WebSocket frames to the validated destination, including the requested subprotocol. Incoming WebSocket messages are limited to 1 MiB. Both transport routes require the viewer's own Origin. They forward only explicit virtual website headers and exclude outer gateway cookies and authorization, hop-by-hop headers, and forwarding headers. Cloudflare can add platform-managed headers to upstream requests. This mode is not an anonymity guarantee.

Traffic exits through Cloudflare. Wolfie is not part of this path. Destinations must be HTTP(S) or WS(S), with public hostnames and standard ports. IP literals, local hostnames, embedded credentials and the gateway's own origin are rejected. This hostname validation does not implement the Wolfie host's DNS pinning. There is no access path into Wolfie's network through this Worker.

The viewer's Content Security Policy confines resource connections and frames to the proxy origin, plus local data and blob URLs where needed. The service worker rejects external resource fetches that escape rewriting. This makes missed resource rewriting fail instead of silently contacting the original site directly. Native browser policies still govern navigation, popups and local browser APIs.

Virtual website cookies are held in the viewer's IndexedDB and restored when its service worker restarts. Local and session storage are partitioned by the virtual site's full origin. Separate browser profiles have separate storage. Tabs in one Chrome profile share the proxy's cookies and local storage. Website sessions can outlast a tab close. Clear browsing data sends Clear-Site-Data for the proxy origin, including cookies, local storage, IndexedDB, caches and its service worker. This clears all proxied sites in that storage partition.

Embedded storage and service workers are subject to Chrome policy and privacy settings. Open proxy in tab opens the viewer as a top-level page when embedded operation is unavailable. Endpoint and browser policies can still apply there.

## Engine adaptations

Scramjet's v1 release is retired upstream. We pin its package and maintain explicit, guarded build changes. A changed upstream bundle makes the build fail until reviewed.

- Replace the cookie module with tough-cookie 6.0.2, preserving the engine's interface. This fixes restoring serialized cookies, host-only and domain matching, cookie paths, expiration and deletion, and HttpOnly filtering through document.cookie.
- Deliver response-cookie notifications without waiting for acknowledgement from page JavaScript. The upstream wait can deadlock a stylesheet against the script that it blocks. Deliver actual cookie values, and acknowledge only notifications that carry a token.
- Persist HTTP response cookies before returning the rewritten response, including redirects.
- Replace the storage module to preserve full-origin scoping, key enumeration, property deletion and clearing only the requesting site's keys.
- Preserve directory separators in encoded URLs so relative module imports retain their base path.

Rewriting emulates website origins within a shared proxy origin. It does not reproduce every native browser security boundary. HttpOnly is emulated, and the serialized cookie jar is accessible within that proxy's browser storage. Browser features tied to the real origin, including passkeys, DRM and advanced cookie partitioning, are not guaranteed. The engine is not a boundary for mutually hostile website code. ProjLib's console remains on its separate origin.

The package metadata declares MIT, but Scramjet's distributed LICENSE contains AGPLv3. This distribution follows the actual LICENSE. The viewer links `/rewrite/source.html`, which offers downloadable source for the adaptations and the complete upstream revision, the AGPL text, dependency notices, and a checksum manifest. The build verifies the upstream archive against a pinned SHA-256 digest before packaging it.

## Verification

Local automated fixtures exercise real browser rendering, stylesheet cookies without deadlock, static and relative dynamic modules, fetch, WebSocket subprotocols, form login and redirects, HttpOnly filtering, persistence after a service worker restart, separate browser profiles, virtual-origin storage, clearing, and local clicks while the network is offline. Controlled fake credentials are used only in these fixtures.

Anonymous local checks rendered Example Domain, Wikipedia and Archive.org. Instagram returned its own Page isn't available response and cookie dialog. ChatGPT returned Unable to load site. These responses do not establish working third-party account login or removal of challenge loops. Cloudflare deployment can produce different upstream results from the local development runtime.

The public Worker version `f4dc0e63-6669-40c5-b786-17ae3833eac6` was deployed on 4 November 2026. Anonymous public checks rendered Example Domain, Wikipedia and Archive.org with completed document loads and no page errors. Instagram's login URL produced an empty page within the observation window. ChatGPT returned Unable to load site. Both public source archives returned HTTP 200 and matched the published SHA-256 manifest.

Install dependencies with `npm ci --ignore-scripts`. Run `npm test`, `npm run test:browser -- --workers=2`, and `npm run build` for regression checks. `npm run worker:dev` builds the rewriting assets and starts Wrangler locally. `node scripts/smoke-rewrite.mjs http://127.0.0.1:8787` checks anonymous public pages and writes ignored screenshots. `npm run worker:deploy` builds and publishes the Worker assets and corresponding source. Publish the Worker before pushing the Pages configuration that enables rewriting.
