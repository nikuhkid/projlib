# Stream performance

## Changes

- Transfer JPEG bytes directly instead of base64 inside JSON. Strip the host's routing identity at the relay.
- Negotiate stream version 2, with at most two unacknowledged images and one newest pending image per viewer. Ignore obsolete acknowledgements and decoded images. Older clients keep a one-image window and their previous full-resolution stream.
- Responsive: JPEG quality 42, maximum 1152 × 864 image, up to 20 delivered frames/s. Sharper: quality 65, maximum 1600 × 1200, up to 15 frames/s. These are ceilings, not promised rates.
- Map input coordinates to the original browser viewport even when the delivered image is smaller.
- Combine wheel events over 33 ms; flush them before subsequent clicks/keys/navigation. Under server backlog, combine consecutive wheel/move commands while keeping ordering barriers intact.
- Decode binary images with ImageBitmap where available and release decoded image resources after painting. Ignore late messages from replaced sockets.
- Preserve session isolation, internal host authentication, public-network-only egress, and bounded message/input sizes.

## Measurements on Wolfie

The original public stream delivered scrolling frames about 584 ms apart in the initial Wikipedia test, with a 1033 ms scrolling tail. An idle relay ping was about 46 ms. Ping measurements while streaming were much higher because responses shared the image channel.

The controlled local comparison uses the same generated page, browser viewport, and simulated 4 Mbit/s link for both versions. Configured link delay is 46 ms RTT; measured idle RTT on this Windows run was about 62 ms, including timer/runtime overhead.

| Metric | Previous stream | Responsive binary stream |
| --- | ---: | ---: |
| Median transmitted frame | 141,064 bytes | 72,256 bytes |
| Median scrolling frame interval | 372 ms | 144 ms |
| Frames delivered during the scroll/settle period | 7 | 13 |
| Scrolling tail after the input burst | 872 ms | 355 ms |

These measurements show approximately 49% fewer bytes per frame and a 2.6× improvement in frame cadence for that fixture/link. They do not promise the same gain on every website or connection. A "wheel to next frame" sample can include an image already in transit and must not be presented as input-to-paint latency.

## Reproduce

Requires Chromium installed by Playwright, and baseline commit `8b50889` present in the local Git clone:

```sh
node tests/performance/compare-stream.mjs
```

The comparison runs isolated local fixtures, writes a temporary baseline copy under ignored `.local/`, and saves results under ignored `test-results/`. Test dependency injection maps only its fixture hostname to loopback; production egress rules are unchanged.

For the public relay, using a separate anonymous Wikipedia session:

```sh
node scripts/benchmark-session.mjs current
```

No session capabilities, login credentials, or keyboard input are printed or stored in benchmark reports.
