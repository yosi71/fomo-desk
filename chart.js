// Tiny canvas line chart: line + gradient + trade marks + optional horizontal lines. No library.
(function () {
  const MARK = { bought: "#00d35a", sold: "#0a84ff", stopped: "#ff453a" };
  const RANGE_S = { "1H": 3600, "6H": 21600, "24H": 86400, "ALL": Infinity };

  function draw(canvas, points, opt) {
    opt = opt || {};
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const now = opt.now || Date.now() / 1000;
    const span = RANGE_S[opt.range || "ALL"] || Infinity;
    let pts = (points || []).filter(p => p[1] != null && (span === Infinity || p[0] >= now - span));
    if (pts.length === 1) pts = [[pts[0][0] - 1, pts[0][1]], pts[0]];
    if (pts.length < 2) return false;
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1;
    const lines = (opt.lines || []).filter(l => l.y != null);
    let lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
    lines.forEach(l => { if (l.fit) { lo = Math.min(lo, l.y); hi = Math.max(hi, l.y); } });
    if (hi === lo) { hi += Math.abs(hi) * 0.01 || 1; lo -= Math.abs(lo) * 0.01 || 1; }
    const padT = 14, padB = 14, padX = 6;
    const X = t => padX + (w - 2 * padX) * (t1 === t0 ? 1 : (t - t0) / (t1 - t0));
    const Y = v => padT + (h - padT - padB) * (1 - (v - lo) / (hi - lo));
    const up = pts[pts.length - 1][1] >= pts[0][1];
    const col = opt.color || (up ? "#00d35a" : "#ff453a");
    // gradient fill
    const grd = g.createLinearGradient(0, padT, 0, h);
    grd.addColorStop(0, col + "44"); grd.addColorStop(1, col + "00");
    g.beginPath(); g.moveTo(X(pts[0][0]), h);
    pts.forEach(p => g.lineTo(X(p[0]), Y(p[1])));
    g.lineTo(X(pts[pts.length - 1][0]), h); g.closePath(); g.fillStyle = grd; g.fill();
    // line
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
    g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = "round"; g.stroke();
    // horizontal lines (entry / stop / tp)
    g.font = "600 10px -apple-system,system-ui,sans-serif";
    lines.forEach(l => {
      if (l.y < lo || l.y > hi) return;
      const y = Y(l.y); g.setLineDash([4, 4]); g.strokeStyle = l.color; g.lineWidth = 1;
      g.beginPath(); g.moveTo(padX, y); g.lineTo(w - padX, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = l.color; g.textAlign = "left"; g.fillText(l.label, padX + 2, y - 4);
    });
    // marks
    const valAt = t => { let best = pts[0]; for (const p of pts) { if (p[0] <= t) best = p; else break; } return best[1]; };
    (opt.marks || []).forEach(m => {
      if (m.t < t0 || m.t > t1) return;
      const x = X(m.t), y = Y(valAt(m.t));
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fillStyle = "#000"; g.fill();
      g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fillStyle = MARK[m.kind] || "#fff"; g.fill();
    });
    // last point dot
    const lp = pts[pts.length - 1];
    g.beginPath(); g.arc(X(lp[0]), Y(lp[1]), 4, 0, Math.PI * 2); g.fillStyle = col; g.fill();
    return true;
  }
  window.MiniChart = { draw, MARK, RANGE_S };
})();
