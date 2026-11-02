import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameWindow } from '../server/frame-window.mjs';
import { InputQueue } from '../server/input-queue.mjs';
import { encodeHostFrame, decodeHostFrame } from '../worker/frame-protocol.js';

test('a slow viewer keeps only two in-flight frames and the newest pending image; acknowledgements cannot free another frame', () => {
  const sent = [];
  const stream = new FrameWindow((frame,id) => { sent.push({ frame,id }); return true; });
  for (let i=0;i<100;i++) stream.push(i);
  assert.deepEqual(sent.map(item=>item.frame), [0,1]);
  stream.acknowledge(99); assert.equal(sent.length,2);
  stream.acknowledge(1); assert.deepEqual(sent.map(item=>item.frame), [0,1,99]);
  assert.equal(stream.inflight.size,2);
  stream.close(); assert.equal(stream.inflight.size,0); assert.equal(stream.pending,null);
});

test('older clients retain a one-frame window and can acknowledge without a sequence', () => {
  const sent = [];
  const stream = new FrameWindow(frame => { sent.push(frame); return true; }, { limit:1 });
  stream.push('first'); stream.push('obsolete'); stream.push('latest');
  assert.deepEqual(sent,['first']); stream.acknowledge(); assert.deepEqual(sent,['first','latest']);
  stream.close();
});

test('a missing acknowledgement recovers with the latest image and stops retrying when closed', async () => {
  const sent = [];
  const stream = new FrameWindow(frame => { sent.push(frame); return true; }, { limit:1, timeoutMs:20 });
  stream.push('first'); stream.push('latest');
  await new Promise(resolve=>setTimeout(resolve,70));
  assert.deepEqual(sent,['first','latest']); stream.close();
});

test('input backlog combines wheel/move events and preserves click/key ordering', async () => {
  let release;
  const gate = new Promise(resolve=>{release=resolve;});
  const seen = [], errors = [];
  const queue = new InputQueue(async command => { seen.push(command); if(command.type==='start')await gate; }, error=>errors.push(error));
  queue.push({type:'start'});
  for(let i=0;i<100;i++)queue.push({type:'wheel',x:0,y:1});
  for(let i=0;i<200;i++)queue.push({type:'pointer',phase:'move',x:i,y:20});
  queue.push({type:'pointer',phase:'down',x:199,y:20});
  queue.push({type:'key',key:'Enter'});
  queue.push({type:'wheel',x:0,y:5});queue.push({type:'wheel',x:0,y:6});
  release();
  for(let i=0;i<100 && queue.running;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(queue.running,false); assert.deepEqual(errors,[]);
  assert.deepEqual(seen,[{type:'start'},{type:'wheel',x:0,y:100},{type:'pointer',phase:'move',x:199,y:20},
    {type:'pointer',phase:'down',x:199,y:20},{type:'key',key:'Enter'},{type:'wheel',x:0,y:11}]);
  queue.close();
});

test('binary images carry a validated destination and strip routing identity before reaching the viewer', () => {
  const id = '11111111-1111-1111-1111-111111111111', jpeg = new Uint8Array([255,216,255,217]);
  const encoded = encodeHostFrame(id,123,1280,800,jpeg);
  const decoded = decodeHostFrame(encoded.buffer);
  assert.equal(decoded.clientId,id);
  assert.equal(decoded.data.byteLength,12);
  const view = new DataView(decoded.data);
  assert.equal(view.getUint32(0),123); assert.equal(view.getUint16(4),1280); assert.equal(view.getUint16(6),800);
  assert.deepEqual(new Uint8Array(decoded.data).subarray(8),jpeg);
  encoded[0]=0; assert.throws(()=>decodeHostFrame(encoded.buffer));
  assert.throws(()=>decodeHostFrame(new ArrayBuffer(5)));
  assert.throws(()=>encodeHostFrame('../other',1,1280,800,jpeg));
});
