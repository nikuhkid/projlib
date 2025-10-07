// =======================
// core.js  – foundation
// =======================
(function () {
  const ProjLib = (window.ProjLib = window.ProjLib || {});

  // --- basic utilities ---
  const utils = {
    async fetchWithRetry(url, attempts = 3, delay = 1000) {
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) throw new Error(res.statusText);
          return await res.json();
        } catch (err) {
          if (i === attempts - 1) throw err;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    },
    el(tag, attrs = {}, ...children) {
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => {
        if (k in el) el[k] = v;
        else el.setAttribute(k, v);
      });
      for (const child of children) {
        if (typeof child === "string") el.appendChild(document.createTextNode(child));
        else if (child) el.appendChild(child);
      }
      return el;
    },
    clear(el) {
      while (el.firstChild) el.removeChild(el.firstChild);
    },
    log(...a) {
      console.log("[ProjLib]", ...a);
    }
  };

  // --- data layer ---
  const data = {
    hub: null,
    async loadHubData(path = "hubData.json") {
      ProjLib.utils.log("Loading hub data:", path);
      data.hub = await utils.fetchWithRetry(path);
      return data.hub;
    }
  };

  ProjLib.utils = utils;
  ProjLib.data = data;
})();
