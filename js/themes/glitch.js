// glitch.js - add subtle flicker to container
(function(){
  const el = document.querySelector('.console-container') || document.body;
  let interval = null;
  let glitchEls = [];

  function flicker(){
    el.style.filter = Math.random() > 0.5 ? 'hue-rotate(10deg) contrast(1.2) blur(.5px)' : 'none';
    // Randomly create glitch bars
    if (Math.random() > 0.7) {
      const bar = document.createElement('div');
      bar.className = 'glitch-bar';
      bar.style.position = 'fixed';
      bar.style.left = 0;
      bar.style.width = '100vw';
      bar.style.height = Math.floor(Math.random()*8+2) + 'px';
      bar.style.top = Math.floor(Math.random()*window.innerHeight) + 'px';
      bar.style.background = 'linear-gradient(90deg,#222,#444 60%,#111)';
      bar.style.opacity = Math.random()*0.3+0.15;
      bar.style.zIndex = 9998;
      bar.style.pointerEvents = 'none';
      document.body.appendChild(bar);
      glitchEls.push(bar);
      setTimeout(()=>{ bar.remove(); }, 180+Math.random()*200);
    }
    // Randomly shift the title for a frame
    const title = document.querySelector('.title');
    if (title) {
      if (Math.random() > 0.7) {
        title.style.transform = `translate(${Math.floor(Math.random()*8-4)}px,${Math.floor(Math.random()*4-2)}px)`;
        title.style.textShadow = '2px 0 #0ff, -2px 0 #f0f';
      } else {
        title.style.transform = '';
        title.style.textShadow = '';
      }
    }
  }
  interval = setInterval(flicker, 120);

  window.__themeCleanup = function(){
    if (interval) clearInterval(interval);
    el.style.filter = '';
    glitchEls.forEach(b=>b.remove());
    glitchEls = [];
    const title = document.querySelector('.title');
    if (title) {
      title.style.transform = '';
      title.style.textShadow = '';
    }
  };
})();
