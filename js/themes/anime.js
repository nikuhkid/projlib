// anime.js - cute mouse particle trail
(function(){
  const container = document.body;

  const trail = [];
  const MAX_TRAIL = 7;
  function onMove(e){
    const p = document.createElement('div');
    p.className = 'theme-effect anime-particle';
    p.style.position = 'fixed';
    p.style.left = (e.clientX - 8) + 'px';
    p.style.top = (e.clientY - 8) + 'px';
    // Placeholder for image: use a soft pastel circle for now
    p.style.background = 'radial-gradient(circle,#e6b7e6,#b6aaff)';
    p.style.width = '16px';
    p.style.height = '16px';
    p.style.borderRadius = '50%';
    p.style.opacity = '0.85';
    p.style.zIndex = 9999;
    p.style.pointerEvents = 'none';
    document.body.appendChild(p);
    trail.push(p);
    if (trail.length > MAX_TRAIL) {
      const old = trail.shift();
      if (old) old.remove();
    }
    setTimeout(()=> { p.style.opacity = '0'; setTimeout(()=> p.remove(), 350); }, 500);
  }
  document.addEventListener('mousemove', onMove);

  window.__themeCleanup = function(){
    document.removeEventListener('mousemove', onMove);
    document.querySelectorAll('.anime-particle').forEach(n=>n.remove());
  };
})();
