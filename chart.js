// Canvas charts (devicePixelRatio-aware). Line: #00d35a + gradient fill + dashed start line + stacked mark labels.
// Candles: 1-minute OHLC + dashed horizontal lines. No library.
(function () {
  "use strict";
  const GREEN = "#00d35a", RED = "#ff453a";
  const RANGE_S = { LIVE: null, "1H": 3600, "4H": 14400, "1D": 86400, "1W": 604800, ALL: Infinity };
  const FONT = '600 11px "SF Pro Text",-apple-system,BlinkMacSystemFont,system-ui,sans-serif';

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return { g, w, h };
  }
  function visible(points, range, now, liveFrom) {
    let from = -Infinity;
    if (range === "LIVE") from = liveFrom && liveFrom < now ? liveFrom : now - 3600;
    else if (RANGE_S[range] !== Infinity && RANGE_S[range] != null) from = now - RANGE_S[range];
    return (points || []).filter(p => p[1] != null && p[0] >= from);
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // Place label boxes above their points; a box that would overlap one already placed moves up a row
  // (then below the line if it runs out of room). Labels never overlap.
  function placeLabels(g, items, w, h, top) {
    const placed = [], out = [], H = 20, gap = 3;
    g.font = FONT;
    items.forEach(m => {
      const tw = g.measureText(m.label).width + 14;
      let x = Math.max(2, Math.min(w - tw - 2, m.x - tw / 2));
      const hit = (y) => placed.some(b => x < b.x + b.w + gap && x + tw + gap > b.x && y < b.y + b.h + gap && y + H + gap > b.y);
      let y = m.y - 12 - H, tries = 0;
      while ((hit(y) || y < top) && tries < 8) { y -= H + gap; tries++; if (y < top) break; }
      if (y < top || hit(y)) { y = m.y + 12; tries = 0; while (hit(y) && tries < 8) { y += H + gap; tries++; } }
      y = Math.min(y, h - H - 2);
      const b = { x, y, w: tw, h: H }; placed.push(b); out.push({ ...m, box: b });
    });
    return out;
  }

  // progress 0..1 slides the newest point in (250ms tween run by the caller)
  function line(canvas, points, opt) {
    opt = opt || {};
    const c = setup(canvas); if (!c) return false;
    const { g, w, h } = c, now = opt.now || Date.now() / 1000;
    let pts = visible(points, opt.range || "ALL", now, opt.liveFrom);
    if (pts.length === 1) pts = [[pts[0][0] - 60, pts[0][1]], pts[0]];
    if (pts.length < 2) return false;
    const prog = opt.progress == null ? 1 : opt.progress;
    if (prog < 1 && pts.length > 2) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      pts = pts.slice(0, -1).concat([[a[0] + (b[0] - a[0]) * prog, a[1] + (b[1] - a[1]) * prog]]);
    }
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    let lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
    if (hi === lo) { hi += Math.abs(hi) * 0.01 || 1; lo -= Math.abs(lo) * 0.01 || 1; }
    const padT = 34, padB = 10, padX = 16;
    const X = t => padX + (w - 2 * padX) * (t1 === t0 ? 1 : (t - t0) / (t1 - t0));
    const Y = v => padT + (h - padT - padB) * (1 - (v - lo) / (hi - lo));
    // gradient fill (the chart, not a card)
    const grd = g.createLinearGradient(0, padT, 0, h);
    grd.addColorStop(0, "rgba(0,211,90,0.28)"); grd.addColorStop(1, "rgba(0,211,90,0)");
    g.beginPath(); g.moveTo(X(pts[0][0]), h); pts.forEach(p => g.lineTo(X(p[0]), Y(p[1])));
    g.lineTo(X(pts[pts.length - 1][0]), h); g.closePath(); g.fillStyle = grd; g.fill();
    // dashed start line at the first visible value
    const sy = Y(pts[0][1]);
    g.setLineDash([2, 4]); g.strokeStyle = "rgba(235,235,245,0.3)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, sy); g.lineTo(w, sy); g.stroke(); g.setLineDash([]);
    // line
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
    g.strokeStyle = GREEN; g.lineWidth = 2; g.lineJoin = "round"; g.lineCap = "round"; g.stroke();
    // marks
    const valAt = t => { let v = pts[0][1]; for (const p of pts) { if (p[0] <= t) v = p[1]; else break; } return v; };
    const ms = (opt.marks || []).filter(m => m.t >= t0 && m.t <= t1).map(m => ({ ...m, x: X(m.t), y: Y(valAt(m.t)) }));
    placeLabels(g, ms, w, h, 2).forEach(m => {
      g.beginPath(); g.arc(m.x, m.y, 4.5, 0, Math.PI * 2); g.fillStyle = m.color; g.fill();
      g.strokeStyle = "#000"; g.lineWidth = 1.5; g.stroke();
      const b = m.box; roundRect(g, b.x, b.y, b.w, b.h, 6); g.fillStyle = m.color; g.fill();
      g.fillStyle = m.color === GREEN ? "#000" : "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(m.label, b.x + b.w / 2, b.y + b.h / 2 + 0.5);
    });
    const lp = pts[pts.length - 1];
    g.beginPath(); g.arc(X(lp[0]), Y(lp[1]), 4, 0, Math.PI * 2); g.fillStyle = GREEN; g.fill();
    return true;
  }

  function candles(canvas, cs, opt) {
    opt = opt || {};
    const c = setup(canvas); if (!c) return false;
    const { g, w, h } = c;
    cs = (cs || []).slice(-(opt.max || 60));
    if (!cs.length) return false;
    const lines = (opt.lines || []).filter(l => l.y != null);
    let lo = Math.min(...cs.map(k => k[3])), hi = Math.max(...cs.map(k => k[2]));
    lines.forEach(l => { lo = Math.min(lo, l.y); hi = Math.max(hi, l.y); });
    if (hi === lo) { hi *= 1.01; lo *= 0.99; }
    const padT = 12, padB = 12, padL = 8, padR = 8;
    const step = (w - padL - padR) / Math.max(cs.length, 20), bw = Math.max(2, step * 0.62);
    const Y = v => padT + (h - padT - padB) * (1 - (v - lo) / (hi - lo));
    lines.forEach(l => {
      const y = Y(l.y); g.setLineDash(l.dash || [5, 4]); g.strokeStyle = l.color; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.setLineDash([]);
      if (l.label) { g.font = FONT; g.fillStyle = l.color; g.textAlign = "right"; g.textBaseline = "bottom"; g.fillText(l.label, w - 6, y - 3); }
    });
    const x0 = w - padR - cs.length * step;
    cs.forEach((k, i) => {
      const [, o, hh, ll, cl] = k, up = cl >= o, x = x0 + i * step + step / 2;
      g.strokeStyle = g.fillStyle = up ? GREEN : RED; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, Y(hh)); g.lineTo(x, Y(ll)); g.stroke();
      const y1 = Y(Math.max(o, cl)), y2 = Y(Math.min(o, cl));
      g.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1));
    });
    return true;
  }
  window.MiniChart = { line, candles, RANGE_S, visible };
})();
