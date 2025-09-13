// Handles core functionality

const proxyFrame = document.getElementById("proxyFrame");
const loadingOverlay = document.querySelector(".loadingOverlay");
const scannerBtn = document.getElementById("scannerBtn");
const scanner = document.querySelector(".scanner");
const themeBtn = document.getElementById("themeBtn");

const defaultHome = "https://archive.org";
let historyStack = [defaultHome];
let currentIndex = 0;

// Load initial home
loadUrl(defaultHome);

function loadUrl(url) {
  loadingOverlay.style.display = "flex";
  proxyFrame.src = url;
  proxyFrame.onload = () => {
    loadingOverlay.style.display = "none";
  };
  historyStack = historyStack.slice(0, currentIndex + 1);
  historyStack.push(url);
  currentIndex++;
}

// Scanner toggle
scannerBtn.addEventListener("click", () => {
  scanner.classList.toggle("hidden");
});

// Theme toggle
const themes = [
  "dark.css",
  "glitch.css",
  "matrix.css",
  "kuromi.css",
  "comic.css",
  "anime.css",
  "cyberpunk.css",
  "minimal.css"
];
let themeIndex = 0;
themeBtn.addEventListener("click", () => {
  themeIndex = (themeIndex + 1) % themes.length;
  document.getElementById("themeStylesheet").setAttribute("href", "css/themes/" + themes[themeIndex]);
});
