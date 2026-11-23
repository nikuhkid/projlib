# Brave inside Chrome: isolated experiment

The target is the actual 64-bit Brave browser, including its native Shields and Brave Sync UI, executing on the visitor's computer inside a WebAssembly Linux guest. Wolfie supplies the network relay. This is separate from Scramjet rewriting and from the older browser running on Wolfie and streaming frames.

This directory is not part of the published Pages build or the installed host. The candidate runs the pinned official Brave binary inside a 64-bit QEMU WebAssembly guest with Chromium's sandbox enabled. The user explicitly accepted continuing the prototype after observing roughly eight minutes of cold startup. Brave and Brave Sync remain requirements.

Pinned inputs:

- container2wasm v0.8.5, source `087c313479d51cdf255e4f28ded6ae7d8141297b`.
- Its pinned QEMU Wasm revision `8604ed49a3cde392890b014a8d5a959c8a2fe72a`.
- Official Brave amd64 DEB 1.100.58, SHA-256 `2d9d1e664efd60343c77324c836be402cbe57ce12549975584dfa7d073f156a5`.

The guest runs as an unprivileged browser user. The startup command does not disable Chromium's sandbox. No personal profile or Sync chain is included in the guest image. The local graphical display is intended to stay inside the guest and visitor's Chrome; it must not be relayed through Wolfie as a substitute for local execution.

The compiled candidate is approximately 1.08 GB of guest data plus 41 MB of WebAssembly. It is not checked into Git or added to the Pages artifact. The probe server binds only loopback and supplies the cross-origin isolation headers needed by the threaded runtime.

Local verification found two signed-pointer defects in the generated 3 GiB runtime: libffi heap indices sign-extended addresses above 2 GiB, and QEMU's JIT used signed DataView offsets. `patch-runtime.mjs` accepts only the reviewed original loader hash, preserves the upstream file and records the resulting hash and corrections. Tests cover high-bit pointer values without allocating a multi-gigabyte fixture. With this patch Linux boots. The baseline CPU configuration stalled before `brave-browser --version` returned; `qemu64,+rdrand` successfully executed the official binary and reported Brave Browser 158.1.100.58.

The default probe now supplies the Wasm counter's 1 GHz frequency before the kernel's `--` separator. Linux confirms switching to `tsc`; without this correction, calibration failed and the guest used `refined-jiffies`. The graphical server uses `-noshm` because the pinned tiny kernel does not implement SysV shared memory. Startup tracing also found expensive Type 1 font parsing; the probe uses the image's Liberation families. The native Brave toolbar has been visually verified inside the visitor's Chromium tab. Successful web-page rendering and Sync pairing are still separate, unfinished checks; the controlled headless DOM probe has not completed within its ten-minute bound.

The native Windows networking helper passed ARP, DNS and a real TCP/HTTP request to a public IP-reporting endpoint directly from Wolfie. Node-side tests cover password verification, a fixed twelve-hour deadline, logout disconnection, packet fragmentation and public-web-only egress. The host network stack is a separate per-session process and has no configured host-loopback NAT. Guest TCP is restricted to public destinations on ports 80 and 443; only virtual-gateway DNS and DHCP are allowed over UDP.

An actual Wasm guest also completed DHCP, DNS and a certificate-verified HTTPS request to `api.ipify.org` through the authenticated native relay in approximately thirty seconds. That test used a disposable lab password, temporary loopback listeners, and no Cloudflare. The response address was not retained in the evidence. This validates the guest's transport separately from Brave rendering.

`desktop/start.sh` and the Linux helper are injected through the guest's existing 9p mount. The display bridge carries RFB over the local emulated serial console; `GuestDisplayChannel` creates no network socket. RFB screen and keyboard payloads must never enter evidence logs. The display client is bundled from pinned original noVNC 1.6.0 source; its source archive, MPL notice and bundled dependency notices are retained next to the generated client.

Local profile snapshots are implemented behind `profile=1`. The guest helper pauses the guest's Brave processes, exports regular profile files and recovery journals, and resumes those processes even if export fails. Caches, symlinks and sockets are omitted. The frontend compresses the archive with the browser's native compression stream and atomically stores the current and previous checkpoints in IndexedDB. Profile archives never go to Wolfie. Restore rejects traversal, links, special files, oversized archives and duplicate files before replacing a previous profile. The prototype limits an uncompressed snapshot to 256 MiB.

The full storage fixture passed export, complete Chromium shutdown, a fresh Chromium process using the same dedicated test profile, and restore into a new Wasm guest in approximately forty-three seconds. Binary cookie fixtures, recovery-journal fixtures and font-cache fixtures survived. An actual blank Brave profile was also checkpointed, the outer Chromium process was completely stopped, and the archive was imported by a fresh guest under a fresh Chromium process at the same dedicated test origin. The Go helper's Linux tests cover unsafe archives, previous-profile preservation and pausing/resuming only a selected fixture process. Actual account-cookie survival and Sync pairing remain unverified. Do not enter a personal Sync chain until those checks and the intended host installation are ready.

The local input bridge now uses acknowledged records of at most 256 raw bytes to avoid overrunning the emulated terminal. A synthetic 12,800-byte fixture passed through the actual browser, emulated serial console, Linux TTY and Go display bridge byte-for-byte in approximately forty seconds. This fixture uses no Brave account or real keyboard input.

The browser-facing relay socket can now reconnect after host verification without recreating the guest. A complete runtime test passed initial certificate-verified HTTPS, advanced only the isolated relay's injected clock beyond twelve hours, confirmed that the old grant disconnected its native helper and could not reconnect, then verified again and completed a second HTTPS request in the same guest. The test took approximately forty seconds. Existing TCP connections can fail during a relay restart; applications may need to retry. The server does not extend an existing grant automatically.

The isolated probe includes host verification controls. They clear the password after submission, retain no password in web storage, disable guest startup until verified, and reconnect a running guest only after verification. Browser checks cover rejection, login, logout and re-verification. These controls are not installed in the live ProjLib Host.

`Save and close Brave` asks the guest's browser main process to exit normally, waits for its writers to stop, and then checkpoints its profile. It does not kill unrelated guest processes or host applications. A Linux fixture verifies that the selected process flushes data and an unrelated process remains alive. A separate close capability prevents offering this control with older helpers. This avoids treating forced termination of an entire guest as a normal browser exit; that produced Brave's unclean-exit prompt during the restore check.

The translator comparison was built separately with a warmup threshold of 100 instead of 1500 and a generated-module limit of 60000 instead of 15000. All thirteen artifact checksums passed and its unpatched JavaScript loader was byte-identical to the reviewed baseline. The controlled headless DOM probe still did not complete within ten minutes; this does not establish a performance improvement.

`--bounded-io` is an additional opt-in investigation of the [upstream terminal polling report](https://github.com/ktock/qemu-wasm/issues/28). The loader forwards the actual poll deadline, capped at ten milliseconds, and corrects another signed heap pointer in the terminal's atomic wait. The guest uses explicit 9p devices with `ioeventfd=off`. This setting leaves the baseline polling workaround available for comparison. It requires its own guest runtime checks before becoming a default.

From the repository root, with the compiled candidate and matching Linux helper prepared:

```powershell
node experimental/brave-vm/build-viewer.mjs
node experimental/brave-vm/run-profile-roundtrip.mjs .local/full-browser/engine-candidate
node experimental/brave-vm/run-probe.mjs .local/full-browser/engine-candidate --input-probe --duration-seconds 150
node experimental/brave-vm/run-reconnect-probe.mjs .local/full-browser/engine-candidate .local/full-browser/input-fixture-candidate/ProjLibBraveRelay.exe
node experimental/brave-vm/run-auth-probe.mjs .local/full-browser/engine-candidate .local/full-browser/input-fixture-candidate/ProjLibBraveRelay.exe
node experimental/brave-vm/run-probe.mjs .local/full-browser/engine-candidate --desktop --persistent-profile --browser-profile .local/full-browser/brave-browser-sync-fixture --probe-port 9476 --linger --duration-seconds 1200 --network-helper .local/full-browser/input-fixture-candidate/ProjLibBraveRelay.exe
```

The interactive probe accepts `snapshot`, `screenshot`, `navigate-sync`, `navigate-example`, `save-profile`, `close-profile`, and `stop` on stdin. Use `close-profile` and wait for success before `stop` when testing normal profile restoration. Start it in a terminal with stdin open. Reuse both the dedicated browser-profile directory and the probe port to test profile restoration across complete outer-browser restarts. Runtime evidence belongs in the ignored `.local/full-browser/evidence` directory. `--trace` and `--debug-processes` are disposable-profile diagnostics; never enable them with a personal profile. The optional Debian strace diagnostic is not installed on Wolfie.

The final design must provide authenticated relay access with the existing twelve-hour verification requirement, public-destination restrictions, local persistent profile storage, and a direct connection to Wolfie with no Cloudflare fallback. Direct access to the No-IP endpoint previously failed on the work network; changing the browser engine cannot establish reachability to a blocked relay address.

Upstream sources: [container2wasm](https://github.com/container2wasm/container2wasm/tree/v0.8.5), [QEMU Wasm](https://github.com/ktock/qemu-wasm), [official Brave builds](https://github.com/brave/brave-browser/releases/tag/v1.100.58). Dependencies retain their licences. A distributable candidate must include the matching notices and corresponding source where required before public publication.
