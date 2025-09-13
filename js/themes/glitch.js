// glitch.js - add subtle flicker to container
(function(){
  const el = document.querySelector('.console-container') || document.body;
  let interval = null;

  function flicker(){
    el.style.filter = Math.random() > 0.6 ? 'hue-rotate(30deg) blur(.2px)' : 'none';
  }
  interval = setInterval(flicker, 300);

  window.__themeCleanup = function(){
    if (interval) clearInterval(interval);
    el.style.filter = '';
  };
})();
