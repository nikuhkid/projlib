/* ============================================================
   PROJECT: ProjLib Control Node [BETA]
   - This is the canonical apps.js.
   - Do NOT rename file or project title.
   ============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
  const proxyFrame = document.getElementById("proxyFrame");
  const currentUrl = document.getElementById("currentUrl");
  const proxyForm = document.getElementById("proxyForm");
  const urlInput = document.getElementById("urlInput");
  const proxyToggle = document.getElementById("proxyToggle");
  const scannerBtn = document.getElementById("scannerBtn");
  const themeBtn = document.getElementById("themeBtn");
  const homeBtn = document.getElementById("homeBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const initialMessage = document.getElementById("initialMessage");
  const loadingOverlay = document.getElementById("loadingOverlay");

  let config = null;

  // Load JSON config using ProjLib.loadHubData
  try {
    config = await window.ProjLib.loadHubData("hubData.json");
    populateDropdowns(config.categories);
    loadHome(config.defaultHome);
  } catch (err) {
    console.error("Error loading hubData.json", err);
  }

  // Dropdown population
  function populateDropdowns(categories) {
    categories.forEach(cat => {
      const select = document.getElementById(cat.id);
      if (select) {
        const placeholder = document.createElement("option");
        placeholder.textContent = `-- ${window.ProjLib.sanitizeText(cat.label)} --`;
        placeholder.disabled = true;
        placeholder.selected = true;
        select.appendChild(placeholder);

        cat.links.forEach(link => {
          const option = document.createElement("option");
          option.value = link.url;
          option.textContent = window.ProjLib.sanitizeText(link.name);
          select.appendChild(option);
        });

        select.addEventListener("change", e => {
          loadUrl(e.target.value);
        });
      }
    });
  }

  // Load home
  function loadHome(url) {
    loadUrl(url);
  }

  // Load URL into iframe
  function loadUrl(url) {
    if (!url) return;
    // Validate URL using ProjLib.isValidUrl
    let validUrl = url;
    if (!window.ProjLib.isValidUrl(url)) {
      validUrl = 'https://swisscows.com/web?query=' + encodeURIComponent(url);
    }
    initialMessage.style.display = "none";
    loadingOverlay.style.display = "flex";

    setTimeout(() => {
      proxyFrame.src = validUrl;
      currentUrl.value = validUrl;
      loadingOverlay.style.display = "none";
    }, 1000);
  }

  // Proxy form submit
  proxyForm.addEventListener("submit", e => {
    e.preventDefault();
    loadUrl(urlInput.value);
  });

  // Scanner button toggle
  scannerBtn.addEventListener("click", () => {
    proxyForm.classList.toggle("hidden");
  });

  // Modular theme system
  const themes = [
    { name: "dark", css: "css/themes/dark.css", js: "js/themes/dark.js" },
    { name: "kuromi", css: "css/themes/kuromi.css", js: "js/themes/kuromi.js" },
    { name: "comic", css: "css/themes/comic.css", js: "js/themes/comic.js" },
    { name: "matrix", css: "css/themes/matrix.css", js: "js/themes/matrix.js" },
    { name: "glitch", css: "css/themes/glitch.css", js: "js/themes/glitch.js" },
    { name: "anime", css: "css/themes/anime.css", js: "js/themes/anime.js" },
    { name: "cyberpunk", css: "css/themes/cyberpunk.css", js: "js/themes/cyberpunk.js" },
    { name: "minimal", css: "css/themes/minimal.css", js: "js/themes/minimal.js" }
  ];
  let currentThemeIndex = 0;
  let currentThemeScript = null;

  function setTheme(idx) {
    // Remove old theme class
    themes.forEach(t => document.body.classList.remove('theme-' + t.name));
    // Add new theme class
    const theme = themes[idx];
    document.body.classList.add('theme-' + theme.name);
    // Swap CSS
    let link = document.getElementById('themeStylesheet');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.id = 'themeStylesheet';
      document.head.appendChild(link);
    }
    link.href = theme.css;
    // Cleanup previous theme JS
    if (window.__themeCleanup && typeof window.__themeCleanup === 'function') {
      try { window.__themeCleanup(); } catch (e) { console.warn('theme cleanup failed', e); }
      window.__themeCleanup = null;
    }
    // Remove previous theme script
    if (currentThemeScript) {
      currentThemeScript.remove();
      currentThemeScript = null;
    }
    // Load new theme JS
    fetch(theme.js, { method: 'HEAD' }).then(res => {
      if (res.ok) {
        const s = document.createElement('script');
        s.src = theme.js;
        s.defer = true;
        document.body.appendChild(s);
        currentThemeScript = s;
      }
    });
    // Update button label
    themeBtn.textContent = 'Theme: ' + theme.name.charAt(0).toUpperCase() + theme.name.slice(1);
    // Persist
    localStorage.setItem('projlib_theme', theme.name);
  }

  // Theme button click
  themeBtn.addEventListener("click", () => {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    setTheme(currentThemeIndex);
  });

  // On load, set initial theme from localStorage or default
  const saved = localStorage.getItem('projlib_theme');
  const initialIdx = saved ? themes.findIndex(t => t.name === saved) : 0;
  currentThemeIndex = initialIdx >= 0 ? initialIdx : 0;
  setTheme(currentThemeIndex);

  // Action buttons
  homeBtn.addEventListener("click", () => loadHome(config.defaultHome));
  refreshBtn.addEventListener("click", () => proxyFrame.contentWindow.location.reload());
  fullscreenBtn.addEventListener("click", () => {
    if (proxyFrame.requestFullscreen) proxyFrame.requestFullscreen();
  });
});
