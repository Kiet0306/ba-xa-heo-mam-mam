(function () {
"use strict";
const $ = s => document.querySelector(s);
const API = (window.BXH_API || "").trim();
const DEMO = /[?&]demo=1/.test(location.search);
const S = {
  places: [], anchors: [], filter: "all", sort: "near", q: "",
  from: ls("from") || "gps", gps: null, gpsWatch: null,
  code: ls("code") || "", name: ls("name") || "", status: null, selId: null
};

/* ---------- helpers ---------- */
function ls(k, v) {
  try { if (v === undefined) return localStorage.getItem("bxh-" + k); if (v === null) localStorage.removeItem("bxh-" + k); else localStorage.setItem("bxh-" + k, v); } catch (e) { return null; }
}
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; el.append(c instanceof Node ? c : document.createTextNode(String(c))); }
  return el;
}
function svgUse(id, cls) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); if (cls) s.setAttribute("class", cls); const u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "#" + id); s.append(u); return s; }
function icon(path) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("class", "i"); s.setAttribute("viewBox", "0 0 24 24"); s.innerHTML = path; return s; }
const IC = {
  back: '<path d="M15 18l-6-6 6-6"/>', nav: '<path d="M3 11l18-8-8 18-2-8z"/>', map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  play: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M10 8l6 4-6 4z"/>', check: '<path d="M5 12l5 5L20 7"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/>', refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'
};
function safeUrl(u) { return /^https:\/\//i.test(u || "") ? u : null; }
function safeImg(u) { return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(u || "") ? u : safeUrl(u); }
const nf1 = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("vi-VN");
function compact(n) { return n >= 1000 ? nf1.format(n / 1000) + "k" : nf0.format(n); }
function toast(t, ms) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, ms || 3200); }
function nameOf(p) { return p.ten || "Quán chưa rõ tên"; }
function origin() {
  if (S.from === "gps") return S.gps;
  const a = S.anchors.find(x => x.id === S.from); return a ? { lat: a.lat, lng: a.lng } : null;
}
function km(p, o) {
  o = o || origin(); if (!o || typeof p.lat !== "number" || typeof p.lng !== "number") return null;
  const r = Math.PI / 180, dLa = (p.lat - o.lat) * r, dLo = (p.lng - o.lng) * r;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(o.lat * r) * Math.cos(p.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}
function kmText(d) { return d == null ? null : d < 1 ? nf0.format(Math.round(d * 100) * 10) + " m" : nf1.format(d) + " km"; }
function walkText(d) { if (d == null) return null; const m = Math.round(d * 1.3 / 4.8 * 60); return m <= 25 ? m + " phút đi bộ" : Math.max(3, Math.round(d * 1.3 / 22 * 60)) + " phút chạy xe"; }
const STEP = { cho: "Đang gửi video", video: "Đang xem video", google: "Đang tra Google", vitri: "Đang tìm vị trí" };
function busy(p) { return p.trangThai === "dang-tim" && Date.now() - (p.batDau || p.taoLuc || 0) < 6 * 60e3; }
function verdict(p) {
  if (busy(p)) return { t: (STEP[p.buoc] || "Đang tìm hiểu") + "...", c: "wait" };
  if (p.trangThai === "dang-tim") return { t: "Chưa tìm xong", c: "wait" };
  if (p.trangThai === "chua-ro") return { t: "Chưa rõ tên quán", c: "wait" };
  const s = p.google && p.google.sao;
  if (!s) {
    if (p.trangThai === "moi") return { t: "Đang chờ đọc", c: "wait" };
    if (p.reviewerKhen && !p.reviewerChe) return { t: "Reviewer khen", c: "good" };
    if (p.reviewerKhen) return { t: "Có khen có chê", c: "ok" };
    return { t: "Xem sao trên Google", c: "wait" };
  }
  if (s >= 4.5) return { t: "Ngon, nên đi", c: "good" };
  if (s >= 4.0) return { t: "Ổn, đi thử được", c: "ok" };
  return { t: "Bị chê nhiều", c: "bad" };
}
function mapsQuery(p) { return [p.ten, p.diaChi].filter(Boolean).join(", "); }
function mapsUrl(p) { const q = mapsQuery(p); return q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q) : null; }
function dirUrl(p) {
  if (typeof p.lat === "number") return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(mapsQuery(p) || (p.lat + "," + p.lng));
  const q = mapsQuery(p); return q ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(q) : null;
}
function errText(code) {
  return ({
    sai_ma: "Mã nhóm chưa đúng.", tam_khoa: "Nhập sai mã nhiều lần. Chờ 10 phút rồi thử lại.", chua_cai_dat: "Web chưa được cài đặt. Vào Cài đặt để tạo mã nhóm.",
    da_cai_dat: "Web đã có mã nhóm rồi.", ma_qua_ngan: "Mã nhóm cần ít nhất 4 ký tự.", thieu_thong_tin: "Dán link TikTok hoặc gõ tên quán trước nha.",
    chia_khong_hop_le: "Chìa Gemini chưa đúng dạng.", khong_thay_quan: "Không tìm thấy quán này nữa.", mang: "Mất mạng hoặc Google đang chậm. Thử lại sau ít phút."
  })[code] || "Có lỗi: " + code;
}

/* ---------- API ---------- */
async function apiGet(action) {
  if (DEMO) return demoData(action);
  if (!API) throw new Error("chua_noi");
  let r; try { r = await fetch(API + "?action=" + action, { cache: "no-store" }); } catch (e) { throw new Error("mang"); }
  const j = await r.json(); if (!j.ok) throw new Error(j.error); return j;
}
async function apiPost(body) {
  if (DEMO) { await new Promise(r => setTimeout(r, 900)); return { ok: true, place: S.places.find(p => p.id === body.id) || S.places[0] }; }
  if (!API) throw new Error("chua_noi");
  let r;
  try { r = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ code: S.code, ten: S.name }, body)) }); }
  catch (e) { throw new Error("mang"); }
  const j = await r.json(); if (!j.ok) throw new Error(j.error); return j;
}
async function load(quiet) {
  try {
    const j = await apiGet("list");
    S.places = j.places || []; S.anchors = j.anchors || [];
    try { ls("cache", JSON.stringify({ places: S.places, anchors: S.anchors })); } catch (e) {}
    banner("");
  } catch (e) {
    if (e.message === "chua_noi") banner("Web chưa nối với Google Sheet. Kiệt cần làm bước cài đặt.");
    else if (!quiet) banner("Chưa tải được danh sách mới. Đang hiện bản lưu gần nhất.");
  }
  renderFrom(); render();
  if (S.places.some(busy)) watchBusy();
  if (!$("#page").hidden && S.detailId) {
    const p = S.places.find(x => x.id === S.detailId), sig = p ? p.trangThai + p.buoc + p.capNhat : "";
    const typing = document.activeElement && /TEXTAREA|INPUT/.test(document.activeElement.tagName);
    if (S.detailSig && sig !== S.detailSig && !typing && $("#page").querySelector(".cover")) openDetailKeep(S.detailId);
    S.detailSig = sig;
  }
}
function banner(t) { const b = $("#banner"); b.textContent = t; b.hidden = !t; }
function upsert(p) { const i = S.places.findIndex(x => x.id === p.id); if (i >= 0) S.places[i] = p; else S.places.unshift(p); render(); }
async function patch(id, x) {
  if (!needCode(() => patch(id, x))) return;
  const p = S.places.find(q => q.id === id); if (!p) return;
  const old = JSON.parse(JSON.stringify(p));
  Object.assign(p, x.diem ? Object.assign({}, x, { diem: Object.assign({}, p.diem, x.diem) }) : x); render();
  try { const j = await apiPost({ action: "update", id, patch: x }); upsert(j.place); }
  catch (e) { Object.assign(p, old); render(); toast(errText(e.message)); }
}

/* ---------- map ---------- */
const dark = matchMedia("(prefers-color-scheme: dark)").matches;
const map = L.map("map", { zoomControl: false, attributionControl: true }).setView([10.7769, 106.7009], 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, className: "pinkify",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
const markers = L.layerGroup().addTo(map);
let meMarker = null, fitted = false;
function renderMarkers(list) {
  markers.clearLayers();
  const pts = [];
  list.forEach(p => {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") return;
    const v = verdict(p), s = p.google && p.google.sao;
    const html = '<div class="pin ' + v.c + (p.daDi ? " visited" : "") + (p.id === S.selId ? " sel" : "") + '"><span>' + (s ? nf1.format(s) : p.tongSo > 1 ? p.thuTu : "♥") + "</span></div>";
    const m = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", html, iconSize: [44, 44], iconAnchor: [4, 44] }), title: nameOf(p), keyboard: true });
    m.on("click", () => { select(p.id, true); openDetail(p.id); });
    markers.addLayer(m); pts.push([p.lat, p.lng]);
  });
  if (!fitted && pts.length) {
    fitted = true;
    const o = origin(); if (o) pts.push([o.lat, o.lng]);
    map.fitBounds(pts, { padding: [60, 60], maxZoom: 15 });
  }
}
function select(id, fly) {
  S.selId = id; const p = S.places.find(x => x.id === id);
  if (fly && p && typeof p.lat === "number") map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: .6 });
  render();
}

/* ---------- GPS ---------- */
function startGps(userAsked) {
  if (!("geolocation" in navigator)) { if (userAsked) toast("Máy này không hỗ trợ định vị."); return; }
  if (S.gpsWatch != null) { if (S.gps) map.flyTo([S.gps.lat, S.gps.lng], 15); return; }
  $("#locateBtn").classList.add("on");
  let first = true;
  S.gpsWatch = navigator.geolocation.watchPosition(pos => {
    S.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    ls("gpsOk", "1");
    const ll = [S.gps.lat, S.gps.lng];
    if (!meMarker) meMarker = L.marker(ll, { icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 2000, interactive: false }).addTo(map);
    else meMarker.setLatLng(ll);
    if (first) { first = false; if (S.from === "gps") { map.flyTo(ll, 15, { duration: .8 }); if (S.sort !== "near") { S.sort = "near"; $("#sort").value = "near"; } } }
    render();
  }, err => {
    $("#locateBtn").classList.remove("on");
    navigator.geolocation.clearWatch(S.gpsWatch); S.gpsWatch = null;
    if (err.code === 1) {
      ls("gpsOk", null);
      if (userAsked) showGpsHelp();
    } else if (userAsked) toast("Chưa lấy được vị trí. Ra chỗ thoáng hoặc bật Wi-Fi rồi thử lại.");
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
}
function showGpsHelp() {
  openModal([h("div", { class: "modal-body", style: "margin-top:0;padding-top:18px" },
    h("div", { class: "kicker", text: "Cần bật định vị" }),
    h("h2", { text: "Cho web biết bạn đang ở đâu" }),
    h("p", { text: "iPhone đang chặn vị trí cho Safari. Mở Cài đặt, chọn Quyền riêng tư & Bảo mật, chọn Dịch vụ định vị, chọn Trang web Safari, rồi chọn Khi dùng ứng dụng." }),
    h("p", { class: "hint", text: "Xong quay lại đây, bấm nút định vị lần nữa." }),
    h("button", { class: "btn primary block", onclick: closeModal, text: "Đã hiểu" }))]);
}
$("#locateBtn").addEventListener("click", () => { if (S.from !== "gps") { S.from = "gps"; ls("from", "gps"); renderFrom(); } startGps(true); });

/* ---------- list ---------- */
function visible() {
  const q = S.q.trim().toLowerCase();
  let a = S.places.filter(p => S.filter === "hidden" ? p.an : !p.an);
  if (S.filter === "todo") a = a.filter(p => !p.daDi);
  if (S.filter === "done") a = a.filter(p => p.daDi);
  if (S.filter === "love") a = a.filter(p => p.yeuThich);
  if (S.group) { a = S.places.filter(p => p.nhom === S.group && !p.an); return a.sort((x, y) => (x.thuTu || 0) - (y.thuTu || 0)); }
  if (q) a = a.filter(p => [p.ten, p.diaChi, p.khuVuc, (p.loai || []).join(" "), (p.monGoiY || []).map(m => m.ten).join(" "), p.reviewer].join(" ").toLowerCase().includes(q));
  const o = origin(), d = p => { const x = km(p, o); return x == null ? 1e9 : x; };
  if (S.sort === "near" && o) a.sort((x, y) => d(x) - d(y));
  else if (S.sort === "star") a.sort((x, y) => ((y.google && y.google.sao) || 0) - ((x.google && x.google.sao) || 0));
  else a.sort((x, y) => (y.taoLuc || 0) - (x.taoLuc || 0));
  return a;
}
function thumb(p, big) {
  const box = h("div", { class: big ? "ph" : "thumb" });
  const src = safeImg(p.anhBia);
  if (src) { const img = h("img", { src, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }); img.onerror = () => { img.remove(); box.prepend(big ? svgUse("pig") : h("span", { class: "ph", text: nameOf(p).charAt(0).toUpperCase() })); }; box.append(img); }
  else box.append(big ? svgUse("pig") : h("span", { class: "ph", text: nameOf(p).charAt(0).toUpperCase() }));
  if (!big && p.daDi) box.append(h("span", { class: "tag", text: "Đã đi" }));
  else if (!big && p.tongSo > 1) box.append(h("span", { class: "tag", text: p.thuTu + "/" + p.tongSo }));
  return box;
}
function starSpan(g) { return h("span", { class: "stars" }, h("i", { text: "★" }), nf1.format(g.sao), g.soDanhGia ? h("span", { style: "color:var(--muted);font-weight:500", text: " (" + compact(g.soDanhGia) + ")" }) : null); }
function card(p) {
  const g = p.google || {}, v = verdict(p), d = km(p);
  return h("div", { class: "card" + (p.id === S.selId ? " sel" : ""), role: "button", tabindex: "0",
      onclick: () => { select(p.id, true); openDetail(p.id); }, onkeydown: e => { if (e.key === "Enter") openDetail(p.id); } },
    thumb(p),
    h("div", { class: "card-mid" },
      h("h3", { text: nameOf(p) }),
      h("div", { class: "line" }, g.sao ? starSpan(g) : null, d != null ? h("span", { class: "dist", text: kmText(d) }) : null, p.khuVuc ? h("span", { text: p.khuVuc }) : null),
      h("div", { class: "line" }, h("span", { class: "pill " + v.c, text: v.t }), (g.mucGia || p.giaKhoang) ? h("span", { text: g.mucGia || p.giaKhoang }) : null)),
    h("button", { class: "heart" + (p.yeuThich ? " on" : ""), "aria-label": p.yeuThich ? "Bỏ thương" : "Thương quán này", "aria-pressed": p.yeuThich ? "true" : "false",
      onclick: e => { e.stopPropagation(); patch(p.id, { yeuThich: !p.yeuThich }); } }, svgUse("i-heart")));
}
function render() {
  const live = S.places.filter(p => !p.an), a = visible(), o = origin();
  const near = o ? live.filter(p => { const d = km(p, o); return d != null && d <= 2; }).length : 0;
  $("#sheetTitle").textContent = o && S.sort === "near" ? "Quán quanh đây" : "Quán đã lưu";
  $("#sheetSub").textContent = live.length
    ? (o ? near + " quán trong vòng 2 km · " : "") + live.filter(p => !p.daDi).length + " quán chưa đi"
    : "Sổ còn trống";
  const list = $("#list");
  if (!a.length) {
    const empty = !S.places.length;
    list.replaceChildren(h("div", { class: "empty" }, svgUse("pig"), h("h3", { text: empty ? "Chưa có quán nào" : "Không có quán ở mục này" }),
      h("p", { style: "margin:0", text: empty ? "Bấm Thêm quán, dán link TikTok review quán ăn. Web sẽ tìm review Google và vị trí giúp bạn." : "Đổi bộ lọc hoặc từ khoá để xem quán khác." }),
      empty ? h("button", { class: "btn primary", onclick: openAdd, text: "Thêm quán đầu tiên" }) : null));
  } else list.replaceChildren(...a.map(card));
  if (S.group && a.length) list.prepend(h("div", { class: "row", style: "justify-content:space-between" },
    h("b", { text: "Cả " + a.length + " quán trong cùng một video" }),
    h("button", { class: "btn sm", onclick: () => { S.group = ""; fitted = false; render(); }, text: "Xem tất cả quán" })));
  renderMarkers(S.filter === "hidden" ? a : a.filter(p => !p.an));
  $("#hello").textContent = S.name ? "Chào " + S.name + ", ăn gì nè?" : "Sổ quán ngon của hai đứa";
}
function renderFrom() {
  const sel = $("#fromSel");
  sel.replaceChildren(h("option", { value: "gps", text: "vị trí của tui" }), ...S.anchors.map(a => h("option", { value: a.id, text: a.ten })));
  if (S.from !== "gps" && !S.anchors.some(a => a.id === S.from)) S.from = "gps";
  sel.value = S.from;
}
$("#fromSel").addEventListener("change", e => { S.from = e.target.value; ls("from", S.from); fitted = false; if (S.from === "gps") startGps(true); else { const o = origin(); if (o) map.flyTo([o.lat, o.lng], 14); } render(); });
$("#chips").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; S.filter = b.dataset.f; document.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === b ? "true" : "false")); render(); });
$("#sort").addEventListener("change", e => { S.sort = e.target.value; if (S.sort === "near" && !origin()) startGps(true); render(); });
$("#q").addEventListener("input", e => { S.q = e.target.value; render(); });
$("#q").addEventListener("focus", () => setSheet("full"));

/* ---------- bottom sheet ---------- */
const sheet = $("#sheet");
const SNAP = { mini: () => 132, peek: () => Math.round(innerHeight * .44), full: () => Math.round(innerHeight - 150) };
let sheetState = "peek";
function setSheet(st) { sheetState = st; document.documentElement.style.setProperty("--sheet-h", SNAP[st]() + "px"); }
setSheet("peek");
addEventListener("resize", () => setSheet(sheetState));
(function drag() {
  let y0 = 0, h0 = 0, moved = false, on = false;
  const down = e => { on = true; moved = false; y0 = e.clientY; h0 = sheet.getBoundingClientRect().height; sheet.classList.add("dragging"); };
  const move = e => { if (!on) return; const dy = y0 - e.clientY; if (Math.abs(dy) > 4) moved = true; const hh = Math.max(110, Math.min(innerHeight - 120, h0 + dy)); document.documentElement.style.setProperty("--sheet-h", hh + "px"); };
  const up = e => {
    if (!on) return; on = false; sheet.classList.remove("dragging");
    if (!moved) { if (e.target.closest("button")) { setSheet(sheetState); return; } setSheet(sheetState === "full" ? "peek" : "full"); return; }
    const hh = sheet.getBoundingClientRect().height;
    const best = Object.keys(SNAP).reduce((a, k) => Math.abs(SNAP[k]() - hh) < Math.abs(SNAP[a]() - hh) ? k : a, "peek");
    setSheet(best);
  };
  ["#grab", "#sheetHead"].forEach(s => $(s).addEventListener("pointerdown", e => { if (e.target.closest("button")) return; $(s).setPointerCapture(e.pointerId); down(e); }));
  ["#grab", "#sheetHead"].forEach(s => { $(s).addEventListener("pointermove", move); $(s).addEventListener("pointerup", up); $(s).addEventListener("pointercancel", up); });
  map.on("dragstart", () => { if (sheetState !== "mini") setSheet("mini"); });
})();

/* ---------- pages & modal ---------- */
function openPage(nodes, onClose) {
  const pg = $("#page"); pg.replaceChildren(h("div", { class: "page-in" }, nodes)); pg.hidden = false; pg.scrollTop = 0; pg.onclose = onClose || null;
  if (!history.state || !history.state.page) history.pushState({ page: 1 }, "");
}
function closePage() { const pg = $("#page"); if (pg.hidden) return; pg.hidden = true; pg.replaceChildren(); if (pg.onclose) pg.onclose(); }
addEventListener("popstate", () => { closePage(); closeModal(); });
function back() { if (history.state && history.state.page) history.back(); else closePage(); }
function topBar(title) { return h("div", { class: "page-top" }, h("button", { class: "round", "aria-label": "Quay lại", onclick: back }, icon(IC.back)), h("h2", { text: title })); }
function openModal(nodes) { const m = $("#modal"); m.replaceChildren(h("div", { class: "modal-card" }, nodes)); m.hidden = false; }
function closeModal() { $("#modal").hidden = true; $("#modal").replaceChildren(); }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("#modal").hidden) closeModal(); else back(); } });

/* ---------- detail ---------- */
function openDetail(id) {
  const p = S.places.find(x => x.id === id); if (!p) return;
  S.detailId = id;
  const g = p.google || {}, v = verdict(p), d = km(p), tk = safeUrl(p.link), mp = mapsUrl(p), dr = dirUrl(p);
  const cover = h("div", { class: "cover" }, thumb(p, true),
    h("div", { class: "cover-bar" }, h("button", { class: "round", "aria-label": "Quay lại", onclick: back }, icon(IC.back)),
      h("button", { class: "round heart" + (p.yeuThich ? " on" : ""), "aria-label": "Thương quán này", onclick: async () => { await patch(p.id, { yeuThich: !p.yeuThich }); openDetailKeep(p.id); } }, svgUse("i-heart"))));
  const facts = [
    d != null ? h("div", { class: "fact" }, h("b", { text: kmText(d) }), walkText(d)) : null,
    (g.mucGia || p.giaKhoang) ? h("div", { class: "fact" }, h("b", { text: g.mucGia || p.giaKhoang }), "Giá") : null,
    p.khuVuc ? h("div", { class: "fact" }, h("b", { text: p.khuVuc }), "Khu vực") : null
  ];
  const nodes = [cover,
    h("div", { class: "title" }, h("span", { class: "pill " + v.c, style: "align-self:flex-start", text: v.t }), h("h1", { text: nameOf(p) }),
      g.sao ? h("div", { class: "big-stars" }, h("b", { text: nf1.format(g.sao) }), h("span", { class: "row5", text: "★★★★★".slice(0, Math.round(g.sao)) + "☆☆☆☆☆".slice(0, 5 - Math.round(g.sao)) }), h("span", { class: "hint", text: (g.soDanhGia ? nf0.format(g.soDanhGia) + " đánh giá " : "") + "trên Google" })) : null),
    h("div", { class: "facts" }, facts),
    h("div", { class: "acts" },
      dr ? h("a", { class: "act primary", href: dr, target: "_blank", rel: "noopener" }, icon(IC.nav), "Chỉ đường") : null,
      mp ? h("a", { class: "act", href: mp, target: "_blank", rel: "noopener" }, icon(IC.map), "Đọc review Google") : null,
      tk ? h("a", { class: "act", href: tk, target: "_blank", rel: "noopener" }, icon(IC.play), "Xem TikTok") : null)];

  const vid = (p.link || "").match(/tiktok\.com\/@[^/]+\/video\/(\d+)/i);
  if (vid) nodes.push(h("section", { class: "sec" }, h("h3", { text: "Video TikTok" }),
    h("iframe", { class: "gmap", style: "height:520px", loading: "lazy", title: "Video TikTok", allow: "autoplay; encrypted-media; fullscreen; picture-in-picture",
      src: "https://www.tiktok.com/player/v1/" + vid[1] + "?description=1&music_info=0&rel=0" })));
  if (p.nhom && p.tongSo > 1) {
    const sibs = S.places.filter(x => x.nhom === p.nhom && x.id !== p.id && !x.an).sort((x, y) => (x.thuTu || 0) - (y.thuTu || 0));
    nodes.push(h("section", { class: "sec" }, h("h3", { text: "Quán " + p.thuTu + " trong " + p.tongSo + " quán của video này" }),
      h("div", { class: "dishes" }, sibs.map(x => h("button", { class: "dish", style: "text-align:left", onclick: () => { history.replaceState({ page: 1 }, ""); openDetail(x.id); $("#page").scrollTop = 0; } },
        h("b", { text: x.thuTu + ". " + nameOf(x) }), x.khuVuc ? h("span", { text: x.khuVuc }) : null))),
      h("button", { class: "btn sm", style: "align-self:flex-start", onclick: () => { S.group = p.nhom; fitted = false; back(); render(); setSheet("full"); } }, "Xem cả " + p.tongSo + " quán trên bản đồ")));
  }
  if (busy(p)) nodes.push(h("div", { class: "banner", text: "Heo đang tìm hiểu quán này: " + (STEP[p.buoc] || "đang chạy").toLowerCase() + ". Trang tự cập nhật khi xong." }));
  else if (!p.ten) nodes.push(h("div", { class: "banner", text: "Web chưa tìm ra tên quán. Bấm Đọc lại ở cuối trang, thêm video đã lưu từ TikTok hoặc gõ tên quán." }));
  else if ((p.loiNhan || []).length) nodes.push(h("div", { class: "banner", text: p.loiNhan[0] }));
  if (mapsQuery(p)) nodes.push(h("section", { class: "sec" }, h("h3", { text: "Trên Google Maps" }),
    h("iframe", { class: "gmap", loading: "lazy", referrerpolicy: "no-referrer-when-downgrade", title: "Bản đồ Google của quán",
      src: "https://maps.google.com/maps?q=" + encodeURIComponent(mapsQuery(p)) + "&hl=vi&z=16&output=embed" }),
    h("p", { class: "note", text: "Bản đồ Google hiện số sao thật của quán. Bấm Đọc review Google để xem hết bình luận." })));

  if (g.tomTatReview || (g.khen || []).length || (g.che || []).length) nodes.push(h("section", { class: "sec" }, h("h3", { text: "Khách trên Google nói gì" }),
    g.tomTatReview ? h("p", { text: g.tomTatReview }) : null,
    (g.khen || []).length ? h("ul", { class: "pc" }, g.khen.map(x => h("li", { text: x }))) : null,
    (g.che || []).length ? h("ul", { class: "pc con" }, g.che.map(x => h("li", { text: x }))) : null,
    h("p", { class: "note", text: "AI tóm tắt từ kết quả tìm kiếm Google" + (g.capNhat ? ", ngày " + new Date(g.capNhat).toLocaleDateString("vi-VN") : "") + ". Số liệu có thể lệch vài điểm so với Google Maps." })));

  const dishes = (p.monGoiY || []).slice();
  (g.monDuocKhen || []).forEach(n => { if (!dishes.some(m => (m.ten || "").toLowerCase() === n.toLowerCase())) dishes.push({ ten: n, nhanXet: "Khách Google khen" }); });
  if (dishes.length) nodes.push(h("section", { class: "sec" }, h("h3", { text: "Món nên gọi" }), h("div", { class: "dishes" }, dishes.slice(0, 10).map(m => h("div", { class: "dish" }, h("b", { text: m.ten }), m.gia ? h("span", { text: m.gia }) : null, m.nhanXet ? h("span", { text: (m.gia ? " · " : "") + m.nhanXet }) : null)))));

  if (p.tomTat || p.reviewerKhen || p.reviewerChe) nodes.push(h("section", { class: "sec" }, h("h3", { text: "Reviewer TikTok" + (p.reviewer ? " " + p.reviewer : "") + " nói" }),
    p.tomTat ? h("p", { text: p.tomTat }) : null,
    p.reviewerKhen ? h("ul", { class: "pc" }, h("li", { text: p.reviewerKhen })) : null,
    p.reviewerChe ? h("ul", { class: "pc con" }, h("li", { text: p.reviewerChe })) : null));

  if (p.diaChi || g.gioMo) nodes.push(h("section", { class: "sec" }, h("h3", { text: "Địa chỉ và giờ mở" }), p.diaChi ? h("p", { text: p.diaChi }) : null, g.gioMo ? h("p", { class: "hint", text: g.gioMo }) : null));

  // Hai đứa chấm
  const mine = (p.diem || {})[S.name] || 0;
  const others = Object.entries(p.diem || {}).filter(([n]) => n !== S.name);
  const note = h("textarea", { class: "field", id: "noteIn", placeholder: "Ghi chú: bé thích món gì, nhớ đặt bàn..." }, p.ghiChu || "");
  note.addEventListener("change", () => patch(p.id, { ghiChu: note.value }));
  nodes.push(h("section", { class: "sec" }, h("h3", { text: "Hai đứa chấm" }),
    h("div", { class: "who" }, h("span", { text: (S.name || "Bạn") + " chấm" }),
      h("div", { class: "hearts" }, [1, 2, 3, 4, 5].map(n => h("button", { class: n <= mine ? "on" : "", "aria-label": n + " tim",
        onclick: async () => { if (!S.name) { openSettings(); toast("Nhập tên của bạn trước để chấm."); return; } await patch(p.id, { diem: { [S.name]: n === mine ? 0 : n } }); openDetailKeep(p.id); } }, svgUse("i-heart"))))),
    others.map(([n, s]) => h("div", { class: "who" }, h("span", { text: n + " chấm" }), h("span", { style: "color:var(--pink);letter-spacing:2px", text: "♥".repeat(s) }))),
    note));

  // Việc khác
  nodes.push(h("div", { class: "row" },
    h("button", { class: "btn" + (p.daDi ? "" : " primary"), style: "flex:1", onclick: async () => { await patch(p.id, { daDi: !p.daDi }); openDetailKeep(p.id); } }, icon(IC.check), p.daDi ? "Đã đi ăn rồi" : "Đánh dấu đã đi"),
    h("button", { class: "btn", style: "flex:1", onclick: () => openRefresh(p) }, icon(IC.refresh), "Đọc lại")));
  nodes.push(h("button", { class: "btn sm", style: "align-self:center;background:transparent;color:var(--muted)", onclick: async () => { await patch(p.id, { an: !p.an }); back(); } }, icon(p.an ? IC.eye : IC.x), p.an ? "Đưa quán trở lại sổ" : "Ẩn quán này"));
  if (p.nguoiThem || p.taoLuc) nodes.push(h("p", { class: "hint", style: "text-align:center;margin:0", text: (p.nguoiThem ? p.nguoiThem + " thêm" : "Thêm") + " ngày " + new Date(p.taoLuc || Date.now()).toLocaleDateString("vi-VN") }));
  openPage(nodes);
}
function openDetailKeep(id) { const pg = $("#page"), y = pg.scrollTop; openDetail(id); pg.scrollTop = y; }

/* ---------- tìm hiểu quán chạy nền + theo dõi tiến độ ---------- */
function runProcess(id, text, images) {
  const p = S.places.find(x => x.id === id);
  if (p) { p.trangThai = "dang-tim"; p.buoc = images && images.length ? "cho" : "video"; p.batDau = Date.now(); render(); }
  watchBusy();
  apiPost({ action: "process", id, text: text || "", images: images || [], thumbs: (images && images.thumbs) || [] })
    .then(j => {
      (j.places || [j.place]).forEach(x => upsert(x)); fitted = false; refreshOpenDetail(j.place.id);
      const n = (j.notes || [])[0], many = (j.places || []).length > 1;
      toast(many ? n : n ? nameOf(j.place) + ": " + n : "Xong rồi: " + nameOf(j.place) + ".", 6000);
      if (many) { S.filter = "all"; S.group = j.place.nhom; render(); setSheet("full"); }
      else if (typeof j.place.lat === "number") select(j.place.id, true);
    })
    .catch(e => { toast("Chưa tìm hiểu xong: " + errText(e.message), 5000); load(true); });
}
let busyTimer = null;
function watchBusy() {
  if (busyTimer) return;
  busyTimer = setInterval(async () => {
    if (!S.places.some(busy)) { clearInterval(busyTimer); busyTimer = null; return; }
    if (!document.hidden) { await load(true); }
  }, 4000);
}
function refreshOpenDetail(id) { if (!$("#page").hidden && S.detailId === id) openDetailKeep(id); }

/* ---------- add / refresh ---------- */
function needCode(then) {
  if (DEMO) return true;
  if (S.code) return true;
  openSettings(then); toast("Nhập mã nhóm để thêm và sửa quán."); return false;
}
async function compress(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("anh_hong");
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", .82);
  return { mime: "image/jpeg", data: url.split(",")[1], thumb: canvasJpeg(bmp, bmp.width, bmp.height, 220, .6).data };
}
function canvasJpeg(src, w, hgt, max, q) {
  const k = Math.min(1, max / Math.max(w, hgt));
  const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(hgt * k);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return { mime: "image/jpeg", data: c.toDataURL("image/jpeg", q || .75).split(",")[1] };
}
async function videoFrames(file, n) {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error("video_hong")); setTimeout(() => no(new Error("video_hong")), 15000); });
  const dur = Math.min(isFinite(v.duration) ? v.duration : 30, 600), out = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(dur - .1, (i + .5) * dur / n);
    await new Promise(ok => { v.onseeked = ok; v.currentTime = t; setTimeout(ok, 4000); });
    const big = canvasJpeg(v, v.videoWidth, v.videoHeight, 720);
    big.thumb = canvasJpeg(v, v.videoWidth, v.videoHeight, 220, .6).data;
    out.push(big);
  }
  URL.revokeObjectURL(url); return out;
}
async function videoAudio(file) {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC || !window.OfflineAudioContext) return null;
  const ac = new AC();
  try {
    const buf = await new Promise((ok, no) => file.arrayBuffer().then(ab => ac.decodeAudioData(ab, ok, no)).catch(no));
    const secs = Math.min(buf.duration, 180), rate = 8000;
    const off = new OfflineAudioContext(1, Math.ceil(secs * rate), rate);
    const s = off.createBufferSource(); s.buffer = buf; s.connect(off.destination); s.start(0, 0, secs);
    const pcm = (await off.startRendering()).getChannelData(0);
    const ab = new ArrayBuffer(44 + pcm.length * 2), dv = new DataView(ab);
    const wr = (o, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
    wr(0, "RIFF"); dv.setUint32(4, 36 + pcm.length * 2, true); wr(8, "WAVE"); wr(12, "fmt "); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    wr(36, "data"); dv.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) { const x = Math.max(-1, Math.min(1, pcm[i])); dv.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
    const bytes = new Uint8Array(ab); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { mime: "audio/wav", data: btoa(bin) };
  } catch (e) { return null; } finally { try { ac.close(); } catch (e) {} }
}
async function prepareMedia(files) {
  const out = [];
  for (const f of files) {
    if (/^video\//.test(f.type) || /\.(mp4|mov|m4v)$/i.test(f.name)) {
      out.push(...await videoFrames(f, 12).catch(() => []));
      const a = await videoAudio(f); if (a) out.push(a);
      if (!out.length) throw new Error("video_hong");
    } else out.push(await compress(f));
  }
  // Ảnh/khung hình đi trước, tiếng đi sau; thumbs xếp đúng thứ tự khung hình để AI chọn ảnh đại diện.
  const imgs = out.filter(x => x.mime !== "audio/wav").slice(0, 14), audio = out.filter(x => x.mime === "audio/wav").slice(0, 1);
  const media = imgs.map(x => ({ mime: x.mime, data: x.data })).concat(audio);
  media.thumbs = imgs.map(x => x.thumb || "");
  return media;
}
function formNodes(opts) {
  const link = h("input", { class: "field", id: "linkIn", type: "url", inputmode: "url", autocomplete: "off", placeholder: "Dán link TikTok hoặc gõ tên quán" });
  const pasteBtn = h("button", { class: "btn sm", type: "button", onclick: async () => { try { link.value = await navigator.clipboard.readText(); } catch (e) { link.focus(); toast("Giữ ngón tay trong ô rồi chọn Dán."); } } }, "Dán");
  const text = h("textarea", { class: "field", id: "textIn", placeholder: "Không bắt buộc: dán chữ mô tả video, hoặc gõ tên quán và món reviewer nhắc tới" }, opts.text || "");
  const file = h("input", { type: "file", id: "fileIn", accept: "video/*,image/*", multiple: true });
  const thumbs = h("div", { class: "thumbs" });
  file.addEventListener("change", () => thumbs.replaceChildren(...[...file.files].slice(0, 10).map(f => /^video\//.test(f.type)
    ? h("div", { class: "dish", style: "display:grid;place-items:center;height:64px" }, h("b", { text: "Video" }), h("span", { text: Math.round(f.size / 1e6) + " MB" }))
    : h("img", { src: URL.createObjectURL(f), alt: "" }))));
  return { link, pasteBtn, text, file, thumbs };
}
function stepsNode() {
  const list = ["Đọc video TikTok", "Đọc tên quán, món, giá", "Tra sao và bình luận trên Google", "Tìm vị trí trên bản đồ"];
  const box = h("div", { class: "steps" }, list.map(t => h("div", { class: "step" }, h("span", { class: "dot" }), t)));
  let i = 0; const els = box.children;
  els[0].classList.add("doing");
  const tm = setInterval(() => { if (i < els.length - 1) { els[i].classList.replace("doing", "done"); i++; els[i].classList.add("doing"); } }, 5500);
  box.finish = () => { clearInterval(tm); [...els].forEach(e => { e.classList.remove("doing"); e.classList.add("done"); }); };
  box.stop = () => clearInterval(tm);
  return box;
}
function openAdd() {
  if (!needCode(openAdd)) return;
  const f = formNodes({});
  const err = h("p", { class: "err", hidden: true });
  const go = h("button", { class: "btn primary block" }, "Lưu và tìm review");
  const warn = h("div", { class: "banner", hidden: true });
  let linkOnlyOk = false;
  const body = h("div", { style: "display:flex;flex-direction:column;gap:12px" },
    h("p", { class: "hint", style: "margin:0" }, h("b", { text: "Bước 1. " }), "Trong TikTok bấm Chia sẻ, chọn Sao chép liên kết, rồi dán vào đây."),
    h("div", { class: "paste" }, f.link, f.pasteBtn),
    h("p", { class: "hint", style: "margin:0" }, h("b", { text: "Bước 2 (bắt buộc để web đọc được quán). " }), "Trong TikTok bấm Chia sẻ, chọn Lưu video, rồi bấm ô dưới đây chọn video đó. Bài đăng dạng ảnh thì chụp màn hình các ảnh (tối đa 10 ảnh)."),
    h("label", { class: "files", for: "fileIn" }, f.file, icon(IC.play), "Chọn video đã lưu hoặc ảnh chụp"), f.thumbs,
    h("p", { class: "hint", style: "margin:0", text: "TikTok không cho web xem nội dung video qua link, chỉ có link thì web không biết quán nào." }),
    f.text,
    warn, go, err);
  f.file.addEventListener("change", () => { warn.hidden = true; linkOnlyOk = false; go.textContent = "Lưu và tìm review"; });
  go.addEventListener("click", async () => {
    err.hidden = true;
    const raw = f.link.value.trim(), text = f.text.value.trim(), files = [...f.file.files].slice(0, 10);
    if (!raw && !text && !files.length) { err.textContent = errText("thieu_thong_tin"); err.hidden = false; return; }
    if (/tiktok\.com/i.test(raw) && !text && !files.length && !linkOnlyOk) {
      warn.textContent = /\/photo\//i.test(raw)
        ? "Chưa có ảnh nào. Link này là bài đăng ảnh: chụp màn hình các ảnh có tên quán rồi chọn ở Bước 2. Hoặc bấm nút dưới lần nữa để chỉ lưu link."
        : "Chưa chọn video. Chỉ có link thì web không đọc được quán. Làm Bước 2 nha. Hoặc bấm nút dưới lần nữa để chỉ lưu link, đọc sau.";
      warn.hidden = false; linkOnlyOk = true; go.textContent = "Chỉ lưu link, đọc sau";
      warn.scrollIntoView({ behavior: "smooth", block: "center" }); return;
    }
    let images = [];
    go.disabled = true; go.textContent = files.length ? "Đang chuẩn bị video..." : "Đang gửi...";
    try { images = await prepareMedia(files); } catch (e) { go.disabled = false; go.textContent = "Lưu và tìm review"; err.textContent = "Có ảnh hoặc video không mở được. Chọn cái khác."; err.hidden = false; return; }
    go.textContent = "Đang lưu...";
    try {
      const j = await apiPost({ action: "add", link: raw, text, coMedia: images.length > 0 });
      upsert(j.place);
      back(); setSheet("peek");
      if (j.trung) { toast("Quán này lưu rồi nè."); select(j.place.id, true); if (images.length) runProcess(j.place.id, text, images); return; }
      toast("Đã lưu. Heo đang tìm hiểu quán, bạn cứ xem bản đồ trong lúc chờ.", 4500);
      runProcess(j.place.id, text, images);
    } catch (e) {
      go.disabled = false; go.textContent = "Lưu và tìm review";
      err.textContent = errText(e.message); err.hidden = false;
      if (e.message === "sai_ma") { S.code = ""; ls("code", null); }
    }
  });
  openPage([topBar("Thêm quán mới"), body]);
  setTimeout(() => f.link.focus(), 300);
}
function openRefresh(p) {
  if (!needCode(() => openRefresh(p))) return;
  const f = formNodes({ text: p.ten && !p.google ? p.ten : "" });
  const go = h("button", { class: "btn primary block" }, "Đọc lại");
  const body = h("div", { style: "display:flex;flex-direction:column;gap:12px" },
    h("p", { class: "hint", style: "margin:0", text: "Thêm video đã lưu từ TikTok (web nghe reviewer nói), ảnh chụp có tên quán, hoặc gõ đúng tên quán. Web sẽ đọc lại từ đầu." }),
    h("label", { class: "files", for: "fileIn" }, f.file, icon(IC.play), "Thêm video hoặc ảnh chụp"), f.thumbs, f.text, go);
  go.addEventListener("click", async () => {
    go.disabled = true; go.textContent = "Đang chuẩn bị...";
    const images = await prepareMedia([...f.file.files].slice(0, 10)).catch(() => []);
    runProcess(p.id, f.text.value.trim(), images);
    back(); toast("Heo đang tìm hiểu lại quán này.", 3500);
  });
  history.replaceState({ page: 1 }, "");
  openPage([topBar("Đọc lại quán"), body], null);
}
$("#addBtn").addEventListener("click", openAdd);

/* ---------- pick ---------- */
$("#pickBtn").addEventListener("click", pick);
function pick() {
  let pool = S.places.filter(p => !p.an && !p.daDi);
  const o = origin();
  if (o) { const near = pool.filter(p => { const d = km(p, o); return d != null && d <= 3; }); if (near.length >= 2) pool = near; }
  if (!pool.length) { openModal([h("div", { class: "modal-body", style: "margin-top:0;padding-top:18px" }, h("h2", { text: "Chưa có quán để bốc" }), h("p", { text: "Thêm vài link TikTok rồi bốc lại nha." }), h("button", { class: "btn primary block", onclick: () => { closeModal(); openAdd(); }, text: "Thêm quán" }))]); return; }
  const w = pool.map(p => (p.google && p.google.sao ? Math.max(p.google.sao - 3, .3) : 1) + (p.yeuThich ? 1 : 0));
  let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
  while (r > w[i] && i < pool.length - 1) { r -= w[i]; i++; }
  const p = pool[i], g = p.google || {}, d = km(p, o), dr = dirUrl(p);
  openModal([h("div", { class: "cover" }, thumb(p, true)),
    h("div", { class: "modal-body" }, h("div", { class: "kicker", text: "Hôm nay ăn ở" }), h("h2", { text: nameOf(p) }),
      h("div", { class: "line" }, g.sao ? starSpan(g) : null, d != null ? h("span", { class: "dist", text: kmText(d) + " · " + walkText(d) }) : null),
      (p.monGoiY || []).length ? h("p", { style: "margin:0", text: "Gọi thử: " + p.monGoiY.slice(0, 3).map(m => m.ten).join(", ") }) : null,
      h("div", { class: "row" }, dr ? h("a", { class: "btn primary", style: "flex:1;text-decoration:none", href: dr, target: "_blank", rel: "noopener" }, "Đi luôn") : null,
        h("button", { class: "btn", style: "flex:1", onclick: pick }, "Bốc lại")),
      h("button", { class: "btn sm", style: "background:transparent;color:var(--pink-deep)", onclick: () => { closeModal(); openDetail(p.id); } }, "Xem chi tiết quán"))]);
}

/* ---------- settings ---------- */
$("#settingsBtn").addEventListener("click", () => openSettings());
async function openSettings(then) {
  let st = S.status;
  if (!st && API && !DEMO) { try { st = S.status = await apiGet("status"); } catch (e) {} }
  const nodes = [topBar("Cài đặt")];
  if (!API && !DEMO) { nodes.push(h("div", { class: "banner", text: "Web chưa nối với Google Sheet. Kiệt làm xong bước cài đặt thì mục này mới dùng được." })); openPage(nodes); return; }
  if (!st && !DEMO) {
    nodes.push(h("div", { class: "banner", text: "Chưa nói chuyện được với Google. Kiểm tra mạng, hoặc Kiệt chưa bấm Cho phép ở bước cấp quyền." }),
      h("button", { class: "btn primary block", onclick: () => { history.replaceState({ page: 1 }, ""); openSettings(then); } }, "Thử lại"));
    openPage(nodes); return;
  }

  if (st && !st.setup) {
    const c1 = h("input", { class: "field", type: "password", autocomplete: "new-password", placeholder: "Tạo mã nhóm (ít nhất 4 ký tự)" });
    const c2 = h("input", { class: "field", type: "password", autocomplete: "new-password", placeholder: "Nhập lại mã nhóm" });
    const key = h("input", { class: "field", type: "password", autocomplete: "off", placeholder: "Dán chìa Gemini (bắt đầu bằng AIza)" });
    const msg = h("p", { class: "err", hidden: true });
    nodes.push(h("section", { class: "sec" }, h("h3", { text: "Cài đặt lần đầu" }),
      h("p", { text: "Mã nhóm dùng để thêm và sửa quán. Chỉ đưa cho bạn gái. Người khác vẫn xem được nhưng không sửa được." }), c1, c2,
      h("p", { text: "Chìa Gemini giúp web đọc ảnh và tóm tắt review. Lấy miễn phí ở trang aistudio.google.com/apikey bằng tài khoản Google, bấm Create API key rồi chép vào đây." }), key,
      h("button", { class: "btn primary block", onclick: async () => {
        msg.hidden = true;
        if (c1.value.length < 4 || c1.value !== c2.value) { msg.textContent = "Hai ô mã nhóm phải giống nhau và dài ít nhất 4 ký tự."; msg.hidden = false; return; }
        try { await apiPost({ action: "setup", code: c1.value, geminiKey: key.value.trim() }); S.code = c1.value; ls("code", S.code); S.status = null; toast("Cài đặt xong. Giờ nhập tên của bạn."); openSettings(then); }
        catch (e) { msg.textContent = errText(e.message); msg.hidden = false; }
      } }, "Lưu cài đặt"), msg));
    openPage(nodes); return;
  }

  const nameIn = h("input", { class: "field", value: S.name, placeholder: "Tên của bạn, ví dụ Kiệt hoặc Bé", maxlength: "20" });
  const codeIn = h("input", { class: "field", type: "password", autocomplete: "current-password", placeholder: S.code ? "Đã nhập mã nhóm" : "Mã nhóm" });
  const msg = h("p", { class: "err", hidden: true });
  nodes.push(h("section", { class: "sec" }, h("h3", { text: "Bạn là ai" }),
    h("p", { class: "hint", text: "Tên dùng khi chấm tim và ghi ai đã thêm quán." }), nameIn,
    h("p", { class: "hint", text: S.code ? "Máy này đã có mã nhóm. Nhập mã mới nếu muốn đổi." : "Nhập mã nhóm để thêm và sửa quán." }), codeIn,
    h("button", { class: "btn primary block", onclick: async () => {
      msg.hidden = true;
      const n = nameIn.value.trim(), c = codeIn.value;
      if (c) {
        const old = S.code; S.code = c;
        try { await apiPost({ action: "check" }); ls("code", c); }
        catch (e) { S.code = old; msg.textContent = errText(e.message); msg.hidden = false; return; }
      }
      if (n) { S.name = n; ls("name", n); }
      render(); toast("Đã lưu."); back(); if (then) setTimeout(then, 350);
    } }, "Lưu"), msg,
    S.code ? h("button", { class: "btn sm", style: "align-self:flex-start;background:transparent;color:var(--muted)", onclick: () => { S.code = ""; ls("code", null); toast("Đã xoá mã nhóm khỏi máy này."); openSettings(); } }, "Xoá mã nhóm khỏi máy này") : null));

  // Điểm mốc
  const aName = h("input", { class: "field", placeholder: "Tên điểm, ví dụ Nhà tui, Nhà bé, Công ty", maxlength: "30" });
  nodes.push(h("section", { class: "sec" }, h("h3", { text: "Điểm mốc" }),
    h("p", { class: "hint", text: "Khi chưa ra đường, web tính khoảng cách từ điểm mốc. Đứng ở chỗ đó, bấm nút dưới để lưu vị trí hiện tại." }),
    S.anchors.length ? h("div", null, S.anchors.map(a => h("div", { class: "anchor" }, h("span", null, icon(IC.pin), " ", a.ten),
      h("button", { class: "btn sm", onclick: async () => { if (!needCode()) return; try { const j = await apiPost({ action: "removeAnchor", id: a.id }); S.anchors = j.anchors; renderFrom(); render(); openSettingsKeep(); } catch (e) { toast(errText(e.message)); } } }, "Bỏ")))) : null,
    aName,
    h("button", { class: "btn block", onclick: () => {
      if (!needCode()) return;
      const n = aName.value.trim(); if (!n) { toast("Đặt tên cho điểm mốc trước."); return; }
      if (!navigator.geolocation) { toast("Máy này không hỗ trợ định vị."); return; }
      toast("Đang lấy vị trí...");
      navigator.geolocation.getCurrentPosition(async pos => {
        try { const j = await apiPost({ action: "addAnchor", ten: n, lat: pos.coords.latitude, lng: pos.coords.longitude }); S.anchors = j.anchors; renderFrom(); render(); toast("Đã lưu điểm " + n + "."); openSettingsKeep(); }
        catch (e) { toast(errText(e.message)); }
      }, err => { if (err.code === 1) showGpsHelp(); else toast("Chưa lấy được vị trí, thử lại."); }, { enableHighAccuracy: true, timeout: 20000 });
    } }, icon(IC.pin), "Lưu vị trí hiện tại thành điểm mốc")));

  // Chìa Gemini
  const key = h("input", { class: "field", type: "password", autocomplete: "off", placeholder: "Dán chìa Gemini mới" });
  nodes.push(h("details", { class: "sec" }, h("summary", { style: "font-weight:700;cursor:pointer", text: "Đổi chìa Gemini" + (st && !st.ai ? " (chưa có chìa)" : "") }),
    h("p", { class: "hint", text: "Lấy chìa miễn phí ở aistudio.google.com/apikey. Chìa được cất trên Google, web không hiện lại." }), key,
    h("button", { class: "btn block", onclick: async () => { if (!needCode()) return; try { await apiPost({ action: "setKey", geminiKey: key.value.trim() }); key.value = ""; S.status = null; toast("Đã lưu chìa mới."); } catch (e) { toast(errText(e.message)); } } }, "Lưu chìa")));
  openPage(nodes);
}
function openSettingsKeep() { const pg = $("#page"), y = pg.scrollTop; history.replaceState({ page: 1 }, ""); openSettings(); setTimeout(() => pg.scrollTop = y, 50); }

/* ---------- demo ---------- */
function demoData() {
  const now = Date.now();
  return { ok: true, anchors: [{ id: "a1", ten: "Nhà tui (ví dụ)", lat: 10.7795, lng: 106.6990 }], places: [
    { id: "d1", ten: "Phở Hòa Pasteur (ví dụ)", khuVuc: "Quận 3, TP.HCM", diaChi: "260C Pasteur, Quận 3, TP.HCM", lat: 10.7867, lng: 106.6893, link: "https://www.tiktok.com/@vidu/video/1", reviewer: "vidu",
      monGoiY: [{ ten: "Phở tái nạm", gia: "95.000 đồng", nhanXet: "Nước dùng đậm" }, { ten: "Quẩy", gia: "5.000 đồng" }], tomTat: "Ví dụ: reviewer khen nước dùng, chê giá hơi cao.",
      google: { sao: 4.2, soDanhGia: 6293, mucGia: "100.000 – 200.000 đồng", gioMo: "Mở từ 5h30 đến 23h", tomTatReview: "Ví dụ: khách khen phần ăn nhiều, phục vụ nhanh, một số người thấy giá cao.", khen: ["Phần ăn nhiều", "Phục vụ nhanh"], che: ["Giá hơi cao"], monDuocKhen: ["Bánh cam"] },
      trangThai: "da-tra-google", taoLuc: now - 864e5, diem: { "Kiệt": 4 }, yeuThich: true },
    { id: "d2", ten: "Lẩu bò Ba Toa (ví dụ)", khuVuc: "Quận 3, TP.HCM", lat: 10.7705, lng: 106.6862, google: { sao: 4.6, soDanhGia: 2100, mucGia: "200.000 – 300.000 đồng" }, trangThai: "da-doc", nhom: "g1", thuTu: 1, tongSo: 2, reviewerKhen: "Nước lẩu đậm", taoLuc: now - 3600e3 },
    { id: "d3", ten: "Bánh tráng trộn cô Út (ví dụ)", khuVuc: "Quận 1, TP.HCM", lat: 10.7745, lng: 106.7042, google: { sao: 3.8, soDanhGia: 340 }, trangThai: "da-doc", nhom: "g1", thuTu: 2, tongSo: 2, taoLuc: now - 7200e3 }
  ] };
}

/* ---------- boot ---------- */
try { const c = JSON.parse(ls("cache") || "null"); if (c) { S.places = c.places || []; S.anchors = c.anchors || []; } } catch (e) {}
$("#sort").value = S.sort;
renderFrom(); render();
load();
setInterval(() => { if (!document.hidden && $("#page").hidden) load(true); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(true); });
if (ls("gpsOk") && S.from === "gps") startGps(false);
else if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: "geolocation" }).then(r => { if (r.state === "granted" && S.from === "gps") startGps(false); }).catch(() => {});
if (DEMO) banner("Đang xem bản mẫu với quán ví dụ.");
})();
