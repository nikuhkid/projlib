// matrix.js - spawn falling chars inside console
(function(){

  const container = document.querySelector('.console-container');
  let interval = null;

  // Katakana Unicode range: 0x30A0 - 0x30FF (skip 0x30A0, 0x30FB, 0x30FC for more readable chars)
  const katakana = [];
  for (let i = 0x30A1; i <= 0x30FA; ++i) katakana.push(String.fromCharCode(i));

  function spawnChar(){
    // Align rain to the iframe area
    const iframe = document.getElementById('proxyFrame');
    const r = iframe ? iframe.getBoundingClientRect() : container.getBoundingClientRect();
    const c = document.createElement('div');
    c.className = 'theme-effect matrix-char';
    c.style.position = 'absolute';
    // Use the width of the iframe and offset from its left
    const minX = r.left;
    const maxX = r.left + r.width - 18;
    c.style.left = Math.floor(minX + Math.random() * (maxX - minX)) + 'px';
    c.style.top = '-20px';
    c.style.fontFamily = 'monospace';
    c.style.color = '#6fffa7';
    c.style.fontSize = '22px';
    c.textContent = katakana[Math.floor(Math.random()*katakana.length)];
    c.style.pointerEvents = 'none';
    c.style.zIndex = 1;
    document.body.appendChild(c);
    let top = -20;
    const move = setInterval(()=> {
      top += 6;
      c.style.top = top + 'px';
      if (top > window.innerHeight + 20) { clearInterval(move); c.remove(); }
    }, 60);
  }

  interval = setInterval(spawnChar, 100);

  window.__themeCleanup = function(){
    if (interval) clearInterval(interval);
    document.querySelectorAll('.matrix-char').forEach(n=>n.remove());
  };
})();
