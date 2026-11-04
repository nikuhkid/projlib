// Seven distinct Dragon Balls follow the pointer outside the protected website window.
(function () {
  const starPositions = [
    [[50, 51]],
    [[39, 39], [61, 62]],
    [[50, 32], [32, 62], [68, 62]],
    [[34, 34], [66, 34], [34, 66], [66, 66]],
    [[32, 32], [68, 32], [50, 50], [32, 68], [68, 68]],
    [[34, 29], [66, 29], [25, 51], [75, 51], [34, 72], [66, 72]],
    [[50, 25], [28, 38], [72, 38], [50, 51], [28, 65], [72, 65], [50, 78]]
  ];
  const layer = window.ProjLib.UI.effectLayer();
  const balls = starPositions.map((positions, index) => {
    const ball = document.createElement('div');
    ball.className = 'theme-effect dragon-ball';
    ball.dataset.stars = String(index + 1);
    const stars = positions.map(([x, y]) => `<polygon points="0,-10 3,-3 10,-3 5,1 6,8 0,5 -6,8 -5,1 -10,-3 -3,-3" transform="translate(${x} ${y}) scale(.72)"/>`).join('');
    ball.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="dragon-ball-${index}" cx=".3" cy=".23" r=".8"><stop offset="0" stop-color="#fff1a5"/><stop offset=".4" stop-color="#ffb32c"/><stop offset=".8" stop-color="#ed790b"/><stop offset="1" stop-color="#9f3a04"/></radialGradient></defs><circle cx="50" cy="50" r="47" fill="url(#dragon-ball-${index})" stroke="#ffcc5a" stroke-width="2"/><g fill="#b92317">${stars}</g><ellipse cx="31" cy="24" rx="15" ry="8" fill="#fff" opacity=".45" transform="rotate(-30 31 24)"/></svg>`;
    layer.appendChild(ball);
    return { element: ball, x: 0, y: 0 };
  });
  let animation = 0;
  let lastMove = 0;
  let lastFrame = 0;
  let initialized = false;
  let target = { x: 0, y: 0 };

  function animate(now) {
    const blend = 1 - Math.exp(-Math.min(now - lastFrame, 50) / 48);
    lastFrame = now;
    const opacity = Math.max(0, Math.min(1, 1 - (now - lastMove - 500) / 450));
    let lead = target;
    for (const ball of balls) {
      ball.x += (lead.x - ball.x) * blend;
      ball.y += (lead.y - ball.y) * blend;
      ball.element.style.transform = `translate3d(${ball.x}px, ${ball.y}px, 0)`;
      ball.element.style.opacity = String(opacity);
      lead = { x: ball.x - 13, y: ball.y + 9 };
    }
    animation = opacity > 0 ? requestAnimationFrame(animate) : 0;
  }
  function follow(event) {
    if (event.pointerType === 'touch') return;
    target = { x: event.clientX + 16, y: event.clientY + 16 };
    lastMove = performance.now();
    if (!initialized) {
      balls.forEach(ball => { ball.x = target.x; ball.y = target.y; });
      initialized = true;
    }
    if (!animation) { lastFrame = lastMove; animation = requestAnimationFrame(animate); }
  }
  document.addEventListener('pointermove', follow);
  window.__themeCleanup = () => {
    document.removeEventListener('pointermove', follow);
    cancelAnimationFrame(animation);
    balls.forEach(ball => ball.element.remove());
  };
})();
