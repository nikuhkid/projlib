// matrix.js - spawn falling chars inside console
(function(){
  const container = document.querySelector('.console-container') || document.body;
  let interval = null;

  function spawnChar(){
    const r = container.getBoundingClientRect();
    const c = document.createElement('div');
    c.className = 'theme-effect matrix-char';
    c.style.position = 'absolute';
    c.style.left = Math.floor(Math.random()*(r.width-18)) + 'px';
    c.style.top = '-20px';
    c.style.fontFamily = 'monospace';
    c.style.color = '#0f0';
    c.style.fontSize = '14px';
    c.textContent = String.fromCharCode(33 + Math.floor(Math.random()*90));
    container.appendChild(c);
    let top = -20;
    const move = setInterval(()=> {
      top += 6;
      c.style.top = top + 'px';
      if (top > r.height + 20) { clearInterval(move); c.remove(); }
    }, 60);
  }

  interval = setInterval(spawnChar, 120);

  window.__themeCleanup = function(){
    if (interval) clearInterval(interval);
    document.querySelectorAll('.matrix-char').forEach(n=>n.remove());
  };
})();
