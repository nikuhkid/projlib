// kuromi.js - spawn kuromi sprites randomly inside console-container
(function(){


  const INTERVAL_MS = 1800; // more frequent
  let id = null;

  // Helper to get a random position near the main UI (console-container)
  function getRandomPosition() {
    const container = document.querySelector('.console-container');
    const r = container.getBoundingClientRect();
    // Pop near the edge of the main UI, but not over the iframe
    const margin = 40;
    const side = Math.random() > 0.5 ? 'left' : 'right';
    let x, y;
    if (side === 'left') {
      x = r.left + Math.random() * (r.width * 0.25);
    } else {
      x = r.right - 100 - Math.random() * (r.width * 0.25);
    }
    y = r.top + margin + Math.random() * (r.height - 2 * margin - 100);
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
    img.style.zIndex = 0; // always below UI
    img.style.pointerEvents = 'none';
    img.style.opacity = '1';
    // Random rotation
    const rot = (Math.random() * 90 - 45).toFixed(1);
    img.style.transform = `rotate(${rot}deg)`;
    document.body.appendChild(img);
    setTimeout(() => { img.classList.add('fade-out'); setTimeout(()=> img.remove(), 900); }, 1800);
  }

  id = setInterval(spawn, INTERVAL_MS);
  spawn();

  window.__themeCleanup = function(){
    if (id) clearInterval(id);
    id = null;
    document.querySelectorAll('.kuromi-sprite').forEach(n=>n.remove());
  };
})();
