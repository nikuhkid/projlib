// =======================
// ui.js  – DOM & themes
// =======================
(function () {
  const { utils, data } = window.ProjLib;
  const ProjLib = (window.ProjLib = window.ProjLib || {});
  const UI = {};

  // --- DOM elements ---
  let root, cardsArea;

  UI.init = function () {
    root = document.getElementById("projlib-root") || document.body;
    cardsArea = document.getElementById("cards") || utils.el("div", { id: "cards" });
    if (!cardsArea.parentNode) root.appendChild(cardsArea);
  };

  // --- themes ---
  const active = { css: null, js: null, cleanup: null };

  UI.applyTheme = function (theme) {
    if (active.cleanup) {
      try { active.cleanup(); } catch (_) {}
    }
    if (active.css) active.css.remove();
    if (active.js) active.js.remove();

    const cssLink = utils.el("link", { rel: "stylesheet", href: theme.css });
    document.head.appendChild(cssLink);

    const jsScript = utils.el("script", { src: theme.js });
    document.head.appendChild(jsScript);

    active.css = cssLink;
    active.js = jsScript;
    utils.log("Theme applied:", theme.name);
  };

  // --- content ---
  UI.renderHub = function () {
    if (!data.hub) return utils.log("No hub data");
    utils.clear(cardsArea);
    data.hub.entries.forEach((e) => {
      const card = utils.el("div", { className: "card" },
        utils.el("h3", {}, e.title),
        utils.el("p", {}, e.description || "")
      );
      cardsArea.appendChild(card);
    });
  };

  ProjLib.UI = UI;
})();
