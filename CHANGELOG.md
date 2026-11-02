# Changelog

## 2026-11-02

- Removed Wix identity helpers, email allowlists, authorization checks, and masked link views.
- Reconnected the original console: six category dropdowns, URL input, Proxy Mode, Home, Refresh, Fullscreen, and eight themes.
- Fixed the invalid pasted patch instruction in the main theme script, cross-origin refresh errors, theme cleanup leaks, and the inaccessible proxy checkbox.
- Added loading timeouts, useful error messages, an Open original link, safe URL handling, optional preferences, reduced-motion support, and mobile layout fixes.
- Replaced the defunct third-party proxy dependency with a self-hosted, stateless Cloudflare Worker.
- Added Pages deployment, a browser-asset-only build, Worker runtime tests, and browser integration tests.
- Replaced the duplicated draft README with documentation of the implemented behavior and its limits.
- Made the repository public with explicit approval and enabled GitHub Pages.
- Completed Cloudflare authorization on Wolfie, deployed `projlib-proxy`, and connected the Pages interface to its public Worker endpoint. Proxy Mode is enabled by default for new visitors; existing mode preferences are respected.
