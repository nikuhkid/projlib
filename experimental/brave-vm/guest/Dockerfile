FROM debian:bookworm-slim

ARG BRAVE_VERSION=1.100.58
ARG BRAVE_SHA256=2d9d1e664efd60343c77324c836be402cbe57ce12549975584dfa7d073f156a5
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl dbus-x11 fonts-liberation xauth xvfb x11vnc openbox \
    && curl --fail --location --retry 3 \
      "https://github.com/brave/brave-browser/releases/download/v${BRAVE_VERSION}/brave-browser_${BRAVE_VERSION}_amd64.deb" \
      --output /tmp/brave.deb \
    && echo "${BRAVE_SHA256}  /tmp/brave.deb" | sha256sum --check \
    && curl --fail --location --retry 3 \
      https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg \
      --output /usr/share/keyrings/brave-browser-archive-keyring.gpg \
    && echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/brave-browser-archive-keyring.gpg] https://brave-browser-apt-release.s3.brave.com/ stable main' \
      > /etc/apt/sources.list.d/brave-browser-release.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends /tmp/brave.deb \
    && rm /tmp/brave.deb \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 --shell /bin/sh browser \
    && mkdir -p /home/browser/profile && chown browser:browser /home/browser/profile
COPY --chmod=755 start.sh /usr/local/bin/projlib-brave-start
USER browser
ENV HOME=/home/browser DISPLAY=:1
ENTRYPOINT ["/usr/local/bin/projlib-brave-start"]
