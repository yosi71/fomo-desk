// FOMO Desk phone app (STEP 10). Plain JS. Reads the desk's published JSON (Plan B: GitHub Pages).
// RULE: this file never builds a FOMO URL. Every FOMO link comes ready-made from the JSON (links.py).
(function () {
  "use strict";
  const POLL_S = 15, SCREEN_MS = 15000, FRAME_OLD_S = 5, STALE_S = 15 * 60;
  const LS_KEY = "desk.dataPath";
  const RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = s => document.querySelector(s);
  const view = $("#view");
  const S = { state: null, chart: null, activity: null, bots: null, coin: {}, audit: {},
              lastOk: null, failing: false, nextPoll: Date.now() + POLL_S * 1000,
              range: localStorage.getItem("desk.range") || "LIVE", filter: "all", loaded: false, chartN: 0 };

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
  const nc = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const dataUrl = rel => "d/" + encodeURIComponent(DP) + "/" + rel + "?nc=" + nc();
  async function getJSON(rel) {
    const r = await fetch(dataUrl(rel), { cache: "no-store" });
    if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
    return r.json();
  }

  // ---------- formatting ----------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (v, d = 2) => v == null ? "—" : (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v, d = 2) => v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(d) + "%";
  const big = v => v == null ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : usd(v, 0);
  function price(v) {
    if (v == null) return "—";
    if (v >= 1) return "$" + v.toFixed(4);
    const s = v.toPrecision(4); return "$" + (s.includes("e") ? Number(s).toFixed(12).replace(/0+$/, "") : s);
  }
  const hhmm = t => t ? new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
  const hhmmss = t => t ? new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  function dayLabel(t) {
    const d = new Date(t * 1000), n = new Date();
    if (d.toDateString() === n.toDateString()) return "Today";
    if (d.toDateString() === new Date(n - 864e5).toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }
  const safeHref = h => { try { const u = new URL(h); return u.protocol === "https:" ? u.href : null; } catch (e) { return null; } };
  const ext = (href, label, cls) => { const h = safeHref(href); return h ? `<a class="${cls}" href="${esc(h)}" target="_blank" rel="noopener noreferrer" data-ext="1">${label}</a>` : ""; };
  const paperPill = m => m ? `<span class="paper ${m === "LIVE" ? "live" : ""}">${esc(m)}</span>` : "";

  // ---------- pieces ----------
  const ICON = { bought: "↗", sold: "↘", stopped: "✕", rejected: "–" };
  const loading = () => `<div class="sk" style="height:44px;margin:6px 0 10px"></div><div class="sk" style="height:96px;margin-bottom:12px"></div>
      <div class="sk" style="height:220px;margin-bottom:12px"></div><div class="sk" style="height:240px;border-radius:22px"></div>`;
  function actRow(a) {
    const go = a.mint ? `#${a.open || "coin"}/${encodeURIComponent(a.mint)}` : "";
    const v = (a.value || "").split(" · ");
    const tone = a.kind === "stopped" || /^-/.test(v[0]) ? "red" : /^\+/.test(v[0]) ? "green" : "";
    return `<div class="item" ${go ? `data-go="${go}"` : ""}><div class="ic ${esc(a.kind)}">${ICON[a.kind] || "•"}</div>
      <div class="mid"><div class="t">${esc(a.title)}</div><div class="s">${esc(a.subtitle)}${v[1] ? " · " + esc(v.slice(1).join(" · ")) : ""}</div></div>
      <div class="v ${tone}">${esc(v[0])}${ext(a.link, "Open on FOMO", "")}</div></div>`;
  }
  function ring(score, passAt, cls) {
    const r = 24, C = 2 * Math.PI * r, f = score == null ? 0 : Math.max(0, Math.min(1, score / 100));
    const col = score == null ? "rgba(235,235,245,0.3)" : score >= passAt ? "#00d35a" : "#ff9f0a";
    return `<div class="ring ${cls || ""}"><svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="${r}" stroke="#2c2c2e" stroke-width="5" fill="none"/>
      <circle cx="28" cy="28" r="${r}" stroke="${col}" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}"/></svg><b>${score == null ? "—" : esc(score)}</b></div>`;
  }
  function botBody(b, compact) {
    const pills = `<div class="pills">${(b.pills || []).map(p => `<span class="pill ${esc(p.tone)}">${esc(p.text)}</span>`).join("")}</div>`;
    if (b.id === "scanner") {
      const f = (b.feed || []).slice(0, compact ? 3 : 5);
      return `<div class="big">${esc(b.card)}</div><div class="feed">${f.length ? f.map(d => d.tone === "pass"
        ? `<div class="pass">${esc(d.text.replace(/ → Analyst$/, ""))} <b>→ Analyst</b></div>` : `<div class="${esc(d.tone)}">${esc(d.text)}</div>`).join("")
        : `<div class="wait">No pools yet tonight</div>`}</div>${compact ? "" : pills}`;
    }
    if (b.id === "analyst") {
      const s8 = (b.strip || []).map(x => `<i class="${x === true ? "p" : x === false ? "f" : ""}"></i>`).join("");
      return `<div class="big">${esc(b.card)}</div><div class="an"><div class="strip8">${s8}</div>${ring(b.score, b.scorePass)}<div class="soc">${esc(b.social)}</div></div>${compact ? "" : pills}`;
    }
    if (b.id === "brain") {
      return `<div class="big">${esc(b.card)}</div><div class="ln hl">${esc(b.sizing || "No ticket yet")}</div>
        ${b.rule ? `<div class="ln">${esc(b.rule)}</div>` : (b.rules || []).map(r => `<div class="ln">${esc(r)}</div>`).join("")}${compact ? "" : pills}`;
    }
    if (b.id === "executor") {
      const work = b.bar && /\.\.\.$/.test(b.bar), ok = b.bar && /^✓/.test(b.bar);
      return `<div class="big">${esc(b.card)}</div>${b.bar ? `<div class="bar ${work ? "work" : ""} ${ok ? "ok" : ""}">${esc(b.bar)}</div>` : `<div class="ln">Lane free</div>`}${compact ? "" : pills}`;
    }
    return `<div class="big">${esc(b.card)}</div>${pills}`;
  }
  function botCard(b, compact) {
    const st = b.status === "running" ? "Running" : b.status === "stale" ? "Quiet" : "Off";
    let extra = "";
    if (!compact) {
      const p = b.pause || {};
      extra = `<div class="ctl"><div><div>Running</div><div class="hint">${p.locked ? "Locked while a position is open" : `Change via Telegram: ${esc(p.command)}`}</div></div>
          <span class="switch ${p.on ? "on" : ""}" role="switch" aria-checked="${p.on ? "true" : "false"}" aria-disabled="true"></span></div>
        <details class="dec"><summary>Last ${Math.min(20, (b.decisions || []).length)} decisions</summary>
          ${(b.decisions || []).length ? b.decisions.slice(0, 20).map(d => `<div class="drow"><span class="t ${d.tone === "kill" ? "kill" : ""}" ${d.mint ? `data-go="#coin/${encodeURIComponent(d.mint)}"` : ""}>${esc(d.text)}</span>
            <time>${hhmm(d.ts)}</time>${ext(d.link, "FOMO", "f")}</div>`).join("") : `<div class="drow"><span class="t ter">Nothing yet tonight</span></div>`}</details>
        <div class="btnRow"><a class="btn" href="#account/${esc(b.settingsSection)}">Settings</a></div>`;
    }
    return `<div class="bot" style="--c:${esc(b.color)}"><div class="top"><span class="nm">${esc(b.name)}</span>
      <span class="st"><span class="sdot ${esc(b.status)}"></span>${st}</span></div>${botBody(b, compact)}${extra}</div>`;
  }

  // ---------- odometer: 600ms ease-out roll, 30ms stagger; reduced motion swaps the value ----------
  function odometer(el, text) {
    el.setAttribute("aria-label", text);
    if (RM) { el.textContent = text; el.dataset.v = text; return; }
    if ((el.dataset.v || "").length !== text.length) {
      el.innerHTML = [...text].map(c => /\d/.test(c)
        ? `<span class="dg"><span class="strip">${"0123456789".split("").map(d => `<span>${d}</span>`).join("")}</span></span>`
        : `<span class="ch">${esc(c)}</span>`).join("");
    }
    const strips = [...el.querySelectorAll(".strip")]; let i = 0;
    [...text].forEach(c => { if (/\d/.test(c)) { const s = strips[i]; s.style.transitionDelay = (i * 30) + "ms"; s.style.transform = `translateY(${-Number(c) * 1.1}em)`; i++; } });
    el.dataset.v = text;
  }

  // ---------- HOME ----------
  function renderHome() {
    const st = S.state, act = S.activity, bots = S.bots;
    const initial = (st.handle || "?").slice(0, 1).toUpperCase();
    const running = bots.running != null ? bots.running : (bots.bots || []).filter(b => b.status === "running").length;
    const scr = st.screen || {};
    const lo = scr.lastOrder;
    const lane = scr.lane || { text: "Idle" };
    view.innerHTML = `
      <div class="nav"><a class="av" href="#account">${esc(initial)}</a><a class="who" href="#account">Grok Bot <span>›</span></a>
        <button class="ib" id="searchBtn" aria-label="Search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button>
        <button class="ib" id="bellBtn" aria-label="Pushes"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg></button></div>
      <div class="hero"><div class="lbl">Balance ${paperPill(st.mode)}</div>
        <div class="odo" id="odo"></div>
        <div class="sub"><span class="${st.todayPct == null ? "sec" : st.todayPct >= 0 ? "green" : "red"}">${pct(st.todayPct)} today</span>
          ${st.multiplier == null ? "" : `<span class="mult ${st.multiplier < 1 ? "down" : ""}">${st.multiplier.toFixed(2)}×</span>`}</div></div>
      <div class="chartBox"><canvas id="balChart"></canvas><div class="chartEmpty" id="balEmpty" hidden></div></div>
      <div class="ranges" id="ranges">${(S.chart.ranges || ["LIVE", "1H", "4H", "1D", "1W", "ALL"]).map(r => `<button data-r="${esc(r)}" class="${r === S.range ? "on" : ""}">${esc(r)}</button>`).join("")}</div>
      <div class="screen"><div class="hd"><span class="dot" id="frameDot"></span><span id="frameTxt"></span>
          <span class="lane" style="${lane.color ? `color:${esc(lane.color)}` : ""}">${esc(lane.text)}</span></div>
        <div class="frame" id="frame">${scr.file ? `<img id="fA" alt="Bot's computer"><img id="fB" alt="" style="opacity:0">` : `<div class="none">No frame yet</div>`}</div>
        ${lo ? `<div class="lo"><span class="t">${esc(lo.text)}</span><span class="checks">${["screen", "api", "chain"].map(k => `<i class="${lo.checks && lo.checks[k] ? "ok" : ""}" title="${k}">✓</i>`).join("")}</span></div>` : ""}
        <div class="ft">${ext(scr.link, "Open on FOMO", "link")}</div></div>
      <h2>Bots · ${running} running</h2>
      <div class="carousel">${(bots.bots || []).map(b => `<a href="#bots" style="display:contents">${botCard(b, true)}</a>`).join("")}</div>
      <h2>Activity · <a href="#activity">See all</a></h2>
      <div class="list">${(act.rows || []).length ? act.rows.slice(0, 5).map(actRow).join("") : `<div class="empty">Waiting for the first trade</div>`}</div>`;
    odometer($("#odo"), st.balance == null ? "$—" : usd(st.balance));
    drawBalance(true);
    $("#ranges").onclick = e => { const r = e.target.dataset.r; if (!r) return; S.range = r; localStorage.setItem("desk.range", r);
      document.querySelectorAll("#ranges button").forEach(b => b.classList.toggle("on", b.dataset.r === r)); drawBalance(false); };
    $("#searchBtn").onclick = searchSheet;
    $("#bellBtn").onclick = () => noteSheet("Pushes", "Pushes go to Telegram in this setup.", null);
    if (scr.file) { $("#frame").onclick = openFull; refreshScreen(); }
    updateFrame();
  }
  function drawBalance(animate) {
    const c = $("#balChart"); if (!c) return;
    const pts = S.chart.points || [], n = pts.length;
    const opt = { range: S.range, marks: S.chart.marks, now: S.state.ts, liveFrom: S.chart.liveFrom };
    const grew = animate && S.chartN && n > S.chartN && !RM;
    S.chartN = n;
    let ok;
    if (grew) {
      const t0 = performance.now();
      const step = now => { const p = Math.min(1, (now - t0) / 250); MiniChart.line(c, pts, { ...opt, progress: p }); if (p < 1) requestAnimationFrame(step); };
      ok = MiniChart.line(c, pts, { ...opt, progress: 0 }); requestAnimationFrame(step);
    } else ok = MiniChart.line(c, pts, opt);
    const em = $("#balEmpty"); em.hidden = !!ok; em.textContent = "Waiting for the first trade";
  }
  // double buffer: load the next frame into the hidden <img>, swap when it has decoded
  function refreshScreen() {
    const st = S.state; if (!st || !st.screen || !st.screen.file) return;
    const a = $("#fA"), b = $("#fB"); if (!a || !b) return;
    const front = a.style.opacity === "0" ? b : a, back = front === a ? b : a;
    back.onload = () => { back.style.opacity = "1"; front.style.opacity = "0"; };
    back.src = dataUrl(st.screen.file);
  }
  function updateFrame() {
    const dot = $("#frameDot"), txt = $("#frameTxt"); if (!dot) return;
    const t = S.state && S.state.screen && S.state.screen.ts;
    const live = t && Date.now() / 1000 - t < FRAME_OLD_S;
    dot.classList.toggle("on", !!live);
    txt.textContent = live ? "Live · Bot's computer" : t ? `Last frame ${hhmmss(t)}` : "No frame yet";
  }
  function openFull() {
    const scr = S.state.screen, d = document.createElement("div"); d.className = "full";
    d.innerHTML = `<button class="x" aria-label="Close">✕</button><img alt="Bot's computer" src="${esc(dataUrl(scr.file))}"><div class="fo">${ext(scr.link, "Open on FOMO", "link")}</div>`;
    document.body.appendChild(d);
    const img = d.querySelector("img");
    let sc = 1, tx = 0, ty = 0, start = null;
    const apply = () => { img.style.transform = `translate(${tx}px, calc(-50% + ${ty}px)) scale(${sc})`; };
    apply();
    const pts = new Map();
    d.addEventListener("pointerdown", e => { pts.set(e.pointerId, [e.clientX, e.clientY]); start = snap(); });
    d.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId) || !start) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      const v = [...pts.values()];
      if (v.length >= 2) { const dist = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); sc = Math.max(1, Math.min(6, start.sc * dist / start.dist)); }
      else if (sc > 1) { tx = start.tx + v[0][0] - start.p[0][0]; ty = start.ty + v[0][1] - start.p[0][1]; }
      apply();
    });
    const up = e => { pts.delete(e.pointerId); start = pts.size ? snap() : null; if (sc === 1) { tx = 0; ty = 0; apply(); } };
    d.addEventListener("pointerup", up); d.addEventListener("pointercancel", up);
    function snap() { const v = [...pts.values()]; return { sc, tx, ty, p: v, dist: v.length >= 2 ? Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]) || 1 : 1 }; }
    d.querySelector(".x").onclick = () => d.remove();
  }

  // ---------- BOTS ----------
  function renderBots() {
    const b = S.bots.bots || [];
    view.innerHTML = `<div class="largeTitle">Bots</div>${b.map(x => botCard(x, false)).join("")}
      <div class="note">Pause, resume and settings change via Telegram. Risk can't be paused while a position is open.</div>`;
  }

  // ---------- ACTIVITY ----------
  function renderActivity() {
    const rows = S.activity.rows || [];
    const F = [["all", "All"], ["bought", "Bought"], ["sold", "Sold"], ["stopped", "Stopped"], ["rejected", "Rejected"]];
    const list = rows.filter(r => S.filter === "all" || r.kind === S.filter);
    let html = `<div class="largeTitle">Activity</div><div class="chips" id="chips">${F.map(([k, l]) => `<button data-f="${k}" class="${S.filter === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
    if (!list.length) html += `<div class="list"><div class="empty">Nothing yet tonight</div></div>`;
    else {
      let day = "", buf = "";
      list.forEach(r => { const d = dayLabel(r.ts); if (d !== day) { if (buf) html += buf + "</div>"; html += `<div class="dayH">${esc(d)}</div>`; buf = `<div class="list">`; day = d; } buf += actRow(r); });
      html += buf + "</div>";
    }
    view.innerHTML = html;
    $("#chips").onclick = e => { const f = e.target.dataset.f; if (f) { S.filter = f; renderActivity(); } };
  }


  function moneyPlus(v) {
    if (v == null) return "—";
    return (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function mcapUsd(v) {
    if (v == null) return "—";
    const d = Math.abs(v) >= 100 ? 0 : 2;
    return "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function renderCopyPicks(st) {
    const lists = (st.copyPicks && st.copyPicks.lists) || [];
    const latest = lists[0];
    let html = `<h2>Copy picks</h2>`;
    if (!latest || !(latest.traders || []).length) {
      html += `<div class="list"><div class="empty">No copy picks yet</div></div>`;
      return html;
    }
    html += (latest.traders || []).map(t => {
      const lb = t.lastBuy || {};
      const buyLabel = (lb.symbol || "coin") + " at " + mcapUsd(lb.mcap);
      let buyRow;
      if (!(lb.symbol || lb.mint)) buyRow = `<div class="ln">last buy: none in last 25 swaps</div>`;
      else if (lb.unknownChain) buyRow = `<div class="ln">last buy: ${esc(buyLabel)}</div>`;
      else buyRow = `<div class="ln">${ext(lb.coinUrl, "last buy: " + buyLabel, "") || ("last buy: " + esc(buyLabel))}</div>`;
      const buyBtn = lb.unknownChain ? ext(lb.coinUrl || st.signupLink, "Open FOMO", "btn")
                    : ext(lb.coinUrl, "Last buy", "btn");
      return `<div class="card pickCard">
        <div class="handle">${esc(t.handle)}</div>
        <div class="pnl"><span class="green">7d ${moneyPlus(t.pnl7d)}</span><span class="green">30d ${moneyPlus(t.pnl30d)}</span></div>
        <div class="s">${esc(t.trades)} trades · last trade ${esc(t.lastTradeAgo || "—")}</div>
        ${buyRow}
        ${t.why ? `<div class="s">${esc(t.why)}</div>` : ""}
        <div class="btnRow">${ext(t.profileUrl, "Profile", "btn")}${buyBtn || ""}</div>
        <div class="ctl"><span>Copy on desk</span><span class="switch" role="switch" aria-checked="false" aria-disabled="true"></span></div>
      </div>`;
    }).join("");
    html += `<h2>Last 7 lists</h2><div class="list pickHist">`;
    html += lists.map((lst, i) => {
      const handles = (lst.traders || []).map(x => x.handle).filter(Boolean).join(", ") || "—";
      const when = (lst.ts ? dayLabel(lst.ts) + " · " + hhmm(lst.ts) : "—") + (i === 0 ? " · latest" : "");
      return `<div class="kv"><span>${esc(when)}</span><span class="val">${esc(handles)}</span></div>`;
    }).join("");
    html += `</div>`;
    return html;
  }

  // ---------- ACCOUNT ----------
  function renderAccount(section) {
    const st = S.state, groups = st.settings || {};
    const order = ["scanner", "analyst", "social", "brain", "executor", "risk", "desk", "advanced"];
    const desk = groups.desk || [], g = k => (desk.find(x => x.key === k) || {}).value;
    view.innerHTML = `<div class="largeTitle">Account</div>
      <div class="list">
        <div class="kv"><span>Mode</span><span class="val">${paperPill(st.mode)}</span></div>
        <div class="kv"><span>Cash</span><span class="val">${usd(st.cash)}</span></div>
        ${safeHref(st.profileLink) ? `<a class="kv act" href="${esc(safeHref(st.profileLink))}" target="_blank" rel="noopener noreferrer"><span>Your FOMO profile</span><span class="val">@${esc(st.handle || "")} ›</span></a>` : ""}
        <div class="kv act" id="invite"><span>Invite a friend</span><span class="val">›</span></div></div>
      <div class="note">Change via Telegram: ${st.mode === "PAPER" ? "live (type LIVE)" : "paper"}</div>
      ${renderCopyPicks(st)}
      <div class="list">
        <div class="kv"><span>Pushes</span><span class="val">Telegram</span></div>
        <div class="kv"><span>Send test push</span><span class="val">Telegram only</span></div>
        <div class="kv"><span>Watch in Grok Bot</span><span class="val">Telegram only</span></div></div>
      <div class="note">Send test push and Watch in Grok Bot are Telegram-only in this setup.</div>
      <h2>Settings</h2>
      ${order.filter(k => groups[k]).map(k => `<details class="grp" id="set-${esc(k)}" ${section === k ? "open" : ""}><summary>${esc(k.charAt(0).toUpperCase() + k.slice(1))}</summary>
        ${groups[k].map(s => {
          const num = typeof s.value === "number" && s.min != null;
          return `<div class="set"><div class="nm"><span>${esc(s.key)}</span>${num ? `<span class="ter">${esc(s.min)}–${esc(s.max)}</span>` : ""}</div>
            <div class="ctrl">${num ? `<input type="range" disabled min="${esc(s.min)}" max="${esc(s.max)}" step="any" value="${esc(s.value)}" aria-label="${esc(s.key)}">
              <input type="number" disabled value="${esc(s.value)}" aria-label="${esc(s.key)} value">` : `<span class="sec">${esc(s.value)}</span>`}</div>
            <div class="tg">Change via Telegram: ${esc(s.telegram || ("set " + s.key + " " + s.value))}</div></div>`;
        }).join("")}</details>`).join("")}
      <h2>This phone</h2>
      <div class="list"><div class="kv"><span>Last update</span><span class="val">${hhmmss(st.ts)}</span></div>
        <div class="kv"><span>Publishing</span><span class="val">GitHub Pages · every ${Math.round((st.publishEveryS || 360) / 60)} min</span></div>
        <div class="kv"><span>Night</span><span class="val">${esc(g("night_start"))} → ${esc(g("lock_time"))}</span></div>
        <div class="kv act" id="forget" style="color:var(--red)"><span>Forget data link on this phone</span></div></div>
      <div class="note">Plan B hosting: the repo is public, so this data is public too.</div>`;
    $("#invite").onclick = async () => {
      const url = safeHref(st.signupLink); if (!url) return;
      if (navigator.share) { try { await navigator.share({ title: "FOMO", url }); } catch (e) { /* cancelled */ } }
      else { try { await navigator.clipboard.writeText(url); noteSheet("Invite a friend", "Link copied.", url); } catch (e) { noteSheet("Invite a friend", "Copy this link:", url); } }
    };
    $("#forget").onclick = () => { if (confirm("Forget the data link? You'll need the desk link (#d=…) again.")) { localStorage.removeItem(LS_KEY); DP = null; S.loaded = false; render(); } };
    if (section) { const el = document.getElementById("set-" + section); if (el) setTimeout(() => el.scrollIntoView({ block: "start" }), 0); }
  }

  // ---------- COIN ----------
  function subNav(title, mode) {
    return `<div class="nav"><button class="back" id="back"><b>‹</b>Back</button><div class="ttl">${esc(title)}</div>${mode ? paperPill(mode) : ""}</div>`;
  }
  function renderCoin(mint) {
    const c = S.coin[mint];
    if (!c) { view.innerHTML = subNav("Coin", S.state && S.state.mode) + loading(); bindBack(); return; }
    if (c.missing) { view.innerHTML = subNav("Coin", S.state && S.state.mode) + `<div class="empty">Nothing published for this coin yet</div>`; bindBack(); return; }
    const p = c.position, sh = c.shield || {};
    const shCls = !sh.audited ? "na" : sh.passed === sh.of ? "" : "warn";
    const chg = p ? p.sinceEntryPct : null;
    const exit = p ? p.exitLine : null;
    view.innerHTML = subNav("", c.mode) + `
      <div class="coinH"><div class="name">${esc(c.name)} <span class="shield ${shCls}">🛡 ${sh.audited ? `${sh.passed}/${sh.of}` : "—"}</span></div>
        <div class="sub">${esc(c.subtitle)}</div>
        <div class="px">${price(p ? p.price : c.price)}</div>
        ${chg != null ? `<div class="chg ${chg >= 0 ? "green" : "red"}">${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(1)}% since entry</div>` : ""}</div>
      <div class="chartBox" style="height:240px"><canvas id="coinChart"></canvas><div class="chartEmpty" id="coinEmpty" hidden>No candles yet</div></div>
      <div class="tiles"><div class="tile"><div class="k">MC</div><div class="v">${big(c.mcUsd)}</div></div>
        <div class="tile"><div class="k">Liquidity</div><div class="v">${big(c.liquidityUsd)}</div></div>
        <div class="tile"><div class="k">Holders</div><div class="v">${c.holders == null ? "—" : Number(c.holders).toLocaleString("en-US")}</div></div></div>
      ${p ? `<div class="posRow"><span>${esc(p.line)}</span><span class="${p.pnlUsd >= 0 ? "green" : "red"}">${p.pnlUsd == null ? "" : (p.pnlUsd >= 0 ? "+" : "-") + "$" + Math.abs(p.pnlUsd).toFixed(2)}</span></div>` : ""}
      <div class="btnRow">${ext(c.link, "Open on FOMO", "btn primary")}${p ? `<button class="btn danger" id="sellNow">Sell now</button>` : ""}</div>
      ${c.hasAudit ? `<div class="btnRow" style="margin-top:10px"><a class="btn" href="#audit/${encodeURIComponent(c.mint)}">Audit</a></div>` : ""}
      <h2>Orders</h2><div class="list">${(c.orders || []).length ? c.orders.map(o => `<div class="item"><div class="ic ${o.side === "buy" ? "bought" : "sold"}">${o.side === "buy" ? "↗" : "↘"}</div>
          <div class="mid"><div class="t">${o.side === "buy" ? "Buy" : "Sell " + (o.pct || 100) + "%"} · ${esc(o.status)}</div><div class="s">${esc(o.bot || "")} · ${hhmm(o.ts)}${o.quote ? " · " + esc(o.quote) : ""}</div></div>
          <div class="v">${usd(o.fillUsd != null ? o.fillUsd : o.usd)}<div class="s" style="font-weight:400;font-size:13px;color:var(--secondary)">${o.fee ? esc(o.fee) + " fee" : ""}</div></div></div>`).join("") : `<div class="empty">Nothing yet tonight</div>`}</div>`;
    const ok = MiniChart.candles($("#coinChart"), c.candles, { lines: exit != null ? [{ y: exit, color: "#ff9f0a", dash: [6, 5], label: p.exitKind === "trail" ? "trail" : "stop" }] : [] });
    $("#coinEmpty").hidden = !!ok;
    const sb = $("#sellNow"); if (sb) sb.onclick = () => sellSheet(c);
    bindBack();
  }
  function sellSheet(c) {
    const sh = $("#sheet"), box = sh.querySelector(".sheetBox");
    let n = "100";
    const draw = (confirmed) => {
      box.innerHTML = `<div class="grab"></div><h4>Sell ${esc(c.symbol)}</h4>
        <div class="seg" id="segPct">${["25", "50", "100"].map(k => `<button data-n="${k}" class="${k === n ? "on" : ""}">${k}%</button>`).join("")}</div>
        ${confirmed ? `<div class="sec small">Send this to the desk on Telegram:</div><div class="cmd">${esc(c.sellCommands[n])}</div>
          <div class="btnRow"><button class="btn" id="copyCmd">Copy</button><button class="btn" id="closeSheet">Done</button></div>`
          : `<button class="btn danger" id="confirmSell" style="width:100%">Confirm sell</button>
             <div class="note">In this setup sells go through Telegram: Confirm sell shows the command to send.</div>`}`;
      box.querySelector("#segPct").onclick = e => { if (e.target.dataset.n) { n = e.target.dataset.n; draw(confirmed); } };
      const cf = box.querySelector("#confirmSell"); if (cf) cf.onclick = () => draw(true);
      const cp = box.querySelector("#copyCmd");
      if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(c.sellCommands[n]); cp.textContent = "Copied"; } catch (e) { cp.textContent = "Select the text"; } };
      const cl = box.querySelector("#closeSheet"); if (cl) cl.onclick = () => { sh.hidden = true; };
    };
    draw(false); sh.hidden = false;
    sh.onclick = e => { if (e.target === sh) sh.hidden = true; };
  }
  function noteSheet(title, text, copy) {
    const sh = $("#sheet"), box = sh.querySelector(".sheetBox");
    box.innerHTML = `<div class="grab"></div><h4>${esc(title)}</h4><div class="sec">${esc(text)}</div>${copy ? `<div class="cmd" style="font-size:14px">${esc(copy)}</div>` : ""}
      <div class="btnRow" style="margin-top:14px"><button class="btn" id="closeSheet">Done</button></div>`;
    sh.hidden = false; box.querySelector("#closeSheet").onclick = () => { sh.hidden = true; };
    sh.onclick = e => { if (e.target === sh) sh.hidden = true; };
  }
  function searchSheet() {
    const sh = $("#sheet"), box = sh.querySelector(".sheetBox");
    const coins = new Map();
    (S.state.positions || []).forEach(p => coins.set(p.mint, p.symbol));
    (S.activity.rows || []).forEach(r => r.mint && !coins.has(r.mint) && coins.set(r.mint, r.symbol));
    const list = q => [...coins].filter(([m, s]) => !q || (s || "").toLowerCase().includes(q) || m.toLowerCase().startsWith(q)).slice(0, 20)
      .map(([m, s]) => `<div class="kv act" data-go="#coin/${encodeURIComponent(m)}"><span>${esc(s)}</span><span class="val mono small">${esc(m.slice(0, 4))}…${esc(m.slice(-4))}</span></div>`).join("") || `<div class="empty">Nothing yet tonight</div>`;
    box.innerHTML = `<div class="grab"></div><h4>Search tonight's coins</h4>
      <input id="q" placeholder="Name or address" autocomplete="off" style="width:100%;margin:10px 0;padding:12px;border-radius:12px;border:0;background:#2c2c2e">
      <div class="list" id="qres">${list("")}</div>`;
    sh.hidden = false;
    box.querySelector("#q").oninput = e => { box.querySelector("#qres").innerHTML = list(e.target.value.trim().toLowerCase()); };
    box.onclick = e => { const go = e.target.closest("[data-go]"); if (go) { sh.hidden = true; location.hash = go.dataset.go; } };
    sh.onclick = e => { if (e.target === sh) sh.hidden = true; };
  }

  // ---------- AUDIT ----------
  function renderAudit(mint) {
    const a = S.audit[mint];
    if (!a) { view.innerHTML = subNav("Audit") + loading(); bindBack(); return; }
    if (a.missing) { view.innerHTML = subNav("Audit", S.state && S.state.mode) + `<div class="empty">No audit for this coin yet</div>`; bindBack(); return; }
    const sc = a.score;
    const L = a.layers || [], byN = {}; L.forEach(l => { byN[l.layer] = l; });
    view.innerHTML = subNav("Audit", S.state && S.state.mode) + `
      <div class="coinH"><div class="name">${esc(a.symbol)} <span class="shield ${!L.length ? "na" : a.passed === 8 ? "" : "warn"}">🛡 ${L.length ? a.passed + "/8" : "—"}</span></div>
        <div class="sub">Audit ${hhmmss(a.auditTs)}</div></div>
      <div class="card"><div class="discs"><div class="beam"></div>${[1, 2, 3, 4, 5, 6, 7, 8].map(n => { const l = byN[n]; return `<div class="disc ${l && l.pass === true ? "p" : l && l.pass === false ? "f" : ""}">${n}</div>`; }).join("")}</div></div>
      <div class="card" style="display:flex;align-items:center;gap:16px">${ring(sc ? sc.score : null, sc ? sc.min : 70, "lg")}
        <div style="flex:1"><div style="font-size:17px;font-weight:600">${sc ? (sc.pass ? "Cleared" : "Rejected") : "No score yet"}</div>
        <div class="sec small">${sc && sc.reason ? esc(sc.reason) : sc ? "Gate " + esc(sc.min) : ""}</div></div></div>
      <div class="list">${L.length ? L.map(l => `<div class="item" style="cursor:default"><div class="ic ${l.pass === true ? "sold" : l.pass === false ? "stopped" : "rejected"}" style="width:30px;height:30px;flex-basis:30px;font-size:14px">${l.pass === true ? "✓" : l.pass === false ? "✕" : "?"}</div>
          <div class="mid"><div class="t">${esc(l.layer)} · ${esc(l.name)}</div><div class="s">${esc(l.value || "")}${l.source ? " · " + esc(l.source) : ""}</div></div></div>`).join("")
        : `<div class="empty">Nothing yet tonight</div>`}
        <div class="item" style="cursor:default"><div class="ic rejected" style="width:30px;height:30px;flex-basis:30px;font-size:14px">S</div><div class="mid"><div class="t">${esc(a.social)}</div></div></div></div>
      <div class="note">One red layer stops the coin, whatever the score or Social says.</div>
      <div class="btnRow">${ext(a.link, "Open on FOMO", "btn primary")}<a class="btn" href="#coin/${encodeURIComponent(a.mint)}">Coin</a></div>`;
    bindBack();
  }
  function bindBack() { const b = $("#back"); if (b) b.onclick = () => { if (history.length > 1) history.back(); else location.hash = "#activity"; }; }

  // ---------- routing, offline row, polling ----------
  function current() { const h = location.hash.replace(/^#/, "") || "home"; const [name, arg] = h.split("/"); return { name, arg: arg && decodeURIComponent(arg) }; }
  function offlineRow() {
    const el = $("#offline");
    const stale = S.state && Date.now() / 1000 - S.state.ts > STALE_S;
    if (!DP || S.failing || stale) {
      const n = Math.max(0, Math.ceil((S.nextPoll - Date.now()) / 1000));
      const last = S.state ? hhmm(S.state.ts) : "—";
      el.hidden = false; el.textContent = `Desk offline · retrying in ${n}s · last update ${last}`;
    } else el.hidden = true;
  }
  function render() {
    const r = current();
    const tab = { coin: "activity", audit: "activity" }[r.name] || r.name;
    document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
    offlineRow();
    if (!S.loaded) {   // never blank, never a made-up number: pulse blocks until the first good read
      view.innerHTML = loading() + (DP ? "" : `<div class="note" style="margin-top:16px">Open the desk link once on this phone. It ends in #d=… and is saved here after that.</div>`);
      return;
    }
    const y = window.scrollY;
    if (r.name === "home") renderHome();
    else if (r.name === "bots") renderBots();
    else if (r.name === "activity") renderActivity();
    else if (r.name === "account") renderAccount(r.arg);
    else if (r.name === "coin" && r.arg) renderCoin(r.arg);
    else if (r.name === "audit" && r.arg) renderAudit(r.arg);
    else renderHome();
    if (render.keepScroll) window.scrollTo(0, y);
  }
  async function poll() {
    S.nextPoll = Date.now() + POLL_S * 1000;
    if (!DP) { S.failing = true; render(); return; }
    const r = current();
    try {
      const [st, ch, act, bots] = await Promise.all(["state.json", "chart.json", "activity.json", "bots.json"].map(getJSON));
      Object.assign(S, { state: st, chart: ch, activity: act, bots, failing: false, loaded: true, lastOk: Date.now() });
      const miss = (store, k) => e => (e && e.status === 404 && !(store[k] && !store[k].missing)) ? { missing: true } : store[k];
      if (r.name === "coin" && r.arg) S.coin[r.arg] = await getJSON(`coin/${r.arg}.json`).catch(miss(S.coin, r.arg));
      if (r.name === "audit" && r.arg) S.audit[r.arg] = await getJSON(`audit/${r.arg}.json`).catch(miss(S.audit, r.arg));
    } catch (e) {
      S.failing = true;            // keep the last good numbers on screen; the red row says what's going on
      if (S.loaded) { offlineRow(); return; }
    }
    if (document.querySelector(".sheet:not([hidden])") || document.querySelector(".full")) { offlineRow(); return; }
    render.keepScroll = true; render(); render.keepScroll = false;
  }

  view.addEventListener("click", e => {
    if (e.target.closest("[data-ext]")) { e.stopPropagation(); return; }
    const go = e.target.closest("[data-go]"); if (go) location.hash = go.dataset.go;
  });
  window.addEventListener("hashchange", () => {
    if (/[#&]d=/.test(location.hash)) { DP = takeDataPath(); S.loaded = false; poll(); return; }
    window.scrollTo(0, 0); render();
    const r = current(); if ((r.name === "coin" || r.name === "audit") && r.arg) poll();
  });
  window.addEventListener("resize", () => { if (current().name === "home" && S.loaded) drawBalance(false); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  setInterval(() => { if (!document.hidden && Date.now() >= S.nextPoll) poll(); }, 1000);
  setInterval(() => { if (!document.hidden && current().name === "home") refreshScreen(); }, SCREEN_MS);
  setInterval(() => { updateFrame(); offlineRow(); }, 1000);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  window.__desk = { S, poll, render };
  render(); poll();
})();
