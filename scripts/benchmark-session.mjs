import WebSocket from 'ws';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';

// Uses its own anonymous session. Never logs session capabilities or page input.
const label = process.argv[2] || 'current';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Use a simple benchmark label.');
const url = process.env.PROJLIB_BENCHMARK_SITE || 'https://en.wikipedia.org/wiki/Computer_network';
const socket = new WebSocket(process.env.PROJLIB_BENCHMARK_RELAY || 'wss://projlib-proxy.fabmigfarcos.workers.dev/browser/connect', { origin: 'https://nikuhkid.github.io' });
const frames = [], errors = [], waiters = new Set();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function send(message) { socket.send(typeof message === 'string' ? message : JSON.stringify(message)); }
function waitFor(matches, timeout = 45000) {
  return new Promise((resolve, reject) => {
    const listener = message => { if (matches(message)) { clearTimeout(timer); waiters.delete(listener); resolve(message); } };
    const timer = setTimeout(() => { waiters.delete(listener); reject(new Error('Benchmark response timeout.')); }, timeout);
    waiters.add(listener);
  });
}
function stats(values) {
  const sorted = [...values].sort((a,b) => a-b);
  const percentile = p => sorted.length ? Math.round(sorted[Math.min(sorted.length-1, Math.floor(sorted.length*p))]) : null;
  return { median: percentile(.5), p95: percentile(.95) };
}
socket.on('message', (data, isBinary) => {
  let message, bytes;
  if (isBinary) {
    message = { type: 'frame', frameId: data.readUInt32BE(0) }; bytes = data.length;
  } else {
    const raw = String(data); bytes = Buffer.byteLength(raw);
    try { message = JSON.parse(raw); } catch { message = { type: raw }; }
  }
  if (message.type === 'frame') {
    frames.push({ at: performance.now(), bytes });
    send({ type: 'frameAck', frameId: message.frameId });
  } else if (message.type === 'error' && message.message !== 'Unsupported browser command.') errors.push(message.message);
  for (const listener of [...waiters]) listener(message);
});
try {
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const session = waitFor(message => message.type === 'session' || message.type === 'error');
  send({ type: 'start', stream: 2, url, viewport: { width: 1280, height: 800 } });
  const ready = await session;
  if (ready.type === 'error') throw new Error(ready.message);
  await sleep(1500);
  const edgeRtt = [], hostRtt = [], feedback = [];
  for (let i=0;i<8;i++) {
    let started = performance.now(), response = waitFor(message => message.type === 'pong');
    send('ping'); await response; edgeRtt.push(performance.now()-started);
    started = performance.now(); response = waitFor(message => message.type === 'pong' || (message.type === 'error' && message.message === 'Unsupported browser command.'));
    send({ type: 'ping', id: i }); await response; hostRtt.push(performance.now()-started);
  }
  for (let i=0;i<8;i++) {
    await sleep(250);
    const started = performance.now(), response = waitFor(message => message.type === 'frame', 10000);
    send({ type: 'wheel', x: 0, y: i%2 ? -220 : 220 });
    await response; feedback.push(performance.now()-started);
  }
  await sleep(700); const burstStart = performance.now();
  for (let i=0;i<60;i++) { send({ type: 'wheel', x: 0, y: 55 }); await sleep(1000/60); }
  const burstEnd = performance.now(); await sleep(4500);
  const active = frames.filter(frame => frame.at >= burstStart);
  const intervals = active.slice(1).map((frame,i) => frame.at-active[i].at);
  const output = { label, edgeRoundTripMs: stats(edgeRtt), hostRoundTripMs: stats(hostRtt),
    // The next frame can already be in flight. This is not input-to-paint latency.
    wheelToNextFrameMs: stats(feedback), scrollFrameIntervalMs: stats(intervals),
    scrollFrames: active.length, medianFrameBytes: stats(active.map(frame=>frame.bytes)).median,
    scrollTailMs: Math.max(0,Math.round((active.at(-1)?.at || burstEnd)-burstEnd)), errors };
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/latency-${label}.json`, JSON.stringify(output,null,2));
  console.log(JSON.stringify(output,null,2));
  const ended = waitFor(message => message.type === 'ended', 5000);
  send({ type: 'end' }); await ended;
} finally { socket.close(); setTimeout(() => socket.terminate(),1000).unref(); }
