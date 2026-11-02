// Public, stateless web proxy for ProjLib. No identity provider or visitor login.
// It rewrites ordinary HTML/CSS navigation; it is not a VPN or a full browser emulator.
import { browserRequest } from './browser-relay.js';
export { BrowserRelay } from './browser-relay.js';
const PREFIX = '/proxy/';
const UPSTREAM_REQUEST_HEADERS = [
  'accept', 'accept-language', 'content-type', 'range', 'if-none-match', 'if-modified-since',
  // Match HTTP browser detection to the real engine rendering the proxied page.
  // Forward the default browser hints only; do not invent a Chrome version or platform.
  'user-agent', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform'
];

export function validateTarget(value, proxyOrigin) {
  const target = new URL(value);
  const host = target.hostname.toLowerCase().replace(/\.$/, '');
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('Only public HTTP and HTTPS addresses without credentials are supported.');
  }
  // The public proxy has no reason to connect to IP literals or local services.
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') ||
      /(^|\.)(localhost|local|localdomain|internal|lan|home|invalid)$/.test(host) || host.endsWith('.home.arpa') ||
      (target.port && !['80', '443'].includes(target.port)) || target.origin === proxyOrigin) {
    throw new Error('Use a public website on its standard HTTP or HTTPS port.');
  }
  return target;
}

export function proxyUrl(value, base, origin) {
  if (!value || /^(#|data:|blob:|mailto:|tel:|javascript:|about:)/i.test(value.trim())) return value;
  try {
    const url = new URL(value, base);
    if (url.origin === origin && url.pathname.startsWith(PREFIX)) return url.href;
    validateTarget(url.href, origin);
    return `${origin}${PREFIX}${url.href}`;
  } catch { return value; }
}

export function rewriteCss(css, base, origin) {
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote, value) =>
    `url(${quote}${proxyUrl(value, base, origin)}${quote})`
  ).replace(/(@import\s+)(['"])(.*?)\2/gi, (match, prefix, quote, value) =>
    `${prefix}${quote}${proxyUrl(value, base, origin)}${quote}`
  );
}

function escapedJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function clientScript(target, origin, frontendOrigin) {
  // Fetch/XHR and dynamically inserted ordinary links/assets stay on the proxy.
  // Do not patch location or claim compatibility with every JavaScript application.
  return `<script>(function(){
    const original = ${escapedJson(target.href)};
    const origin = ${escapedJson(origin)};
    const frontend = ${escapedJson(frontendOrigin)};
    const prefix = origin + '/proxy/';
    const fromProxy = value => value.startsWith(prefix) ? value.slice(prefix.length) : value;
    const base = () => fromProxy(document.baseURI);
    function proxify(value) {
      if (!value || /^(#|data:|blob:|mailto:|tel:|javascript:|about:)/i.test(String(value).trim())) return value;
      try {
        const url = new URL(String(value), base());
        if (url.href.startsWith(prefix) || !/^https?:$/.test(url.protocol)) return url.href;
        return prefix + url.href;
      } catch { return value; }
    }
    function notify() {
      const url = fromProxy(location.href);
      if (url !== location.href) parent.postMessage({type:'projlib:navigation', url}, frontend);
    }
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (input instanceof Request) input = new Request(proxify(input.url), input);
      else input = proxify(input);
      return nativeFetch(input, init);
    };
    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      return nativeOpen.call(this, method, proxify(url), ...args);
    };
    for (const name of ['pushState', 'replaceState']) {
      const native = history[name].bind(history);
      history[name] = function(state, unused, url) {
        const result = native(state, unused, url == null ? url : proxify(url));
        notify();
        return result;
      };
    }
    const nativeWindowOpen = window.open;
    window.open = function(url, ...args) { return nativeWindowOpen.call(this, url ? proxify(url) : url, ...args); };
    const attributes = ['href', 'src', 'action', 'poster'];
    function rewriteElement(node) {
      if (!(node instanceof Element)) return;
      for (const attr of attributes) {
        if (node.hasAttribute(attr)) {
          const before = node.getAttribute(attr), after = proxify(before);
          if (before !== after) node.setAttribute(attr, after);
        }
      }
    }
    function rewrite(node) {
      if (!(node instanceof Element)) return;
      rewriteElement(node);
      node.querySelectorAll('[href],[src],[action],[poster]').forEach(rewriteElement);
    }
    new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          const node = mutation.target, attr = mutation.attributeName;
          const before = node.getAttribute(attr), after = proxify(before);
          if (before !== after) node.setAttribute(attr, after);
        } else mutation.addedNodes.forEach(rewrite);
      }
    }).observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:attributes});
    document.addEventListener('click', event => {
      const link = event.target.closest && event.target.closest('a[href],area[href]');
      if (link) link.setAttribute('href', proxify(link.getAttribute('href')));
    }, true);
    document.addEventListener('submit', event => {
      event.target.action = proxify(event.target.getAttribute('action') || original);
    }, true);
    addEventListener('popstate', notify);
    addEventListener('hashchange', notify);
    notify();
  })();</script>`;
}

function responseHeaders(upstream, frontendOrigin) {
  const headers = new Headers(upstream);
  for (const name of ['content-security-policy', 'content-security-policy-report-only', 'x-frame-options',
    'set-cookie', 'clear-site-data', 'www-authenticate', 'report-to', 'nel', 'refresh',
    'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'cross-origin-resource-policy']) {
    headers.delete(name);
  }
  headers.set('access-control-allow-origin', '*');
  headers.delete('access-control-allow-credentials');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  // Sandboxed documents cannot share cookies/storage across destination sites.
  headers.set('content-security-policy', `frame-ancestors ${frontendOrigin}; sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads`);
  headers.set('cache-control', 'no-store');
  return headers;
}

function errorResponse(message, status, frontendOrigin) {
  const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ProjLib proxy</title><style>body{background:#111;color:#eee;font:16px/1.6 system-ui;padding:2rem;max-width:50rem}h1{font-size:1.4rem}</style><h1>The proxy could not open this address</h1><p>${escape(message)}</p><p>Use Open original in ProjLib to try the website directly.</p><script>parent.postMessage({type:'projlib:error'},${escapedJson(frontendOrigin)})</script></html>`, {
    status,
    headers: { ...Object.fromEntries(responseHeaders({}, frontendOrigin)), 'content-type': 'text/html; charset=utf-8' }
  });
}

export default {
  async fetch(request, env) {
    const frontendOrigin = env.FRONTEND_ORIGIN || 'https://nikuhkid.github.io';
    const incoming = new URL(request.url);
    if (incoming.pathname.startsWith('/browser/')) return browserRequest(request, env);
    if (incoming.pathname === '/health') {
      return Response.json({ service: 'projlib-proxy', status: 'ok' }, { headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    }
    if (incoming.pathname === '/') return new Response('ProjLib public web proxy. Open https://nikuhkid.github.io/projlib/ to browse.');
    if (!incoming.pathname.startsWith(PREFIX)) return errorResponse('Unknown proxy path.', 404, frontendOrigin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
      'access-control-allow-headers': 'Content-Type, Range, Accept, Accept-Language', 'access-control-max-age': '86400'
    } });
    if (!['GET', 'HEAD', 'POST'].includes(request.method)) return errorResponse('This request method is unsupported.', 405, frontendOrigin);
    let target;
    try {
      target = validateTarget(incoming.pathname.slice(PREFIX.length) + incoming.search, incoming.origin);
    } catch (error) { return errorResponse(error.message, 400, frontendOrigin); }

    try {
      const headers = new Headers();
      // Never forward ProjLib/Cloudflare cookies, authorization, or visitor IP headers.
      for (const name of UPSTREAM_REQUEST_HEADERS) {
        if (request.headers.has(name)) headers.set(name, request.headers.get(name));
      }
      const upstream = await fetch(target, {
        method: request.method, headers, redirect: 'manual',
        body: request.method === 'POST' ? request.body : undefined,
        signal: AbortSignal.timeout(20000)
      });
      const outputHeaders = responseHeaders(upstream.headers, frontendOrigin);
      if (upstream.headers.has('location')) {
        const redirect = validateTarget(new URL(upstream.headers.get('location'), target).href, incoming.origin);
        outputHeaders.set('location', proxyUrl(redirect.href, target, incoming.origin));
      }
      const type = upstream.headers.get('content-type') || '';
      const hasBody = request.method !== 'HEAD' && ![204, 205, 304].includes(upstream.status);
      if (hasBody && type.includes('text/html')) {
        outputHeaders.delete('content-length');
        outputHeaders.delete('content-encoding');
        outputHeaders.delete('etag');
        let base = target.href;
        let foundBase = false;
        let injected = false;
        const attributes = ['href', 'src', 'action', 'poster', 'data'];
        const rewriter = new HTMLRewriter()
          .on('head', { element(element) {
            injected = true;
            element.prepend(clientScript(target, incoming.origin, frontendOrigin), { html: true });
            element.append(`<base href="${incoming.origin}${PREFIX}${target.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`, { html: true });
          } })
          .on('base', { element(element) {
            const href = element.getAttribute('href');
            if (href && !foundBase) {
              base = new URL(href, target).href;
              foundBase = true;
            }
          } })
          .on('meta[http-equiv]', { element(element) {
            if (/^(content-security-policy|refresh)$/i.test(element.getAttribute('http-equiv'))) element.remove();
          } })
          .on('*', { element(element) {
            for (const name of attributes) {
              const value = element.getAttribute(name);
              if (value != null) element.setAttribute(name, proxyUrl(value, base, incoming.origin));
            }
            const srcset = element.getAttribute('srcset');
            if (srcset && !srcset.includes('data:')) {
              element.setAttribute('srcset', srcset.split(',').map(part => {
                const [url, ...size] = part.trim().split(/\s+/);
                return [proxyUrl(url, base, incoming.origin), ...size].join(' ');
              }).join(', '));
            }
            const style = element.getAttribute('style');
            if (style) element.setAttribute('style', rewriteCss(style, base, incoming.origin));
            element.removeAttribute('integrity');
            if (element.getAttribute('target') === '_top' || element.getAttribute('target') === '_parent') element.setAttribute('target', '_self');
          } })
          .on('style', { text(chunk) {
            // Buffer style text across streaming chunks so url() tokens are not split.
            this.css = (this.css || '') + chunk.text;
            chunk.replace(chunk.lastInTextNode ? rewriteCss(this.css, base, incoming.origin) : '', { html: true });
            if (chunk.lastInTextNode) this.css = '';
          } })
          .onDocument({ end(document) {
            // HTML fragments may omit <head>; still report navigation to the console.
            if (!injected) document.append(clientScript(target, incoming.origin, frontendOrigin), { html: true });
          } });
        return rewriter.transform(new Response(upstream.body, { status: upstream.status, headers: outputHeaders }));
      }
      if (hasBody && type.includes('text/css')) {
        outputHeaders.delete('content-length');
        outputHeaders.delete('content-encoding');
        outputHeaders.delete('etag');
        return new Response(rewriteCss(await upstream.text(), target, incoming.origin), { status: upstream.status, headers: outputHeaders });
      }
      return new Response(upstream.body, { status: upstream.status, headers: outputHeaders });
    } catch {
      return errorResponse('The destination is unavailable, blocked this request, or took too long to respond.', 502, frontendOrigin);
    }
  }
};
