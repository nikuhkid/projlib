# Brave inside Chrome: isolated experiment

The target is the actual 64-bit Brave browser, including its native Shields and Brave Sync UI, executing on the visitor's computer inside a WebAssembly Linux guest. Wolfie supplies the network relay. This is separate from Scramjet rewriting and from the older browser running on Wolfie and streaming frames.

This directory is not part of the published Pages build or the installed host. The initial candidate tests whether the pinned official Brave binary can execute inside a 64-bit QEMU WebAssembly guest with Chromium's sandbox enabled. A successful converter build alone does not establish that Brave boots, renders, syncs or performs acceptably.

Pinned inputs:

- container2wasm v0.8.5, source `087c313479d51cdf255e4f28ded6ae7d8141297b`.
- Its pinned QEMU Wasm revision `8604ed49a3cde392890b014a8d5a959c8a2fe72a`.
- Official Brave amd64 DEB 1.100.58, SHA-256 `2d9d1e664efd60343c77324c836be402cbe57ce12549975584dfa7d073f156a5`.

The guest runs as an unprivileged browser user. The startup command does not disable Chromium's sandbox. No personal profile or Sync chain is included in the guest image. The local graphical display is intended to stay inside the guest and visitor's Chrome; it must not be relayed through Wolfie as a substitute for local execution.

The compiled candidate is approximately 1.08 GB of guest data plus 41 MB of WebAssembly. It is not checked into Git or added to the Pages artifact. The probe server binds only loopback and supplies the cross-origin isolation headers needed by the threaded runtime.

Local verification found two signed-pointer defects in the generated 3 GiB runtime: libffi heap indices sign-extended addresses above 2 GiB, and QEMU's JIT used signed DataView offsets. `patch-runtime.mjs` accepts only the reviewed original loader hash, preserves the upstream file and records the resulting hash and corrections. Tests cover high-bit pointer values without allocating a multi-gigabyte fixture. With this patch Linux boots. The baseline CPU configuration stalled before `brave-browser --version` returned; `qemu64,+rdrand` successfully executed the official binary and reported Brave Browser 158.1.100.58. This does not yet establish successful rendering or Sync.

The native Windows networking helper passed ARP, DNS and a real TCP/HTTP request to a public IP-reporting endpoint directly from Wolfie. Node-side tests cover password verification, a fixed twelve-hour deadline, logout disconnection, packet fragmentation and public-web-only egress. The host network stack is a separate per-session process and has no configured host-loopback NAT. Guest TCP is restricted to public destinations on ports 80 and 443; only virtual-gateway DNS and DHCP are allowed over UDP.

`desktop/start.sh` and the Linux helper can be injected through the guest's existing 9p mount. The display bridge carries RFB over the local emulated serial console; `GuestDisplayChannel` creates no network socket. RFB screen and keyboard payloads must never enter evidence logs. Profile persistence and actual Sync pairing remain unimplemented/unverified; do not enter a personal Sync chain into this prototype.

The final design must provide authenticated relay access with the existing twelve-hour verification requirement, public-destination restrictions, local persistent profile storage, and a direct connection to Wolfie with no Cloudflare fallback. Direct access to the No-IP endpoint previously failed on the work network; changing the browser engine cannot establish reachability to a blocked relay address.

Upstream sources: [container2wasm](https://github.com/container2wasm/container2wasm/tree/v0.8.5), [QEMU Wasm](https://github.com/ktock/qemu-wasm), [official Brave builds](https://github.com/brave/brave-browser/releases/tag/v1.100.58). Dependencies retain their licences. A distributable candidate must include the matching notices and corresponding source where required before public publication.
