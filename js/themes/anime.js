// anime.js - cute mouse particle trail
(function(){
  const container = document.body;
  function onMove(e){
    const p = document.createElement('div');
    p.className = 'theme-effect anime-particle';
    p.style.left = (e.pageX - 5) + 'px';
    p.style.top = (e.pageY - 5) + 'px';
    p.style.background = 'radial-gradient(circle,#ffd6f2,#ff9ad5)';
    p.style.width = '10px';
    p.style.height = '10px';
    p.style.borderRadius = '50%';
    p.style.opacity = '0.9';
    p.style.zIndex = 9999;
    document.body.appendChild(p);
    setTimeout(()=> { p.style.opacity = '0'; setTimeout(()=> p.remove(), 350); }, 500);
  }
  document.addEventListener('mousemove', onMove);

  window.__themeCleanup = function(){
    document.removeEventListener('mousemove', onMove);
    document.querySelectorAll('.anime-particle').forEach(n=>n.remove());
  };
})();
