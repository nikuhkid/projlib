// anime.js - cute mouse particle trail
(function(){
  const container = document.body;

  const trail = [];
  const MAX_TRAIL = 7;
  function onMove(e){
    const p = document.createElement('div');
    p.className = 'theme-effect anime-particle';
    p.style.position = 'fixed';
    // Offset to bottom right of cursor
    p.style.left = (e.clientX + 12 + Math.random()*8) + 'px';
    p.style.top = (e.clientY + 12 + Math.random()*8) + 'px';
    // Placeholder for image: use a soft pastel circle for now
    p.style.background = 'radial-gradient(circle,#e6b7e6,#b6aaff)';
    p.style.width = '18px';
    p.style.height = '18px';
    p.style.borderRadius = '50%';
    p.style.opacity = '0.85';
    p.style.zIndex = 10010;
    p.style.pointerEvents = 'none';
    p.style.transition = 'all 0.7s cubic-bezier(.22,1.61,.36,1)';
    document.body.appendChild(p);
    trail.push(p);
    if (trail.length > MAX_TRAIL) {
      const old = trail.shift();
      if (old) old.remove();
    }
    // Animate expansion and fade
    setTimeout(()=> {
      p.style.transform = `scale(${1.7 + Math.random()*0.5})`;
      p.style.opacity = '0';
    }, 30);
    setTimeout(()=> p.remove(), 900);
  }
  document.addEventListener('mousemove', onMove);

  window.__themeCleanup = function(){
    document.removeEventListener('mousemove', onMove);
    document.querySelectorAll('.anime-particle').forEach(n=>n.remove());
  };
})();
