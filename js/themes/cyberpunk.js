// cyberpunk.js - neon overlay + subtle flicker
(function(){
  const container = document.querySelector('.console-container') || document.body;
  const ov = document.createElement('div');
  ov.className = 'theme-effect cp-overlay';
  ov.style.position = 'absolute';
  ov.style.inset = '0';
  ov.style.pointerEvents = 'none';
  ov.style.zIndex = 1000;
  ov.style.opacity = '0';
  container.appendChild(ov);

  let id = setInterval(()=> {
    ov.style.opacity = '0.12';
    setTimeout(()=> ov.style.opacity = '0', 120);
  }, 900);

  window.__themeCleanup = function(){
    if (id) clearInterval(id);
    ov.remove();
  };
})();
