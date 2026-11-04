// CSS animates this background grid without timers or flashes over the website.
(function () {
  const grid = document.createElement('div');
  grid.className = 'theme-effect cyber-grid';
  window.ProjLib.UI.effectLayer().appendChild(grid);
  window.__themeCleanup = () => grid.remove();
})();
