// matrix.js - spawn falling chars inside console
(function(){
  const container = document.querySelector('.console-container') || document.body;
  let interval = null;

  // Katakana Unicode range: 0x30A0 - 0x30FF
  const katakana = [];
  for (let i = 0x30A0; i <= 0x30FF; ++i) katakana.push(String.fromCharCode(i));

  function spawnChar(){
    const r = container.getBoundingClientRect();
    const c = document.createElement('div');
    c.className = 'theme-effect matrix-char';
    c.style.position = 'absolute';
    // Center horizontally: spawn only in the center 60% of the container
    const minX = r.width * 0.2;
    const maxX = r.width * 0.8 - 18;
    c.style.left = Math.floor(minX + Math.random() * (maxX - minX)) + 'px';
    c.style.top = '-20px';
    c.style.fontFamily = 'monospace';
    c.style.color = '#0f0';
    c.style.fontSize = '18px';
    c.textContent = katakana[Math.floor(Math.random()*katakana.length)];
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
