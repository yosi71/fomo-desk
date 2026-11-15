// FOMO Desk phone app. Plain JS. Reads the desk's published JSON (Plan B: GitHub Pages).
// RULE: this file never builds a FOMO URL. Every FOMO link comes ready-made from the JSON (links.py).
(function () {
  "use strict";
  const POLL_MS = 15000, SCREEN_MS = 15000, FRAME_OLD_S = 5, STALE_S = 15 * 60;
  const LS_KEY = "desk.dataPath";
  const $ = s => document.querySelector(s);
  const view = $("#view");
  const S = { state: null, chart: null, activity: null, bots: null, coin: {}, audit: {}, err: null,
              range: localStorage.getItem("desk.range") || "24H", filter: "all", loaded: false, odo: null };

  // ---------- data path (#d=...) ----------
  function takeDataPath() {
    const m = location.hash.match(/[#&]d=([A-Za-z0-9_\-]{8,200})/);
    if (m) {
      localStorage.setItem(LS_KEY, m[1]);
      history.replaceState(null, "", location.pathname + location.search + "#home");
    }
    return localStorage.getItem(LS_KEY);
  }
  let DP = takeDataPath();
  const dataUrl = rel => "d/" + encodeURIComponent(DP) + "/" + rel + "?nc=" + Math.random().toString(36).slice(2) + Date.now().toString(36);

  async function getJSON(rel) {
    const r = await fetch(dataUrl(rel), { cache: "no-store" });
    if (r.status === 404) { const e = new Error("not found"); e.status = 404; throw e; }
    if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
    return r.json();
  }

  // ---------- formatting ----------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (v, d = 2) => v == null ? "—" : (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const sUsd = v => v == null ? "—" : (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toFixed(2);
  const pct = (v, d = 1) => v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(d) + "%";
  function price(v) {
    if (v == null) return "—";
    if (v >= 1) return "$" + v.toFixed(4);
    const s = v.toPrecision(4); return "$" + (s.includes("e") ? Number(s).toFixed(12).replace(/0+$/, "") : s);
  }
  const hhmm = t => t ? new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
  const hhmmss = t => t ? new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  function ago(t) {
    if (!t) return "never"; const s = Math.max(0, Date.now() / 1000 - t);
    if (s < 60) return Math.round(s) + "s ago"; if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " d ago";
  }
  function dayLabel(t) {
    const d = new Date(t * 1000), n = new Date();
    if (d.toDateString() === n.toDateString()) return "Today";
    const y = new Date(n - 864e5); if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }
  const safeHref = h => { try { const u = new URL(h); return u.protocol === "https:" ? u.href : null; } catch (e) { return null; } };
  const ext = (href, label, cls) => { const h = safeHref(href); return h ? `<a class="${cls || "btn"}" href="${esc(h)}" target="_blank" rel="noopener noreferrer">${label}</a>` : ""; };

  // ---------- shared pieces ----------
  const states = {
    loading: () => `<div class="hero"><div class="sk" style="height:18px;width:90px;margin:8px 0"></div><div class="sk" style="height:52px;width:220px;margin:6px 0 12px"></div><div class="sk" style="height:24px;width:160px"></div></div>
      <div class="sk" style="height:250px;margin:18px 0 12px;border-radius:18px"></div><div class="sk" style="height:200px;border-radius:18px"></div>`,
    error: (title, detail) => `<div class="state"><div class="em">⚠️</div><div class="t">${esc(title)}</div><div class="d">${esc(detail)}</div><button class="btn primary" id="retry">Try again</button></div>`,
    empty: (em, title, detail) => `<div class="state"><div class="em">${em}</div><div class="t">${esc(title)}</div><div class="d">${esc(detail)}</div></div>`,
  };
  const ICON = { bought: "↗", sold: "↘", stopped: "✕", rejected: "–" };
  function actRow(a) {
    const tone = a.kind === "stopped" ? "red" : a.kind === "bought" ? "" : a.kind === "sold" && /^\+/.test(a.value || "") ? "green" : "";
    const href = a.mint ? `#coin/${encodeURIComponent(a.mint)}` : "";
    const tag = href ? "a" : "div";
    return `<${tag} class="item" ${href ? `href="${href}"` : ""}><div class="ic ${esc(a.kind)}">${ICON[a.kind] || "•"}</div>
      <div class="mid"><div class="t">${esc(a.title)}</div><div class="s">${esc(a.subtitle)}</div></div>
      <div class="v ${tone}">${esc((a.value || "").split(" · ")[0])}<div class="s">${esc((a.value || "").split(" · ").slice(1).join(" · ") || hhmm(a.ts))}</div></div></${tag}>`;
  }
  function pillHtml(p) { return `<span class="pill ${esc(p.tone || "plain")}">${esc(p.text)}</span>`; }
  function botCard(b) {
    const work = b.bar && /\.\.\.$|…$/.test(b.bar);
    return `<div class="card bot" style="--c:${esc(b.color)}"><div class="top"><span class="nm">${esc(b.name)}</span>
      <span class="st"><span class="sdot ${esc(b.status)}"></span>${b.status === "running" ? "Running" : b.status === "stale" ? "Quiet " + ago(b.heartbeat) : "Off"}</span></div>
      <div class="job">${esc(b.job)}</div><div class="big tn">${esc(b.card)}</div><div class="ln tn">${esc(b.line)}</div>
      ${b.bar ? `<div class="bar ${work ? "work" : ""}">${esc(b.bar)}</div>` : ""}
      <div class="pills">${(b.pills || []).map(pillHtml).join("")}</div></div>`;
  }

  // ---------- odometer ----------
  function odometer(el, text) {
    const prev = el.dataset.v || "";
    if (prev.length !== text.length) {
      el.innerHTML = [...text].map(c => /\d/.test(c)
        ? `<span class="dg"><span class="strip">${"0123456789".split("").map(d => `<span>${d}</span>`).join("")}</span></span>`
        : `<span class="ch">${esc(c)}</span>`).join("");
      el.querySelectorAll(".strip").forEach(s => { s.style.transition = "none"; s.style.transform = "translateY(0)"; });
      void el.offsetHeight;
      el.querySelectorAll(".strip").forEach(s => { s.style.transition = ""; });
    }
    const strips = el.querySelectorAll(".strip"); let i = 0;
    [...text].forEach(c => { if (/\d/.test(c)) { strips[i++].style.transform = `translateY(${-Number(c) * 1.08}em)`; } });
    el.dataset.v = text; el.setAttribute("aria-label", text);
  }

  // ---------- screens ----------
  function renderHome() {
    const st = S.state, ch = S.chart, bots = S.bots, act = S.activity;
    const bal = st.balance, mult = st.multiplier;
    const multTone = mult == null ? "plain" : mult >= 1 ? "green" : "red";
    const pos = st.positions || [];
    const scr = st.screen || {};
    view.innerHTML = `
      <div class="hero"><div class="lbl">${st.mode === "PAPER" ? "Paper balance" : "Balance"}</div>
        <div class="odo" id="odo"></div>
        <div class="sub"><span class="pill mult ${multTone}" id="mult">${mult == null ? "—" : mult.toFixed(2) + "×"}</span>
          <span class="${st.nightPnlUsd > 0 ? "green" : st.nightPnlUsd < 0 ? "red" : "dim"} tn">${sUsd(st.nightPnlUsd)} tonight</span>
          <span class="dim tn">· ${st.tradesTonight}/${st.maxTradesNight} trades</span></div>
        <div class="small dim tn" style="margin-top:6px">Cash ${usd(st.cash)} · started ${usd(st.startCash)}</div></div>
      <div class="card chartCard"><div class="chartWrap"><canvas id="balChart"></canvas><div class="chartEmpty" id="balEmpty" hidden></div></div>
        <div class="seg" id="rangeSeg">${(ch.ranges || ["1H", "6H", "24H", "ALL"]).map(r => `<button data-r="${esc(r)}" class="${r === S.range ? "on" : ""}">${esc(r)}</button>`).join("")}</div>
        <div class="legend"><span><i style="background:#00d35a"></i>Bought</span><span><i style="background:#0a84ff"></i>Sold</span><span><i style="background:#ff453a"></i>Stopped</span></div></div>
      <div class="card screen"><div class="hd"><span class="dot"></span>LIVE SCREEN<span class="ago tn" id="frameAgo"></span></div>
        <div class="img" id="screenBox">${scr.file ? `<img id="screenImg" alt="Desk Chrome">` : "No frame yet"}</div></div>
      ${pos.length ? `<div class="row-h"><h2>Open</h2></div><div class="list">${pos.map(p => `<a class="item" href="#coin/${encodeURIComponent(p.mint)}">
          <div class="ic bought">●</div><div class="mid"><div class="t">${esc(p.symbol)}</div><div class="s tn">${usd(p.sizeUsd)} in · stop ${price(p.stop)}</div></div>
          <div class="v ${p.pnlUsd >= 0 ? "green" : "red"} tn">${sUsd(p.pnlUsd)}<div class="s">${pct(p.pnlPct)}</div></div><span class="chev">›</span></a>`).join("")}</div>` : ""}
      <div class="row-h"><h2>Bots</h2><a href="#bots">See all</a></div>
      <div class="carousel">${(bots.bots || []).map(b => `<a class="mini" href="#bots" style="--c:${esc(b.color)}"><div class="nm"><span class="sdot ${esc(b.status)}"></span>${esc(b.name)}</div>
        <div class="big tn">${esc(b.card)}</div><div class="ln tn">${esc(b.bar || b.line)}</div></a>`).join("")}</div>
      <div class="row-h"><h2>Activity</h2><a href="#activity">See all</a></div>
      <div class="list">${(act.rows || []).length ? act.rows.slice(0, 5).map(actRow).join("") : `<div class="emptyRow">No trades yet. Bought, sold and stopped coins show up here.</div>`}</div>`;
    odometer($("#odo"), bal == null ? "$—" : usd(bal));
    drawBalance();
    $("#rangeSeg").onclick = e => { const r = e.target.dataset.r; if (!r) return; S.range = r; localStorage.setItem("desk.range", r);
      document.querySelectorAll("#rangeSeg button").forEach(b => b.classList.toggle("on", b.dataset.r === r)); drawBalance(); };
    refreshScreen();
    const box = $("#screenBox"); if (box && scr.file) box.onclick = () => openFull();
  }
  function drawBalance() {
    const c = $("#balChart"); if (!c) return;
    const ok = MiniChart.draw(c, S.chart.points, { range: S.range, marks: S.chart.marks, now: S.state.ts });
    const em = $("#balEmpty");
    em.hidden = !!ok;
    em.textContent = (S.chart.points || []).length ? `No balance points in the last ${S.range}` : "No balance history yet. The chart starts with the first PAPER night.";
  }
  function refreshScreen() {
    const img = $("#screenImg"), st = S.state; if (!st || !st.screen || !st.screen.file) return;
    if (img) { const n = new Image(); n.onload = () => { img.src = n.src; }; n.src = dataUrl(st.screen.file); }
    updateFrameAgo();
  }
  function updateFrameAgo() {
    const el = $("#frameAgo"), t = S.state && S.state.screen && S.state.screen.ts; if (!el) return;
    el.textContent = t && Date.now() / 1000 - t > FRAME_OLD_S ? "Last frame " + hhmmss(t) : t ? "Live" : "";
  }
  function openFull() {
    const d = document.createElement("div"); d.className = "full";
    d.innerHTML = `<img src="${esc(dataUrl(S.state.screen.file))}" alt="Desk Chrome">`;
    d.onclick = () => d.remove(); document.body.appendChild(d);
  }

  function renderBots() {
    const b = S.bots.bots || [];
    view.innerHTML = `<h2>Bots</h2>${b.map(botCard).join("")}
      <div class="list"><div class="kv"><span class="k">Desk</span><span class="val strong">${b.some(x => x.status === "running") ? "Running" : "Off"}</span></div>
      <div class="kv"><span class="k">Pause / resume</span><span class="val">Change via Telegram</span></div></div>
      <div class="note">The app only reads. Pause, resume and sells go through Telegram. Risk can't be paused while a position is open.</div>`;
  }

  function renderActivity() {
    const rows = S.activity.rows || [];
    const F = [["all", "All"], ["bought", "Bought"], ["sold", "Sold"], ["stopped", "Stopped"], ["rejected", "Rejected"]];
    const list = rows.filter(r => S.filter === "all" || r.kind === S.filter);
    let html = `<h2>Activity</h2><div class="chips" id="chips">${F.map(([k, l]) => `<button data-f="${k}" class="${S.filter === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
    if (!rows.length) html += states.empty("🌙", "No activity yet", "When the desk buys, sells or stops a coin, the row lands here with its time and dollars.");
    else if (!list.length) html += `<div class="list"><div class="emptyRow">Nothing in this filter.</div></div>`;
    else {
      let day = "", buf = "";
      list.forEach(r => { const d = dayLabel(r.ts); if (d !== day) { if (buf) html += buf + "</div>"; html += `<h3>${esc(d)}</h3>`; buf = `<div class="list">`; day = d; } buf += actRow(r); });
      html += buf + "</div>";
    }
    view.innerHTML = html;
    $("#chips").onclick = e => { const f = e.target.dataset.f; if (f) { S.filter = f; renderActivity(); } };
  }

  function renderAccount() {
    const st = S.state, groups = st.settings || {};
    const order = ["desk", "scanner", "analyst", "social", "brain", "executor", "risk", "advanced"];
    const desk = groups.desk || [], g = k => (desk.find(x => x.key === k) || {}).value;
    view.innerHTML = `<h2>Account</h2>
      <div class="list"><div class="kv"><span class="k">FOMO</span><span class="val strong">@${esc(st.handle || "—")}</span></div>
        <div class="kv"><span class="k">Mode</span><span class="val"><span class="badge ${st.mode === "LIVE" ? "live" : "paper"}">${esc(st.mode)}</span></span></div>
        <div class="kv"><span class="k">Night</span><span class="val tn">${esc(g("night_start"))} → ${esc(g("lock_time"))}</span></div>
        <div class="kv"><span class="k">Morning report</span><span class="val tn">${esc(g("report_time"))}</span></div>
        <div class="kv"><span class="k">Pushes</span><span class="val">Telegram</span></div>
        <div class="kv"><span class="k">Withdraw address</span><span class="val">${esc(g("withdraw_address"))}</span></div></div>
      <div class="btns">${ext(st.profileLink, "Open my FOMO profile", "btn")}</div>
      <div class="note">Mode, settings, pause and sells: change via Telegram. The app shows the values only.</div>
      <h3>Settings</h3>
      ${order.filter(k => groups[k] && k !== "desk").concat(["desk"]).map(k => `<details class="grp"><summary>${esc(k)}</summary>
        ${groups[k].map(s => `<div class="kv"><span class="k">${esc(s.key)}</span><span class="val tn">${esc(s.value)}${s.min != null ? ` <span class="dim2 small">(${esc(s.min)}–${esc(s.max)})</span>` : ""}</span></div>`).join("")}</details>`).join("")}
      <div class="note">Change via Telegram. Out-of-range values are refused and every change goes to the change log.</div>
      <h3>This phone</h3>
      <div class="list"><div class="kv"><span class="k">Last desk update</span><span class="val tn">${hhmmss(st.ts)} · ${ago(st.ts)}</span></div>
        <div class="kv"><span class="k">Publishing</span><span class="val">GitHub Pages · every ${Math.round((st.publishEveryS || 360) / 60)} min</span></div>
        <div class="kv"><span class="k">Data link</span><span class="val">saved on this phone</span></div></div>
      <button class="btn danger" id="forget" style="width:100%">Forget data link on this phone</button>
      <div class="note">Plan B hosting: the repo is public, so this data is public too.</div>`;
    $("#forget").onclick = () => { if (confirm("Forget the data link? You'll need the desk link (#d=…) again.")) { localStorage.removeItem(LS_KEY); DP = null; route(); } };
  }

  function renderCoin(mint) {
    const c = S.coin[mint];
    if (!c) { view.innerHTML = states.loading(); return; }
    const p = c.position;
    const cur = p ? p.price : (c.prices && c.prices.length ? c.prices[c.prices.length - 1][1] : null);
    view.innerHTML = `<div class="coinHead"><div class="sym">${esc(c.symbol)}</div><div class="mint">${esc(c.mint)}</div>
        <div class="px tn">${price(cur)} ${p ? `<span class="pill ${p.pnlUsd >= 0 ? "green" : "red"}">${pct(p.pnlPct)}</span>` : ""}</div></div>
      <div class="card chartCard"><div class="chartWrap"><canvas id="coinChart"></canvas><div class="chartEmpty" id="coinEmpty" hidden>No price history for this coin yet.</div></div>
        <div class="legend"><span><i style="background:#8e8e93"></i>Entry</span><span><i style="background:#ff453a"></i>Stop</span><span><i style="background:#00d35a"></i>Take profit</span></div></div>
      ${p ? `<div class="grid">
        <div class="tile"><div class="k">In</div><div class="val tn">${usd(p.sizeUsd)}</div></div>
        <div class="tile"><div class="k">Now</div><div class="val tn">${usd(p.valueUsd)}</div></div>
        <div class="tile"><div class="k">P&amp;L</div><div class="val tn ${p.pnlUsd >= 0 ? "green" : "red"}">${sUsd(p.pnlUsd)}</div></div>
        <div class="tile"><div class="k">Entry</div><div class="val tn">${price(p.entry)}</div></div>
        <div class="tile"><div class="k">Stop line</div><div class="val tn red">${price(p.stop)}</div></div>
        <div class="tile"><div class="k">${p.tpDone ? "Trail line" : "Take profit"}</div><div class="val tn green">${price(p.tpDone ? p.trailLine : p.tpPrice)}</div></div>
        <div class="tile"><div class="k">Peak</div><div class="val tn">${price(p.peak)}</div></div>
        <div class="tile"><div class="k">Open since</div><div class="val tn">${hhmm(p.openedAt)}</div></div></div>`
        : `<div class="list"><div class="emptyRow">No open position on this coin.</div></div>`}
      <div class="btns">${ext(c.link, "Open in FOMO", "btn primary")}${c.hasAudit ? `<a class="btn" href="#audit/${encodeURIComponent(c.mint)}">Audit</a>` : ""}</div>
      ${p ? `<button class="btn danger" id="sellNow" style="width:100%;margin-bottom:12px">Sell now</button>` : ""}
      ${c.scan ? `<h3>Scanner</h3><div class="list"><div class="kv"><span class="k">Liquidity</span><span class="val tn">${usd(c.scan.liquidityUsd, 0)}</span></div>
        <div class="kv"><span class="k">Top 10</span><span class="val tn">${c.scan.top10Pct == null ? "—" : c.scan.top10Pct.toFixed(1) + "%"}</span></div>
        <div class="kv"><span class="k">1h move</span><span class="val tn">${pct(c.scan.h1ChangePct, 0)}</span></div>
        <div class="kv"><span class="k">Verdict</span><span class="val">${esc(c.scan.verdict)}${c.scan.reason ? " · " + esc(c.scan.reason) : ""}</span></div></div>` : ""}
      <h3>Orders</h3><div class="list">${(c.orders || []).length ? c.orders.map(o => `<div class="item"><div class="ic ${o.side === "buy" ? "bought" : "sold"}">${o.side === "buy" ? "↗" : "↘"}</div>
          <div class="mid"><div class="t">${o.side === "buy" ? "Buy" : "Sell " + (o.pct || 100) + "%"} · ${esc(o.status)}</div><div class="s">${esc(o.bot)} · ${hhmm(o.ts)}${o.quote ? " · " + esc(o.quote) : ""}</div></div>
          <div class="v tn">${usd(o.fillUsd != null ? o.fillUsd : o.usd)}<div class="s">${o.fee ? esc(o.fee) + " fee" : ""}</div></div></div>`).join("") : `<div class="emptyRow">No orders yet.</div>`}</div>
      ${(c.closed || []).length ? `<h3>Closed</h3><div class="list">${c.closed.map(x => `<div class="item"><div class="ic ${x.reason === "stop" ? "stopped" : "sold"}">${x.reason === "stop" ? "✕" : "↘"}</div>
          <div class="mid"><div class="t">${esc(x.reason || "closed")}</div><div class="s">${hhmm(x.openedAt)} → ${hhmm(x.closedAt)} · ${esc(x.mode)}</div></div>
          <div class="v tn ${x.pnlUsd >= 0 ? "green" : "red"}">${sUsd(x.pnlUsd)}</div></div>`).join("")}</div>` : ""}`;
    const ok = MiniChart.draw($("#coinChart"), c.prices, { marks: c.marks, color: "#0a84ff",
      lines: p ? [{ y: p.entry, color: "#8e8e93", label: "entry", fit: true }, { y: p.stop, color: "#ff453a", label: "stop", fit: true },
                  { y: p.tpDone ? p.trailLine : p.tpPrice, color: "#00d35a", label: p.tpDone ? "trail" : "tp" }] : [] });
    $("#coinEmpty").hidden = !!ok;
    const sb = $("#sellNow"); if (sb) sb.onclick = () => sellSheet(c);
  }
  function sellSheet(c) {
    const sh = $("#sheet"), box = sh.querySelector(".sheetBox");
    box.innerHTML = `<div class="grab"></div><h4>Sell ${esc(c.symbol)} now</h4>
      <div class="dim small">Selling goes through Telegram. Send this to the desk bot:</div>
      <div class="cmd" id="cmd">${esc(c.sellCommand)}</div>
      <div class="btns"><button class="btn" id="copyCmd">Copy</button><button class="btn ghost" id="closeSheet">Close</button></div>
      <div class="note">Risk sells 100% (S4) and pushes the real $ out from FOMO.</div>`;
    sh.hidden = false;
    $("#copyCmd").onclick = async () => { try { await navigator.clipboard.writeText(c.sellCommand); $("#copyCmd").textContent = "Copied"; } catch (e) { $("#copyCmd").textContent = "Select the text"; } };
    $("#closeSheet").onclick = () => { sh.hidden = true; };
    sh.onclick = e => { if (e.target === sh) sh.hidden = true; };
  }

  function renderAudit(mint) {
    const a = S.audit[mint];
    if (!a) { view.innerHTML = states.loading(); return; }
    const sc = a.score, v = a.verdict;
    const vt = { pass: ["green", "Cleared"], red: ["red", "Red layer"], reject: ["orange", "Score too low"], pending: ["plain", "Pending"] }[v] || ["plain", v];
    const r = 36, C = 2 * Math.PI * r, frac = sc ? Math.max(0, Math.min(1, sc.score / 100)) : 0;
    const ringCol = !sc ? "#5a5a5f" : sc.pass ? "#00d35a" : "#ff9f0a";
    view.innerHTML = `<div class="coinHead"><div class="sym">${esc(a.symbol)} <span class="pill ${vt[0]}">${esc(vt[1])}</span></div><div class="mint">${esc(a.mint)}</div>
        <div class="small dim" style="margin-top:6px">Audit ${hhmmss(a.auditTs)}</div></div>
      <div class="card score"><div class="ring"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" stroke="#1c1c1f" stroke-width="8" fill="none"/>
          <circle cx="42" cy="42" r="${r}" stroke="${ringCol}" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
          <b class="tn">${sc ? esc(sc.score) : "—"}</b></div>
        <div class="parts">${sc ? Object.entries(sc.parts).map(([k, x]) => `<div class="part"><span>${esc(k)}</span><span class="track"><span class="fill" style="width:${x == null ? 0 : Math.max(0, Math.min(100, x * 100))}%"></span></span><span class="tn">${x == null ? "off" : Math.round(x * 100)}</span></div>`).join("")
          : `<div class="dim small">No score yet.</div>`}
          ${sc ? `<div class="small dim">Gate ${esc(sc.min)} · ${sc.reason ? esc(sc.reason) : ""}</div>` : ""}</div></div>
      <h3>8 layers</h3><div class="list">${(a.layers || []).length ? a.layers.map(l => `<div class="item layer"><div class="ic ${l.pass === true ? "pass" : l.pass === false ? "fail" : "na"}">${l.pass === true ? "✓" : l.pass === false ? "✕" : "?"}</div>
          <div class="mid"><div class="t">${esc(l.layer)} · ${esc(l.name)}</div><div class="s">${esc(l.value || "")}${l.source ? " · " + esc(l.source) : ""}</div></div></div>`).join("")
        : `<div class="emptyRow">No layer results yet.</div>`}</div>
      <div class="note">One red layer stops the coin, whatever the score or Social says.</div>
      <div class="btns">${ext(a.link, "Open in FOMO", "btn primary")}<a class="btn" href="#coin/${encodeURIComponent(a.mint)}">Coin</a></div>`;
  }

  // ---------- routing + polling ----------
  function current() { const h = location.hash.replace(/^#/, "") || "home"; const [name, arg] = h.split("/"); return { name, arg: arg && decodeURIComponent(arg) }; }
  function setChrome(r) {
    const tab = { coin: "activity", audit: "activity" }[r.name] || r.name;
    document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
    const sub = r.name === "coin" || r.name === "audit";
    $("#back").hidden = !sub;
    $("#topTitle").textContent = sub ? (r.name === "coin" ? "Coin" : "Audit") : "Desk";
    const m = S.state && S.state.mode; const b = $("#modeBadge");
    b.hidden = !m; if (m) { b.textContent = m; b.className = "badge " + (m === "LIVE" ? "live" : "paper"); }
    const st = $("#stale");
    if (S.state && Date.now() / 1000 - S.state.ts > STALE_S) { st.hidden = false; st.textContent = `Desk data is ${ago(S.state.ts)}. The desk may be off.`; } else st.hidden = true;
  }
  function render() {
    const r = current(); setChrome(r);
    if (!DP) { view.innerHTML = states.error("No data link", "Open the desk link once on this phone. It ends in #d=… and is saved here after that."); bindRetry(); return; }
    if (S.err && !S.loaded) { view.innerHTML = states.error("Can't reach the desk", S.err); bindRetry(); return; }
    if (!S.loaded) { view.innerHTML = states.loading(); return; }
    const y = window.scrollY;
    if (r.name === "home") renderHome();
    else if (r.name === "bots") renderBots();
    else if (r.name === "activity") renderActivity();
    else if (r.name === "account") renderAccount();
    else if (r.name === "coin" && r.arg) renderCoin(r.arg);
    else if (r.name === "audit" && r.arg) renderAudit(r.arg);
    else renderHome();
    if (render.same) window.scrollTo(0, y);
  }
  function bindRetry() { const b = $("#retry"); if (b) b.onclick = () => { S.err = null; view.innerHTML = states.loading(); poll(); }; }

  async function poll() {
    if (!DP) { render(); return; }
    const r = current();
    try {
      const [st, ch, act, bots] = await Promise.all(["state.json", "chart.json", "activity.json", "bots.json"].map(getJSON));
      Object.assign(S, { state: st, chart: ch, activity: act, bots, err: null, loaded: true });
      if (r.name === "coin" && r.arg) S.coin[r.arg] = await getJSON(`coin/${r.arg}.json`).catch(e => S.coin[r.arg] || errCoin(r.arg, e));
      if (r.name === "audit" && r.arg) S.audit[r.arg] = await getJSON(`audit/${r.arg}.json`).catch(e => S.audit[r.arg] || errCoin(r.arg, e));
    } catch (e) {
      S.err = e.status === 404 ? "The data link isn't on the desk's site (404). Check the link ends in the right #d=… path." :
        (navigator.onLine === false ? "This phone is offline." : "The desk's site didn't answer (" + (e.message || "error") + ").");
      if (S.loaded) { const st = $("#stale"); st.hidden = false; st.textContent = "Couldn't refresh: " + S.err; return; }
    }
    render.same = true; render(); render.same = false;
  }
  function errCoin(mint, e) { return null; }

  window.addEventListener("hashchange", () => {
    const m = location.hash.match(/[#&]d=/); if (m) { DP = takeDataPath(); S.loaded = false; poll(); return; }
    window.scrollTo(0, 0); render();
    const r = current(); if ((r.name === "coin" || r.name === "audit") && r.arg) poll();
  });
  $("#back").onclick = () => { if (history.length > 1) history.back(); else location.hash = "#activity"; };
  window.addEventListener("resize", () => { if (current().name === "home" && S.loaded) drawBalance(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  setInterval(() => { if (!document.hidden) poll(); }, POLL_MS);
  setInterval(() => { if (!document.hidden && current().name === "home") refreshScreen(); }, SCREEN_MS);
  setInterval(updateFrameAgo, 1000);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  window.__desk = { S, poll, render };
  render(); poll();
})();
