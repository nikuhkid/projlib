import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import WebSocket, { WebSocketServer } from 'ws';
import http from 'node:http';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { BrowserEngine } from '../../server/browser-engine.mjs';
import { RelayHost } from '../../server/relay-host.mjs';
import { createNetworkGuard } from '../../server/network-guard.mjs';

// Deterministic same-page comparison: 46 ms link RTT, 4 Mbit/s per direction.
// Baseline commit must exist in the local Git clone. No production sessions used.
const run = promisify(execFile), baseline = '8b50889';
const temporary = resolve('.local/performance-baseline');
await mkdir(temporary,{recursive:true});
for (const name of ['browser-engine.mjs','relay-host.mjs']) {
  const {stdout} = await run('git',['show',`${baseline}:server/${name}`]);
  await writeFile(resolve(temporary,name),stdout.replace("'./network-guard.mjs'","'../../server/network-guard.mjs'"));
}
const OldEngine = (await import(pathToFileURL(resolve(temporary,'browser-engine.mjs')))).BrowserEngine;
const OldHost = (await import(pathToFileURL(resolve(temporary,'relay-host.mjs')))).RelayHost;
const fixture = http.createServer((request,response)=>{
  response.setHeader('content-type','text/html');
  response.end('<html><head><title>Stream benchmark</title><style>body{font:17px Arial;max-width:1100px;padding:15px}p{line-height:1.5}h2{background:linear-gradient(60deg,#8dd,#e9a);padding:15px}</style></head><body>'+Array.from({length:150},(_,i)=>`<h2>Section ${i+1}</h2><p>Sample text for a repeatable scrolling comparison. Browser input and page images travel through the same bounded relay. This paragraph contains enough ordinary text to measure the bandwidth used while reading a page. The content and viewport are identical for both versions.</p>`).join('')+'</body></html>');
});
fixture.listen(0,'127.0.0.1');await once(fixture,'listening');
try {
  for(const [label,Engine,Host] of [['local-before',OldEngine,OldHost],['local-after',BrowserEngine,RelayHost]]) {
    const key='local-performance-test-key-1234567890123456789';
    const runtime=new Miniflare(convertV4MiniflareOptions({
      modules:['index.js','browser-relay.js','frame-protocol.js'].map(name=>({type:'ESModule',path:resolve('worker',name)})),
      compatibilityDate:'2026-11-02',port:0,
      durableObjects:{BROWSER_RELAY:{className:'BrowserRelay',useSQLite:true}},
      bindings:{FRONTEND_ORIGIN:'https://nikuhkid.github.io',BROWSER_HOST_KEY:key}
    }));
    const origin=(await runtime.ready).origin.replace('http:','ws:');
    const engine=new Engine({guardFactory:()=>createNetworkGuard({
      resolveHost:async hostname=>{if(hostname!=='fixture.test')throw new Error('Fixture only');return {address:'127.0.0.1',family:4};},
      makeRequest:(options,callback)=>http.request({...options,port:fixture.address().port},callback)
    })});
    let host;
    await new Promise(resolve=>{host=new Host({url:origin+'/browser/host',key,engine,onStatus:message=>{if(message==='Browser relay connected.')resolve();}}).start();});
    const proxy=new WebSocketServer({host:'127.0.0.1',port:0}), timers=new Set();
    proxy.on('connection',client=>{
      const upstream=new WebSocket(origin+'/browser/connect',{origin:'https://nikuhkid.github.io'});
      const ready=new Promise((resolve,reject)=>{upstream.once('open',resolve);upstream.once('error',reject);});
      function forward(destination) {
        let tail=0;
        return async(data,binary)=>{
          try {await ready;}catch{return;}
          const now=performance.now();tail=Math.max(now+23,tail)+data.length/500000*1000;
          const timer=setTimeout(()=>{
            timers.delete(timer);if(destination.readyState===WebSocket.OPEN)destination.send(data,{binary});
          },Math.max(0,tail-now));timers.add(timer);
        };
      }
      client.on('message',forward(upstream));upstream.on('message',forward(client));
      client.on('error',()=>{});upstream.on('error',()=>{});
      client.on('close',()=>upstream.terminate());upstream.on('close',()=>client.close());
    });
    await once(proxy,'listening');
    try {
      const result=await run(process.execPath,['scripts/benchmark-session.mjs',label],{
        cwd:process.cwd(),env:{...process.env,PROJLIB_BENCHMARK_RELAY:`ws://127.0.0.1:${proxy.address().port}`,PROJLIB_BENCHMARK_SITE:'http://fixture.test/'},timeout:90000,maxBuffer:1000000
      });
      console.log(result.stdout.trim());
    } finally {
      for(const timer of timers)clearTimeout(timer);
      for(const client of proxy.clients)client.terminate();
      await new Promise(resolve=>proxy.close(resolve));
      await host.close();await runtime.dispose();
    }
  }
} finally {await new Promise(resolve=>fixture.close(resolve));}
