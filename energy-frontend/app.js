import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  enableNetwork,
  disableNetwork
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ==========================================
// CONNECTION STATE
// ==========================================
let energyUnsub    = null;
let statusUnsub    = null;
let lastUpdateTime = Date.now();
let watchdogTimer  = null;
let reconnectTimer = null;
let isReconnecting = false;

const STALE_THRESHOLD_MS = 15000;
const RECONNECT_DELAY_MS = 3000;

// Previous status for alert change detection
const prevStatus = { theft: null, overload: null, wire: null };

function setConnectionBadge(state) {
  const dot       = document.querySelector(".conn-dot");
  const label     = document.querySelector(".conn-label");
  const liveBadge = document.getElementById("liveBadge");
  const liveDot   = document.getElementById("liveDot");
  const liveText  = document.getElementById("liveText");
  const secConn   = document.getElementById("sec-conn");

  if (state === "live") {
    isReconnecting = false;
    if (dot)      { dot.style.background = "var(--accent-teal)"; dot.style.boxShadow = "0 0 8px var(--accent-teal)"; }
    if (label)    label.textContent = "LIVE CONNECTION";
    if (liveBadge) liveBadge.className = "live-badge live-state";
    if (liveDot)  liveDot.style.background = "var(--accent-teal)";
    if (liveText) liveText.textContent = "LIVE";
    if (secConn)  { secConn.textContent = "Live"; secConn.className = "bi-val teal-val"; }
  } else if (state === "stale") {
    if (dot)      { dot.style.background = "var(--accent-amber)"; dot.style.boxShadow = "0 0 8px var(--accent-amber)"; }
    if (label)    label.textContent = "NO NEW DATA";
    if (liveBadge) liveBadge.className = "live-badge stale-state";
    if (liveDot)  liveDot.style.background = "var(--accent-amber)";
    if (liveText) liveText.textContent = "NO DATA";
    if (secConn)  { secConn.textContent = "No new data"; secConn.className = "bi-val amber-val"; }
  } else {
    if (dot)      { dot.style.background = "var(--accent-red)"; dot.style.boxShadow = "0 0 8px var(--accent-red)"; }
    if (label)    label.textContent = "RECONNECTING...";
    if (liveBadge) liveBadge.className = "live-badge offline-state";
    if (liveDot)  liveDot.style.background = "var(--accent-red)";
    if (liveText) liveText.textContent = "OFFLINE";
    if (secConn)  { secConn.textContent = "Reconnecting..."; secConn.className = "bi-val red-val"; }
  }
}

function startWatchdog() {
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = setInterval(() => {
    const age = Date.now() - lastUpdateTime;
    if (age > STALE_THRESHOLD_MS && !isReconnecting) {
      setConnectionBadge("stale");
      forceReconnect();
    }
  }, 5000);
}

async function forceReconnect() {
  if (isReconnecting) return;
  isReconnecting = true;
  setConnectionBadge("disconnected");
  if (energyUnsub) { try { energyUnsub(); } catch(e) {} energyUnsub = null; }
  if (statusUnsub) { try { statusUnsub(); } catch(e) {} statusUnsub = null; }
  try {
    await disableNetwork(db);
    await new Promise(r => setTimeout(r, RECONNECT_DELAY_MS));
    await enableNetwork(db);
    await new Promise(r => setTimeout(r, 500));
  } catch(e) { console.error("[Reconnect]", e); }
  attachListeners();
}

function scheduleReconnect() {
  if (isReconnecting || reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; forceReconnect(); }, RECONNECT_DELAY_MS);
}

// ==========================================
// ATTACH FIREBASE LISTENERS
// ==========================================
function attachListeners() {
  const energyQuery = query(collection(db, "energyData"), orderBy("time", "desc"), limit(1));
  const statusQuery = query(collection(db, "statusData"), orderBy("time", "desc"), limit(1));

  energyUnsub = onSnapshot(energyQuery, { includeMetadataChanges: false },
    snap => { snap.forEach(doc => { lastUpdateTime = Date.now(); setConnectionBadge("live"); handleEnergyData(doc.data()); }); },
    err  => { console.error("[Energy]", err); setConnectionBadge("disconnected"); scheduleReconnect(); }
  );

  statusUnsub = onSnapshot(statusQuery, { includeMetadataChanges: false },
    snap => { snap.forEach(doc => { lastUpdateTime = Date.now(); setConnectionBadge("live"); handleStatusData(doc.data()); }); },
    err  => { console.error("[Status]", err); scheduleReconnect(); }
  );
}

// ==========================================
// CHART CONFIG
// ==========================================
const METRICS = {
  energy:  { label:"Energy",      unit:"kWh", color:"#00e5ff", glow:"rgba(0,229,255,0.3)"   },
  power:   { label:"Power",       unit:"W",   color:"#ffb300", glow:"rgba(255,179,0,0.3)"   },
  voltage: { label:"Voltage",     unit:"V",   color:"#b267ff", glow:"rgba(178,103,255,0.3)" },
  current: { label:"Current",     unit:"A",   color:"#00ffb3", glow:"rgba(0,255,179,0.3)"   },
  temp:    { label:"Temperature", unit:"°C",  color:"#ff3d57", glow:"rgba(255,61,87,0.3)"   },
};

let activeMetric = "energy";
const chartBuffer = { energy:[], power:[], voltage:[], current:[], temp:[], labels:[] };
const MAX_POINTS  = 30;

const energyChart = new Chart(document.getElementById("energyChart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      data: [], borderColor: "#00e5ff",
      backgroundColor: ctx => {
        const { ctx: c, chartArea } = ctx.chart;
        if (!chartArea) return "transparent";
        const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, "rgba(0,229,255,0.3)"); g.addColorStop(1, "rgba(0,229,255,0)");
        return g;
      },
      borderWidth:2.5, tension:0.4, fill:true,
      pointRadius:4, pointBackgroundColor:"#00e5ff", pointBorderColor:"#050d1a", pointBorderWidth:2, pointHoverRadius:6,
    }]
  },
  options: {
    responsive:true, maintainAspectRatio:false,
    interaction:{ mode:"index", intersect:false },
    plugins: {
      legend:{ display:false },
      tooltip:{
        backgroundColor:"rgba(8,20,40,0.95)", borderColor:"rgba(0,229,255,0.35)", borderWidth:1,
        titleColor:"#5a7fa0", bodyColor:"#00e5ff",
        titleFont:{ family:"'Share Tech Mono',monospace", size:11 },
        bodyFont:{ family:"'Share Tech Mono',monospace", size:14 },
        padding:12, displayColors:false,
        callbacks:{ title:i=>i[0].label, label:i=>`  ${Number(i.raw).toFixed(2)} ${METRICS[activeMetric].unit}` }
      }
    },
    scales:{
      x:{ grid:{ color:"rgba(0,200,255,0.06)", drawBorder:false }, ticks:{ color:"#2a4060", font:{ family:"'Share Tech Mono',monospace", size:10 }, maxTicksLimit:6 }, border:{ display:false } },
      y:{ grid:{ color:"rgba(0,200,255,0.06)", drawBorder:false }, ticks:{ color:"#2a4060", font:{ family:"'Share Tech Mono',monospace", size:10 }, padding:8, callback:v=>Number(v).toFixed(2) }, border:{ display:false } }
    }
  }
});

window.switchMetric = function(key) {
  activeMetric = key;
  const m = METRICS[key];
  document.querySelectorAll(".chart-metric-btn").forEach(b => b.classList.toggle("active", b.dataset.metric === key));
  const ll = document.getElementById("chartLegendLabel");
  if (ll) ll.textContent = `${m.label} · ${m.unit} Real-time`;
  energyChart.data.labels = [...chartBuffer.labels];
  energyChart.data.datasets[0].data = [...chartBuffer[key]];
  energyChart.data.datasets[0].borderColor = m.color;
  energyChart.data.datasets[0].pointBackgroundColor = m.color;
  energyChart.data.datasets[0].backgroundColor = ctx => {
    const { ctx:c, chartArea } = ctx.chart;
    if (!chartArea) return "transparent";
    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, m.glow); g.addColorStop(1, "rgba(0,0,0,0)");
    return g;
  };
  energyChart.options.plugins.tooltip.borderColor = m.color + "99";
  energyChart.options.plugins.tooltip.bodyColor    = m.color;
  energyChart.update();
};

// ==========================================
// SPARKLINES
// ==========================================
const sparkData = { V:[], A:[], W:[], E:[], T:[] };

function makeSparkline(id, color) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  return new Chart(canvas, {
    type:"line",
    data:{ labels:Array(10).fill(""), datasets:[{ data:Array(10).fill(null), borderColor:color, borderWidth:1.5, tension:0.4, fill:false, pointRadius:0 }] },
    options:{ responsive:false, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ enabled:false } }, scales:{ x:{ display:false }, y:{ display:false } }, animation:{ duration:300 } }
  });
}

const sparks = {
  V: makeSparkline("sparkV","#00e5ff"),
  A: makeSparkline("sparkA","#b267ff"),
  W: makeSparkline("sparkW","#ffb300"),
  E: makeSparkline("sparkE","#00ffb3"),
  T: makeSparkline("sparkT","#ff3d57"),
};

function pushSpark(key, val) {
  const s = sparks[key]; if (!s) return;
  sparkData[key].push(val);
  if (sparkData[key].length > 10) sparkData[key].shift();
  s.data.datasets[0].data = [...sparkData[key]];
  s.update("none");
}

// ==========================================
// HELPERS
// ==========================================
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setBar(id, val, max) { const el = document.getElementById(id); if (el) el.style.width = Math.min((val/max)*100, 100)+"%"; }

const RATE = 7; // ₹ per kWh

function formatBill(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  const el = document.getElementById("bill");
  if (el) {
    const len = String(Math.floor(n)).length;
    el.style.fontSize = len>=7?"14px":len>=6?"16px":len>=5?"18px":len>=4?"20px":"";
  }
  return "₹" + n.toFixed(2);
}

// ==========================================
// ALERT SYSTEM
// ==========================================
function pushAlert(type, message) {
  const now = new Date().toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", second:"2-digit" });

  // Update alert log
  const logEl = document.getElementById("alertLog");
  if (logEl) {
    const empty = logEl.querySelector(".alert-empty");
    if (empty) empty.remove();
    const item = document.createElement("div");
    item.className = "alert-log-item " + type;
    item.innerHTML = `<span class="ali-time">${now}</span><span class="ali-msg">${message}</span>`;
    logEl.prepend(item);
  }

  // Show popup
  const popup = document.getElementById("alertPopup");
  const apTitle = document.getElementById("apTitle");
  const apMsg   = document.getElementById("apMsg");
  if (popup && apTitle && apMsg) {
    apTitle.textContent = type === "danger" ? "⚠ ALERT TRIGGERED" : "✓ STATUS CLEARED";
    apMsg.textContent   = message;
    popup.className = "alert-popup show " + type;
    clearTimeout(popup._hideTimer);
    popup._hideTimer = setTimeout(() => popup.classList.remove("show"), 5000);
  }

  window.showToast(message, type === "danger" ? "error" : "success");
}

// ==========================================
// HANDLE ENERGY DATA
// ==========================================
function handleEnergyData(d) {
  const v = Number(d.voltage);
  const a = Number(d.current);
  const w = Number(d.power);
  const e = Number(d.energy);
  const t = Number(d.temp);
  const b = d.bill;
  const now = new Date().toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", second:"2-digit" });

  // --- Dashboard ---
  setText("voltage", v.toFixed(1)); setText("current", a.toFixed(2));
  setText("power",   w.toFixed(1)); setText("energy",  e.toFixed(3));
  setText("temp",    t.toFixed(1)); setText("bill",     formatBill(b));
  setBar("voltageBar",v,260); setBar("currentBar",a,20);
  setBar("powerBar",w,5000); setBar("energyBar",e,100); setBar("tempBar",t,80);

  // --- Live Data page ---
  setText("ld-voltage",v.toFixed(1)); setText("ld-current",a.toFixed(2));
  setText("ld-power",w.toFixed(1));   setText("ld-energy",e.toFixed(3));
  setText("ld-temp",t.toFixed(1));    setText("ld-bill",formatBill(b));
  setBar("ld-voltageBar",v,260); setBar("ld-currentBar",a,20);
  setBar("ld-powerBar",w,5000); setBar("ld-energyBar",e,100); setBar("ld-tempBar",t,80);
  setText("lastUpdateLabel", now);

  // --- Billing page ---
  setText("bill-hero",   formatBill(b));
  setText("bill-energy", e.toFixed(3) + " kWh");
  setText("bill-power",  w.toFixed(1) + " W");
  const cph = (w/1000)*RATE;
  setText("cost-per-hour",  "₹" + cph.toFixed(4));
  setText("cost-per-day",   "₹" + (cph*24).toFixed(2));
  setText("cost-per-month", "₹" + (cph*24*30).toFixed(2));
  setText("units-per-hour", (w/1000).toFixed(4) + " kWh");

  // --- Sparklines ---
  pushSpark("V",v); pushSpark("A",a); pushSpark("W",w); pushSpark("E",e); pushSpark("T",t);

  // --- Chart buffer ---
  chartBuffer.labels.push(now);
  chartBuffer.energy.push(e); chartBuffer.power.push(w);
  chartBuffer.voltage.push(v); chartBuffer.current.push(a); chartBuffer.temp.push(t);
  if (chartBuffer.labels.length > MAX_POINTS) {
    chartBuffer.labels.shift();
    Object.keys(METRICS).forEach(k => chartBuffer[k].shift());
  }
  energyChart.data.labels = [...chartBuffer.labels];
  energyChart.data.datasets[0].data = [...chartBuffer[activeMetric]];
  energyChart.update();
}

// ==========================================
// HANDLE STATUS DATA
// ==========================================
function handleStatusData(d) {
  const theftAlert    = !!d.theft;
  const overloadAlert = !!d.overload;
  const wireAlert     = !!d.wire_tempered;

  // Helper to apply to any element
  function applyVal(id, text, isAlert, baseClass) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className   = baseClass + (isAlert ? " danger" : " safe");
  }

  // Dashboard status
  applyVal("theft",    theftAlert    ? "⚠ THEFT DETECTED" : "SAFE",   theftAlert,    "status-val");
  applyVal("overload", overloadAlert ? "⚠ OVERLOAD"       : "NORMAL", overloadAlert, "status-val");
  applyVal("wire",     wireAlert     ? "⚠ TAMPERED"       : "SAFE",   wireAlert,     "status-val");

  // Alerts page values
  applyVal("al-theft",    theftAlert    ? "⚠ THEFT DETECTED" : "SAFE",   theftAlert,    "asc-val");
  applyVal("al-overload", overloadAlert ? "⚠ OVERLOAD"       : "NORMAL", overloadAlert, "asc-val");
  applyVal("al-wire",     wireAlert     ? "⚠ TAMPERED"       : "SAFE",   wireAlert,     "asc-val");

  // Alerts page cards
  ["as-theft","as-overload","as-wire"].forEach((id, i) => {
    const c = document.getElementById(id);
    if (c) c.className = "alert-status-card " + ([theftAlert,overloadAlert,wireAlert][i] ? "danger" : "safe");
  });

  // Security page cards + values
  const secItems = [
    { card:"sec-theft",    val:"sec-theft-val",    text: theftAlert    ? "⚠ THEFT DETECTED":"SAFE",   isAlert:theftAlert    },
    { card:"sec-overload", val:"sec-overload-val", text: overloadAlert ? "⚠ OVERLOAD"      :"NORMAL", isAlert:overloadAlert },
    { card:"sec-wire",     val:"sec-wire-val",     text: wireAlert     ? "⚠ TAMPERED"      :"SAFE",   isAlert:wireAlert     },
  ];
  secItems.forEach(({ card, val, text, isAlert }) => {
    applyVal(val, text, isAlert, "sec-val");
    const c = document.getElementById(card);
    if (c) c.className = "security-card" + (isAlert ? " danger" : "");
  });

  // Security info
  const slu = document.getElementById("sec-last-update");
  if (slu) slu.textContent = new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});

  // Fire alerts on state change
  if (prevStatus.theft    !== null && prevStatus.theft    !== theftAlert)    pushAlert(theftAlert    ? "danger":"safe", theftAlert    ? "⚠ Theft detected on the line!"        : "✓ Theft alert cleared.");
  if (prevStatus.overload !== null && prevStatus.overload !== overloadAlert) pushAlert(overloadAlert ? "danger":"safe", overloadAlert ? "⚠ Overload! Exceeding max load limit." : "✓ Overload alert cleared.");
  if (prevStatus.wire     !== null && prevStatus.wire     !== wireAlert)     pushAlert(wireAlert     ? "danger":"safe", wireAlert     ? "⚠ Wire tamper detected!"               : "✓ Wire tamper alert cleared.");

  prevStatus.theft    = theftAlert;
  prevStatus.overload = overloadAlert;
  prevStatus.wire     = wireAlert;

  // MAX_LOAD sync
  if (d.MAX_LOAD != null) {
    const val = Number(d.MAX_LOAD);
    ["maxLoadInput","maxLoadInput2"].forEach(id => {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el) el.value = val;
    });
    setText("bill-maxload", val + " W");
    setText("sec-maxload",  val + " W");
  }

  // Relay sync
  const relayOn = !!d.relay;
  relayState = relayOn;
  syncRelayUI(relayOn);
  const sri = document.getElementById("sec-relay-state");
  if (sri) { sri.textContent = relayOn ? "ON" : "OFF"; sri.className = "bi-val " + (relayOn ? "teal-val":"red-val"); }
}

// ==========================================
// RELAY UI
// ==========================================
function syncRelayUI(on) {
  [["relayBtn","relayText"],["relayBtn2","relayText2"]].forEach(([btnId, txtId]) => {
    const btn = document.getElementById(btnId);
    const txt = document.getElementById(txtId);
    if (!btn) return;
    btn.classList.toggle("on", on);
    if (txt) txt.textContent = on ? "RELAY ON" : "RELAY OFF";
  });
}

// ==========================================
// NETWORK EVENTS
// ==========================================
window.addEventListener("online",  () => forceReconnect());
window.addEventListener("offline", () => setConnectionBadge("disconnected"));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastUpdateTime > STALE_THRESHOLD_MS) forceReconnect();
});

// ==========================================
// CONTROL API
// ==========================================
let relayState = false;

async function sendControl(relay, maxLoad, billReset) {
  try {
    const res = await fetch("http://18.61.195.63:3000/control", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ relay, max_load: maxLoad, bill_reset: billReset })
    });
    return res.ok;
  } catch(e) { console.error("[Control]", e); return false; }
}

function getMaxLoad(preferInput) {
  const el = document.getElementById(preferInput || "maxLoadInput");
  return el ? Number(el.value) || 2000 : 2000;
}

// Relay buttons
["relayBtn","relayBtn2"].forEach(id => {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const newState = !relayState;
    const ok = await sendControl(newState, getMaxLoad(), false);
    if (ok) { relayState = newState; syncRelayUI(newState); window.showToast(newState ? "Relay turned ON" : "Relay turned OFF", "success"); }
    else    { window.showToast("Relay command failed", "error"); }
  });
});

// Save load buttons
document.getElementById("saveLoadBtn").addEventListener("click", async () => {
  const v = getMaxLoad("maxLoadInput");
  const ok = await sendControl(relayState, v, false);
  window.showToast(ok ? `Max load set to ${v}W` : "Failed to update load", ok ? "success":"error");
});
document.getElementById("saveLoadBtn2").addEventListener("click", async () => {
  const v = getMaxLoad("maxLoadInput2");
  const ok = await sendControl(relayState, v, false);
  window.showToast(ok ? `Max load set to ${v}W` : "Failed to update load", ok ? "success":"error");
});

// Reset bill buttons
["resetBillBtn","resetBillBtn2"].forEach(id => {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const ok = await sendControl(relayState, getMaxLoad(), true);
    window.showToast(ok ? "Billing cycle reset" : "Reset failed", ok ? "info":"error");
  });
});

// ==========================================
// START
// ==========================================
attachListeners();
startWatchdog();