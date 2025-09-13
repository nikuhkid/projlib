// kuromi.js - spawn kuromi sprites randomly inside console-container
(function(){
  const INTERVAL_MS = 4200;
  const container = document.querySelector('.console-container') || document.body;
  let id = null;

  function spawn() {
    const r = container.getBoundingClientRect();
    const img = document.createElement('img');
    img.src = 'assets/kuromi.png';
    img.className = 'kuromi-sprite';
    img.style.left = Math.max(8, Math.floor(Math.random() * (r.width - 100))) + 'px';
    img.style.top = Math.max(8, Math.floor(Math.random() * (r.height - 100))) + 'px';
    img.style.opacity = '1';
    container.appendChild(img);
    setTimeout(() => { img.classList.add('fade-out'); setTimeout(()=> img.remove(), 700); }, 2200);
  }

  id = setInterval(spawn, INTERVAL_MS);
  // initial
  spawn();

  window.__themeCleanup = function(){
    if (id) clearInterval(id);
    id = null;
    document.querySelectorAll('.kuromi-sprite').forEach(n=>n.remove());
  };
})();
