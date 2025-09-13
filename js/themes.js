// THEMES MODULE
// Handles all theme switching and special effects

let activeTheme = "dark";
let kuromiInterval = null;

// Utility: random position inside viewport
function randomPosition(size = 100) {
  const x = Math.floor(Math.random() * (window.innerWidth - size));
  const y = Math.floor(Math.random() * (window.innerHeight - size));
  return { x, y };
}

// Apply theme
function applyTheme(theme) {
  // Clear old theme
  document.body.className = "";
  document.body.classList.add(`theme-${theme}`);
  activeTheme = theme;

  // Kill old effects
  clearKuromi();
  clearComicEffects();

  // Activate theme-specific behavior
  switch (theme) {
    case "kuromi":
      spawnKuromis();
      break;
    case "comic":
      enableComicClicks();
      break;
    default:
      break; // Dark, matrix, minimal, etc. just use CSS
  }
}

// ---------- KUROMI THEME ----------
function spawnKuromis() {
  kuromiInterval = setInterval(() => {
    const { x, y } = randomPosition(100);
    const img = document.createElement("img");
    img.src = "assets/kuromi.png";
    img.className = "kuromi-sprite";
    img.style.left = `${x}px`;
    img.style.top = `${y}px`;

    document.body.appendChild(img);

    // fade out + remove
    setTimeout(() => {
      img.classList.add("fade-out");
      setTimeout(() => img.remove(), 1000);
    }, 2000);
  }, 4000); // one every 4s
}

function clearKuromi() {
  if (kuromiInterval) {
    clearInterval(kuromiInterval);
    kuromiInterval = null;
  }
  document.querySelectorAll(".kuromi-sprite").forEach(el => el.remove());
}

// ---------- COMIC THEME ----------
function enableComicClicks() {
  document.addEventListener("click", comicEffectHandler);
}

function comicEffectHandler(e) {
  const effects = ["pow.png", "zap.png", "splash.png"];
  const img = document.createElement("img");
  img.src = "assets/" + effects[Math.floor(Math.random() * effects.length)];
  img.className = "comic-sprite";
  img.style.left = `${e.pageX - 50}px`;
  img.style.top = `${e.pageY - 50}px`;

  document.body.appendChild(img);

  setTimeout(() => {
    img.classList.add("fade-out");
    setTimeout(() => img.remove(), 500);
  }, 600);
}

function clearComicEffects() {
  document.removeEventListener("click", comicEffectHandler);
  document.querySelectorAll(".comic-sprite").forEach(el => el.remove());
}

// Expose
window.applyTheme = applyTheme;
