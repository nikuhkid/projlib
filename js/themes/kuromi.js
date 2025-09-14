// kuromi.js - spawn kuromi sprites randomly inside console-container
(function(){

  const INTERVAL_MS = 4200;
  let id = null;

  // Helper to get a random position not overlapping the iframe
  function getRandomPosition() {
    const bodyRect = document.body.getBoundingClientRect();
    const iframe = document.getElementById('proxyFrame');
    const iframeRect = iframe ? iframe.getBoundingClientRect() : {left:0,top:0,right:0,bottom:0};
    let x, y, tries = 0;
    do {
      x = Math.floor(Math.random() * (window.innerWidth - 100));
      y = Math.floor(Math.random() * (window.innerHeight - 100));
      tries++;
      // Avoid overlap with iframe (allow a 20px margin)
    } while (
      iframe &&
      x + 100 > iframeRect.left - 20 &&
      x < iframeRect.right + 20 &&
      y + 100 > iframeRect.top - 20 &&
      y < iframeRect.bottom + 20 &&
      tries < 10
    );
    return {x, y};
  }

  function spawn() {
    const {x, y} = getRandomPosition();
    const img = document.createElement('img');
    img.src = 'assets/kuromi.png';
    img.className = 'kuromi-sprite';
    img.style.position = 'fixed';
    img.style.left = x + 'px';
    img.style.top = y + 'px';
    img.style.width = '100px';
    img.style.height = '100px';
    img.style.zIndex = 9999;
    img.style.pointerEvents = 'none';
    img.style.opacity = '1';
    document.body.appendChild(img);
    setTimeout(() => { img.classList.add('fade-out'); setTimeout(()=> img.remove(), 700); }, 2200);
  }

  id = setInterval(spawn, INTERVAL_MS);
  spawn();

  window.__themeCleanup = function(){
    if (id) clearInterval(id);
    id = null;
    document.querySelectorAll('.kuromi-sprite').forEach(n=>n.remove());
  };
})();
