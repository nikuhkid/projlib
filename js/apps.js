// =======================
// apps.js – orchestrator
// =======================
(function () {
  const ProjLib = window.ProjLib;
  const { data, UI, utils } = ProjLib;

  const DEFAULT_THEMES = [
    {
      name: "main",
      css: "css/themes/main.css",
      js: "js/themes/main.js"
    }
  ];

  async function init() {
    try {
      UI.init();
      const hub = await data.loadHubData();
      UI.renderHub();

      const themes = hub.themes || DEFAULT_THEMES;
      const firstTheme = themes[0];
      UI.applyTheme(firstTheme);

      utils.log("Initialization complete");
    } catch (err) {
      console.error("Init failed:", err);
    }
  }

  // Kickstart when DOM is ready
  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }

  ProjLib.App = { init };
})();
