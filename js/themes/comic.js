// comic.js - click produces comic assets (pow, zap, splash)
(function(){
  const assets = ['assets/pow.png','assets/zap.png','assets/splash.png'];
  function onClick(e){
    const img = document.createElement('img');
    img.src = assets[Math.floor(Math.random()*assets.length)];
    img.className = 'comic-sprite';
    img.style.position = 'fixed';
    img.style.left = (e.clientX - 50) + 'px';
    img.style.top = (e.clientY - 50) + 'px';
    img.style.width = '100px';
    img.style.height = '100px';
  img.style.zIndex = 2147483647;
    img.style.pointerEvents = 'none';
    document.body.appendChild(img);
    setTimeout(()=> { img.classList.add('fade-out'); setTimeout(()=> img.remove(), 400); }, 650);
  }
  document.addEventListener('click', onClick);

  window.__themeCleanup = function(){
    document.removeEventListener('click', onClick);
    document.querySelectorAll('.comic-sprite').forEach(n=>n.remove());
  };
})();
