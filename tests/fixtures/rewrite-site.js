let homeExpires = 0;
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname === 'home.test') {
      if (request.headers.get('x-projlib-bridge') !== 'fixture-bridge') return new Response('Bridge required', { status: 403 });
      if (url.pathname === '/auth/login') {
        if ((await request.json()).password !== 'fixture-password') return Response.json({ error: 'Incorrect host password.' }, { status: 401 });
        homeExpires = Date.now() + 43200000;
        return Response.json({ token: 'fixture.token', expiresAt: homeExpires });
      }
      if (request.headers.get('x-projlib-home-session') !== 'fixture.token' || homeExpires <= Date.now()) return new Response('Expired', { status: 401 });
      if (url.pathname === '/auth/status') return Response.json({ expiresAt: homeExpires });
      if (url.pathname === '/socket') {
        const pair = new WebSocketPair();
        pair[1].accept();
        let opened = false;
        pair[1].addEventListener('message', event => {
          if (!opened) { opened = true; pair[1].send(JSON.stringify({ type: 'open', protocol: JSON.parse(event.data).protocols?.[0] || '' })); }
          else pair[1].send(event.data);
        });
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      const metadata = JSON.parse(decodeURIComponent(request.headers.get('x-projlib-request')));
      return Response.json({ egress: 'home', method: metadata.method, body: await request.text() }, { headers: {
        'x-projlib-response': encodeURIComponent(JSON.stringify({ status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' } }))
      } });
    }
    if (request.headers.get('upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      pair[1].accept();
      pair[1].addEventListener('message', event => pair[1].send(event.data));
      return new Response(null, { status: 101, webSocket: pair[0], headers: { 'sec-websocket-protocol': request.headers.get('sec-websocket-protocol') || '' } });
    }
    if (url.pathname === '/api') return Response.json({ message: 'Dynamic fetch worked', cookie: request.headers.get('cookie') || '', auth: request.headers.get('authorization'), userAgent: request.headers.get('user-agent'), ...(request.method === 'POST' ? { body: await request.text() } : {}) });
    if (url.pathname === '/login' && request.method === 'POST') {
      return new Response(null, { status: 303, headers: { location: '/account', 'set-cookie': 'session=fixture; HttpOnly; Secure; Path=/' } });
    }
    if (url.pathname === '/logout') return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': 'session=; Max-Age=0; Path=/; Secure' } });
    if (url.pathname === '/style.css') return new Response('body{font:18px Arial}#styled{color:rgb(12,34,56)}', { headers: { 'content-type': 'text/css', 'set-cookie': 'style=loaded; Secure; Path=/' } });
    if (url.pathname === '/module.js') return new Response('export const message="Module loaded";', { headers: { 'content-type': 'text/javascript' } });
    if (url.pathname === '/nested/main.js') return new Response('import("./part.js").then(data=>document.querySelector("#dynamic").textContent=data.message);', { headers: { 'content-type': 'text/javascript' } });
    if (url.pathname === '/nested/part.js') return new Response('export const message="Relative dynamic import loaded";', { headers: { 'content-type': 'text/javascript' } });
    if (url.pathname === '/redirect') return new Response(null, { status: 302, headers: { location: 'https://other.test/account' } });
    const signedIn = request.headers.get('cookie')?.includes('session=fixture');
    const heading = signedIn ? 'Private fixture account' : 'Fixture sign in';
    return new Response(`<!doctype html><html><head><title>${heading}</title><link rel="stylesheet" href="/style.css"></head>
      <body><h1>${heading}</h1><p id="styled">Local rendering</p><p id="api"></p><p id="module"></p><p id="dynamic"></p><p id="socket"></p><p id="cookie"></p>
      <p id="storage"></p><p id="identity"></p><button id="local">Local click</button><p id="clicked">Waiting</p>
      <form method="post" action="/login"><label>User<input name="user"></label><label>Password<input type="password" name="password"></label><button>Sign in</button></form>
      <a href="/logout">Sign out</a><a href="/redirect">Other site</a><a href="/account">Account</a>
      <script type="module">import {message} from '/module.js';document.querySelector('#module').textContent=message;</script>
      <script type="module" src="/nested/main.js"></script>
      <script>
        document.querySelector('#identity').textContent=navigator.userAgent;
        document.querySelector('#local').onclick=()=>document.querySelector('#clicked').textContent='Clicked locally';
        document.querySelector('#cookie').textContent=document.cookie;
        document.querySelector('#storage').textContent=localStorage.getItem('fixture')||'empty';
        localStorage.setItem('fixture','saved in this browser');
        fetch('/api').then(r=>r.json()).then(data=>document.querySelector('#api').textContent=data.message);
        const socket=new WebSocket('wss://fixture.test/socket',['echo']);
        socket.onopen=()=>socket.send('WebSocket echo worked');
        socket.onmessage=e=>{document.querySelector('#socket').textContent=e.data;socket.close()};
      </script></body></html>`, { headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY' } });
  }
};
