// kuromi.js - spawn kuromi sprites randomly inside console-container
(function(){


  const INTERVAL_MS = 1800; // more frequent
  let id = null;

  // Helper to get a random position within the iframe area
  function getRandomPosition() {
    const iframe = document.getElementById('proxyFrame');
    const r = iframe ? iframe.getBoundingClientRect() : document.body.getBoundingClientRect();
    // Pop anywhere within the iframe area, with a margin
    const margin = 10;
    const x = r.left + margin + Math.random() * (r.width - 100 - 2 * margin);
    const y = r.top + margin + Math.random() * (r.height - 100 - 2 * margin);
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
  img.style.zIndex = -1; // always below everything
    img.style.pointerEvents = 'none';
    img.style.opacity = '1';
  // Random rotation between -45 and 45 degrees
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
