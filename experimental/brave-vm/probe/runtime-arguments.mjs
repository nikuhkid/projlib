// Applies only to the pinned x86_64 QEMU Wasm candidate recorded in README.md.
export function runtimeArguments(original, query = new URLSearchParams()) {
  const args = [...original];
  const kernel = args.indexOf('-append') + 1;
  if (!kernel || typeof args[kernel] !== 'string') throw new Error('The guest kernel arguments are missing.');
  const cpu = query.get('cpu');
  if (query.has('tbMiB')) {
    const size = Number(query.get('tbMiB'));
    if (![64, 128, 256, 500].includes(size)) throw new Error('Use a reviewed translation-cache size.');
    const accelerator = args.indexOf('-accel') + 1;
    if (!accelerator || !/^tcg,tb-size=500,thread=multi$/.test(args[accelerator])) throw new Error('The guest translator configuration differs.');
    args[accelerator] = `tcg,tb-size=${size},thread=multi`;
  }
  if (cpu === 'max') args.push('-cpu', 'max');
  else if (cpu !== 'baseline') args.push('-cpu', 'qemu64,+rdrand');
  if (query.get('single') === '1') {
    const cores = args.indexOf('-smp') + 1;
    if (!cores) throw new Error('The guest CPU configuration is missing.');
    args[cores] = '1';
  }
  if (query.get('clock') !== 'baseline') {
    // This Wasm QEMU uses get_clock() nanoseconds as its host counter: 1 GHz.
    // Prefix these options: the packer's trailing "--" starts init's arguments.
    args[kernel] = 'clocksource=tsc tsc=reliable tsc_early_khz=1000000 ' + args[kernel];
  }
  if (query.get('io') === 'bounded') {
    let shares = 0;
    for (let index = 0; index < args.length; index++) {
      if (args[index] !== '-virtfs') continue;
      const parts = args[index+1]?.split(',') || [];
      const id = parts.find(value => value.startsWith('id='))?.slice(3);
      const tag = parts.find(value => value.startsWith('mount_tag='))?.slice(10);
      if (!id || !tag || parts[0] !== 'local') throw new Error('The guest shared filesystem layout differs.');
      args.splice(index, 2, '-fsdev', parts.filter(value => !value.startsWith('mount_tag=')).join(','),
        '-device', `virtio-9p-pci,fsdev=${id},mount_tag=${tag},ioeventfd=off`);
      shares++; index += 3;
    }
    if (!shares) throw new Error('The guest shared filesystem device is missing.');
  }
  return args;
}
