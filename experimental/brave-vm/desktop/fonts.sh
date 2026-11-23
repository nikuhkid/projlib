#!/bin/sh
# Startup traces showed fontconfig reparsing the large X11 Type 1 collection.
# Use the image's Liberation families for the initial desktop/rendering probe.
mkdir -p /tmp/projlib-fonts "$HOME/.cache/fontconfig"
for font in /usr/share/fonts/truetype/liberation*/*.ttf; do
    [ -f "$font" ] || continue
    cp "$font" /tmp/projlib-fonts/
done
cat >/tmp/projlib-fonts.conf <<'XML'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>/tmp/projlib-fonts</dir>
  <cachedir prefix="xdg">fontconfig</cachedir>
  <alias><family>sans-serif</family><prefer><family>Liberation Sans</family></prefer></alias>
  <alias><family>serif</family><prefer><family>Liberation Serif</family></prefer></alias>
  <alias><family>monospace</family><prefer><family>Liberation Mono</family></prefer></alias>
  <config><rescan><int>0</int></rescan></config>
</fontconfig>
XML
export FONTCONFIG_FILE=/tmp/projlib-fonts.conf
