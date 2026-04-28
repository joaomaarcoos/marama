/* MARA Orb — vanilla JS port of mara-orb.tsx
   Usage: drawMARAOrb(canvasEl, { size: 167, startDelay: 0, isStatic: false }) */
(function (global) {
  function drawMARAOrb(canvas, opts) {
    opts = opts || {};
    var size = opts.size || 167;
    var startDelay = opts.startDelay || 0;
    var isStatic = !!opts.isStatic;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var DPR = window.devicePixelRatio || 1;
    canvas.width = size * DPR;
    canvas.height = size * DPR;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(DPR, DPR);

    var cx = size / 2, cy = size / 2;
    var scale = (size * 0.46) / 132;
    var R = 132 * scale;
    var spacing = 18 * scale;
    var msx = 105 * scale;
    var msy = 100 * scale;
    var minMDot = size * 0.022;
    var minBgDot = size * 0.007;

    var seed = 11;
    function rnd() {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 0xFFFFFFFF;
    }
    function distToSeg(px, py, ax, ay, bx, by) {
      var abx = bx - ax, aby = by - ay;
      var ab2 = abx * abx + aby * aby;
      var t2 = ab2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / ab2));
      return Math.hypot(px - (ax + t2 * abx), py - (ay + t2 * aby));
    }
    function pointInM(x, y) {
      var nx = (x - cx) / msx;
      var ny = (y - cy) / msy;
      var left = nx > -0.82 && nx < -0.56 && ny > -0.72 && ny < 0.55;
      var right = nx > 0.56 && nx < 0.82 && ny > -0.72 && ny < 0.55;
      return left || right
        || distToSeg(nx, ny, -0.56, -0.62, 0, 0.05) < 0.11
        || distToSeg(nx, ny, 0.56, -0.62, 0, 0.05) < 0.11;
    }

    var dots = [];
    var steps = Math.ceil(R / spacing) + 2;
    for (var row = -steps; row <= steps; row++) {
      for (var col = -steps; col <= steps; col++) {
        var stagger = (Math.abs(row) % 2) * (spacing * 0.5);
        var x = cx + col * spacing + stagger;
        var y = cy + row * spacing;
        var rr = Math.hypot(x - cx, y - cy);
        if (rr > R) continue;
        var edgeFactor = 1 - rr / R;
        var isM = pointInM(x, y);
        var rawR = isM
          ? (5.8 + 1.5 * Math.max(0, edgeFactor)) * scale
          : (1.2 + 2.1 * Math.pow(Math.max(0, edgeFactor), 1.6)) * scale;
        var baseR = isM ? Math.max(minMDot, rawR) : Math.max(minBgDot, rawR);
        var ang = Math.atan2(y - cy, x - cx);
        var startR = R + (65 + rnd() * 26 + 10) * scale;
        dots.push({
          x: x, y: y,
          sx: cx + Math.cos(ang) * startR,
          sy: cy + Math.sin(ang) * startR,
          baseR: baseR,
          brightness: isM ? 1.0 : 0.78,
          isM: isM,
          phase: rnd() * Math.PI * 2,
          delay: rnd() * 0.24 + (isM ? 0.04 : 0.0)
        });
      }
    }
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    if (isStatic) {
      ctx.clearRect(0, 0, size, size);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        ctx.globalAlpha = d.brightness;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.baseR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return function () {};
    }

    var INTRO = 4000;
    var t0 = null;
    var raf;
    function frame(now) {
      if (t0 === null) t0 = now;
      var elapsed = now - t0 - startDelay;
      ctx.clearRect(0, 0, size, size);
      if (elapsed < 0) { raf = requestAnimationFrame(frame); return; }
      var t = Math.min(1, elapsed / INTRO);
      var haloAlpha = (10 + 8 * Math.sin(now * 0.002)) / 255;
      ctx.globalAlpha = haloAlpha;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.5, 0.8 * scale);
      ctx.beginPath();
      ctx.arc(cx, cy, R + 2 * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (var j = 0; j < dots.length; j++) {
        var dd = dots[j];
        var lt = Math.max(0, Math.min(1, (t - dd.delay) / 0.42));
        var e = easeOut(lt);
        var xx = dd.sx + (dd.x - dd.sx) * e;
        var yy = dd.sy + (dd.y - dd.sy) * e;
        var pulse = lt >= 1
          ? 1 + (dd.isM ? 0.10 : 0.06) * Math.sin(now * 0.00346 + dd.phase)
          : 0.55 + 0.45 * e;
        var r = dd.baseR * pulse;
        var alpha = dd.brightness * Math.min(1, 0.18 + 1.25 * e);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(xx, yy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return function () { cancelAnimationFrame(raf); };
  }
  global.drawMARAOrb = drawMARAOrb;
})(window);
