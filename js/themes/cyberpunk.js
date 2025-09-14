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
    // Scanline effect
    if (Math.random() > 0.6) {
      const scan = document.createElement('div');
      scan.className = 'cyber-scanline';
      scan.style.position = 'fixed';
      scan.style.left = 0;
      scan.style.width = '100vw';
      scan.style.height = '3px';
      scan.style.background = 'linear-gradient(90deg,#00fff7 0%,#0ff4 50%,#00fff7 100%)';
      scan.style.opacity = '0.18';
      scan.style.zIndex = 10001;
      scan.style.pointerEvents = 'none';
      scan.style.top = Math.floor(Math.random()*window.innerHeight) + 'px';
      document.body.appendChild(scan);
      setTimeout(()=>scan.remove(), 220+Math.random()*200);
    }
  }, 900);

  window.__themeCleanup = function(){
    if (id) clearInterval(id);
    ov.remove();
  };
})();
