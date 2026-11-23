import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeArguments } from '../probe/runtime-arguments.mjs';

test('the emulator counter settings reach the kernel rather than being passed after the init separator', () => {
  const original = ['-smp', '2,sockets=2', '-append', 'console=ttyS0 init=/sbin/tini -- /sbin/init'];
  const args = runtimeArguments(original);
  const command = args[args.indexOf('-append') + 1];
  const kernel = command.split(' -- ')[0];
  const init = command.split(' -- ')[1];
  assert(kernel.includes('tsc_early_khz=1000000'));
  assert(kernel.includes('clocksource=tsc'));
  assert.equal(init, '/sbin/init');
  assert.deepEqual(args.slice(-2), ['-cpu', 'qemu64,+rdrand']);
  assert.equal(original[3], 'console=ttyS0 init=/sbin/tini -- /sbin/init');
});

test('the recorded baseline remains available for isolated regression comparisons', () => {
  const original = ['-smp', '2', '-append', 'console=ttyS0 -- /sbin/init'];
  assert.deepEqual(runtimeArguments(original, new URLSearchParams('cpu=baseline&clock=baseline')), original);
});

test('bounded polling moves each 9p share off the main loop while preserving mount identities', () => {
  const original = ['-append', 'console=ttyS0', '-virtfs', 'local,path=/,mount_tag=wasi0,security_model=passthrough,id=wasi0',
    '-virtfs', 'local,path=/pack,mount_tag=wasi1,security_model=passthrough,id=wasi1'];
  const result = runtimeArguments(original, new URLSearchParams('cpu=baseline&clock=baseline&io=bounded'));
  assert.deepEqual(result, ['-append', 'console=ttyS0',
    '-fsdev', 'local,path=/,security_model=passthrough,id=wasi0', '-device', 'virtio-9p-pci,fsdev=wasi0,mount_tag=wasi0,ioeventfd=off',
    '-fsdev', 'local,path=/pack,security_model=passthrough,id=wasi1', '-device', 'virtio-9p-pci,fsdev=wasi1,mount_tag=wasi1,ioeventfd=off']);
});
