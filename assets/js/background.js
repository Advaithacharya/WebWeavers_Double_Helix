// Animated connecting-dots background
(function () {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  const dpi = window.devicePixelRatio || 1;
  canvas.width = width * dpi;
  canvas.height = height * dpi;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.scale(dpi, dpi);

  const POINTS = Math.min(120, Math.floor((width * height) / 14000));
  const MAX_LINK_DIST = Math.min(220, Math.max(120, Math.hypot(width, height) / 10));
  const points = [];

  function random(min, max) { return Math.random() * (max - min) + min; }

  function createPoints() {
    points.length = 0;
    for (let i = 0; i < POINTS; i++) {
      points.push({
        x: random(0, width),
        y: random(0, height),
        vx: random(-0.4, 0.4),
        vy: random(-0.4, 0.4)
      });
    }
  }

  function step() {
    ctx.clearRect(0, 0, width, height);

    // update
    for (const p of points) {
      p.x += p.vx; p.y += p.vy;
      if (p.x <= 0 || p.x >= width) p.vx *= -1;
      if (p.y <= 0 || p.y >= height) p.vy *= -1;
    }

    // draw links
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i], b = points[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < MAX_LINK_DIST) {
          const alpha = 0.25 * (1 - d / MAX_LINK_DIST);
          ctx.strokeStyle = `rgba(0, 98, 155, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // draw points
    for (const p of points) {
      ctx.fillStyle = 'rgba(0, 98, 155, 0.7)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(step);
  }

  function resize() {
    width = window.innerWidth; height = window.innerHeight;
    const dpi = window.devicePixelRatio || 1;
    canvas.width = width * dpi; canvas.height = height * dpi;
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpi, dpi);
    createPoints();
  }

  window.addEventListener('resize', resize);
  createPoints();
  step();
})();



