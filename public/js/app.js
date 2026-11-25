/* GezyPraktik Fase 1 — SPA yang memanggil API server (bukan data contoh). */
var state = {
  user: null, langkah: [], cards: [], detail: null, detailSlug: null,
  wizId: null, wizSlug: null, wizStep: 0, wizData: {}, wizMeta: { mapel: "", jenjang: "SMP", kelas: "", ringkasan: "" },
  myStars: {}, asesorForm: null, adminTab: "pengguna",
};

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function initials(n) { return n.split(" ").filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase(); }
function starsHTML(v) { if (v == null) return '<span class="n">Belum ada bintang</span>'; var f = Math.round(v), s = ""; for (var i = 1; i <= 5; i++) s += i <= f ? "★" : "☆"; return s; }
function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 3400); }

async function api(path, opts) {
  opts = opts || {};
  var res = await fetch(path, Object.assign({ credentials: "include", headers: { "Content-Type": "application/json" } }, opts));
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(data.error || ("Gagal memuat (" + res.status + ")"));
  return data;
}

function coverClass(mapel) {
  var m = (mapel || "").toLowerCase();
  if (m.indexOf("inggris") >= 0) return "c-ing";
  if (m.indexOf("ipa") >= 0 || m.indexOf("sains") >= 0) return "c-ipa";
  if (m.indexOf("indonesia") >= 0) return "c-bin";
  if (m.indexOf("ips") >= 0 || m.indexOf("sejarah") >= 0) return "c-ips";
  if (m.indexOf("pjok") >= 0 || m.indexOf("olahraga") >= 0) return "c-pjok";
  return "c-mat";
}
function coverIcon(mapel) {
  var m = (mapel || "").toLowerCase();
  if (m.indexOf("matematika") >= 0) return "∑";
  if (m.indexOf("inggris") >= 0) return "Aa";
  if (m.indexOf("ipa") >= 0) return "⚗";
  if (m.indexOf("indonesia") >= 0) return "B";
  return "✎";
}

/* ---------- Router (hash) ---------- */
function go(view, arg) {
  var h = "#/" + view + (arg ? "/" + encodeURIComponent(arg) : "");
  if (location.hash !== h) location.hash = h; else route();
}
function route() {
  var parts = location.hash.replace(/^#\//, "").split("/").filter(Boolean);
  var view = parts[0] || "home";
  ["home", "detail", "create", "dashboard", "asesor", "admin", "profil"].forEach(function (v) {
    var el = $("view-" + v); if (el) el.classList.add("hidden");
  });
  var target = $("view-" + view); if (target) target.classList.remove("hidden");
  document.querySelectorAll("#mainnav button").forEach(function (b) {
    b.classList.toggle("active", b.dataset.nav === view || (view === "detail" && b.dataset.nav === "home"));
  });
  if (view === "detail") openDetail(decodeURIComponent(parts[1] || ""));
  else if (view === "profil") openProfil(decodeURIComponent(parts[1] || ""));
  else if (view === "create") { if (!requireLogin()) return; renderWizard(); }
  else if (view === "dashboard") { if (!requireLogin()) return; renderDashboard(); }
  else if (view === "asesor") { if (!requireLogin()) return; renderAsesor(); }
  else if (view === "admin") { if (!requireLogin()) return; renderAdmin(); }
  else { $("view-home").classList.remove("hidden"); renderCards(); }
  window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", route);

/* ---------- Auth ---------- */
function renderAuth() {
  var area = $("autharea");
  var navAdmin = $("nav-admin");
  if (navAdmin) navAdmin.classList.toggle("hidden", !(state.user && state.user.role === "admin"));
  if (!state.user) {
    area.innerHTML = '<button class="btn btn-gold btn-sm" onclick="openAuth()">Masuk / Daftar</button>';
    return;
  }
  area.innerHTML = '<button class="userchip" onclick="go(\'dashboard\')"><span class="avatar">' + esc(initials(state.user.nama)) + '</span>' + esc(state.user.nama.split(" ")[0]) + '</button> ' +
    '<button class="btn btn-ghost btn-sm" style="color:#fff;border-color:rgba(255,255,255,.4)" onclick="logout()">Keluar</button>';
}
function openAuth() { $("auth-overlay").classList.remove("hidden"); }
function closeAuth() { $("auth-overlay").classList.add("hidden"); }
function authTab(t) {
  $("tab-masuk").classList.toggle("on", t === "masuk");
  $("tab-daftar").classList.toggle("on", t === "daftar");
  $("form-masuk").classList.toggle("hidden", t !== "masuk");
  $("form-daftar").classList.toggle("hidden", t !== "daftar");
  $("auth-title").textContent = t === "masuk" ? "Masuk ke GezyPraktik" : "Daftar ke GezyPraktik";
}
async function doLogin(e) {
  e.preventDefault();
  try {
    var d = await api("/api/auth/masuk", { method: "POST", body: JSON.stringify({ email: $("li-email").value, password: $("li-pass").value }) });
    state.user = d.user; closeAuth(); renderAuth(); toast("Selamat datang, " + d.user.nama.split(" ")[0] + "!");
    route();
  } catch (err) { toast(err.message); }
}
async function doRegister(e) {
  e.preventDefault();
  try {
    var d = await api("/api/auth/daftar", {
      method: "POST",
      body: JSON.stringify({
        nama: $("rg-nama").value, email: $("rg-email").value, nip: $("rg-nip").value,
        no_wa: $("rg-wa").value, instansi: $("rg-instansi").value, status: $("rg-status").value,
        password: $("rg-pass").value,
      }),
    });
    state.user = d.user; closeAuth(); renderAuth(); toast("Akun dibuat. Selamat datang, " + d.user.nama.split(" ")[0] + "!");
    route();
  } catch (err) { toast(err.message); }
}
async function logout() {
  try { await api("/api/auth/keluar", { method: "POST", body: "{}" }); } catch (e) { /* abaikan */ }
  state.user = null; renderAuth(); toast("Anda sudah keluar."); route();
}
function requireLogin() {
  if (state.user) return true;
  openAuth(); toast("Masuk dulu untuk melanjutkan.");
  return false;
}

/* ---------- Beranda / Jelajahi ---------- */
async function loadStats() {
  try {
    var s = await api("/api/stats");
    $("st-total").textContent = s.total_terbit;
    $("st-guru").textContent = s.total_penulis;
    $("st-nilai").textContent = s.total_dinilai;
    $("st-ulasan").textContent = s.total_ulasan;
  } catch (e) { /* statistik gagal: biarkan 0 */ }
}
function fillMapelFilter() {
  var sel = $("f-mapel");
  var daftar = Array.from(new Set(state.cards.map(function (p) { return p.mapel; }).filter(Boolean))).sort();
  var cur = sel.value;
  sel.innerHTML = '<option value="">Semua mata pelajaran</option>' + daftar.map(function (m) { return '<option' + (m === cur ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join("");
}
async function renderCards() {
  var q = $("search").value, mapel = $("f-mapel").value, jenjang = $("f-jenjang").value, sort = $("f-sort").value;
  var qs = new URLSearchParams({ q: q, mapel: mapel, jenjang: jenjang, sort: sort });
  try {
    var d = await api("/api/praktik?" + qs.toString());
    state.cards = d.praktik;
    fillMapelFilter();
    var grid = $("cards");
    $("card-count").textContent = d.praktik.length + " praktik";
    $("cards-empty").classList.toggle("hidden", d.praktik.length > 0);
    grid.innerHTML = d.praktik.map(function (p) {
      return '<article class="card">' +
        '<div class="cover ' + coverClass(p.mapel) + '"><span class="subj">' + esc(p.mapel || "Guru") + ' · ' + esc(p.jenjang) + '</span><span class="big">' + coverIcon(p.mapel) + '</span><h3>' + esc(p.judul) + '</h3></div>' +
        '<div class="card-body"><p class="ex">' + esc(p.ringkasan) + '</p>' +
        '<div class="author"><span class="avatar">' + esc(initials(p.penulis_nama)) + '</span><span><b>' + esc(p.penulis_nama) + '</b><span>' + esc(p.penulis_instansi) + '</span></span></div>' +
        '<div class="card-meta"><span class="stars">' + starsHTML(p.rating.jumlah ? p.rating.rata : null) + ' <span class="n">' + (p.rating.jumlah ? p.rating.rata.toFixed(1) + ' (' + p.rating.jumlah + ')' : '') + '</span></span>' +
        (p.penilaian && p.penilaian.rata ? '<span>Asesor: <b>' + p.penilaian.rata.toFixed(1) + '/4</b></span>' : '') +
        '<span class="badge ' + (p.status === "Dinilai" ? "b-sudah" : "b-terbit") + '">' + esc(p.status) + '</span></div>' +
        '<button class="btn btn-navy btn-sm open" onclick="go(\'detail\',\'' + p.slug + '\')">Baca Praktik</button>' +
        '</div></article>';
    }).join("");
  } catch (err) { toast(err.message); }
}

/* ---------- Detail ---------- */
function fieldText(f, key) {
  var v = f[key];
  if (v == null) return "";
  if (Array.isArray(v)) return v;
  return String(v);
}
async function openDetail(slug) {
  $("view-detail").classList.remove("hidden");
  $("detail-body").innerHTML = "<p>Memuat praktik…</p>";
  try {
    var d = await api("/api/praktik/" + encodeURIComponent(slug));
    state.detail = d; state.detailSlug = slug;
    state.myStars[slug] = d.bintang_saya || 0;
    var f = d.fields || {};
    var langkahHTML = state.langkah.map(function (s, i) {
      var isi = s.fields.map(function (fd) {
        var v = f[fd.key];
        if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "";
        if (Array.isArray(v)) return "<p><b>" + esc(fd.label) + "</b></p><ul>" + v.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
        return "<p><b>" + esc(fd.label) + ":</b> " + esc(v) + "</p>";
      }).join("");
      if (!isi) return "";
      return '<section><h2><span class="no">' + (i + 1) + '</span>' + esc(s.judul) + '</h2>' + isi + '</section>';
    }).join("");
    var ba = (f.sebelum || f.sesudah) ?
      '<div class="ba"><div class="before"><b>Sebelum</b><span class="pct">' + esc(f.sebelum || "–") + '</span>' + esc(f.sebelum_label || "") + '</div><div class="after"><b>Sesudah</b><span class="pct">' + esc(f.sesudah || "–") + '</span>' + esc(f.sesudah_label || "") + '</div></div>' : "";
    var lamp = (d.lampiran || []).map(function (a) {
      var link = a.jenis === "tautan" ? esc(a.path_or_url) : "/api/lampiran/" + a.id + "/file";
      return '<div class="attach"><span class="ic">' + (a.jenis === "tautan" ? "🔗" : "📄") + '</span><span><a href="' + link + '" target="_blank" rel="noopener">' + esc(a.nama_file) + '</a><small>' + (a.jenis === "tautan" ? "Tautan" : "Berkas · " + Math.round((a.ukuran || 0) / 1024) + " KB") + '</small></span></div>';
    }).join("") || "<p>Tidak ada lampiran.</p>";
    var pen = d.penilaian_detail || [];
    var penHTML = pen.length ? pen.map(function (a) {
      var rata = ((a.skor_masalah + a.skor_strategi + a.skor_bukti + a.skor_replikasi) / 4).toFixed(1);
      return '<div class="score-big">' + rata + '<span style="font-size:15px;color:var(--muted)"> / 4</span></div>' +
        '<p>oleh ' + esc(a.asesor_nama) + ' · ' + esc(a.asesor_instansi) + ' · ' + esc(a.keputusan) + '</p>' +
        '<div class="rubric-row"><span>Kejelasan masalah &amp; tujuan</span><b>' + a.skor_masalah + '/4</b></div>' +
        '<div class="rubric-row"><span>Strategi &amp; inovasi</span><b>' + a.skor_strategi + '/4</b></div>' +
        '<div class="rubric-row"><span>Bukti &amp; dampak</span><b>' + a.skor_bukti + '/4</b></div>' +
        '<div class="rubric-row"><span>Potensi replikasi</span><b>' + a.skor_replikasi + '/4</b></div>' +
        (a.umpan_balik ? '<p style="margin-top:10px">' + esc(a.umpan_balik) + '</p>' : '');
    }).join('<hr style="border:0;border-top:1px solid var(--line);margin:14px 0">')
      : "<p>Belum dinilai asesor.</p>";
    var ulasanHTML = (d.ulasan || []).map(function (r) {
      return '<div class="review"><div class="who"><span class="avatar">' + esc(initials(r.nama)) + '</span><span><b>' + esc(r.nama) + '</b><span>' + esc(r.status) + ' · ' + esc(r.instansi) + (r.tersembunyi ? ' · <i>disembunyikan admin</i>' : '') + '</span></span></div><p>' + esc(r.teks) + '</p></div>';
    }).join("") || "<p>Belum ada ulasan.</p>";
    var ratingForm = state.user ?
      '<div class="star-input" id="star-input">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" onclick="setStar(' + n + ')" aria-label="' + n + ' bintang">' + (n <= (state.myStars[slug] || 0) ? "★" : "☆") + '</button>'; }).join("") + '</div>' +
      '<textarea class="ta" id="review-teks" rows="3" placeholder="Tulis ulasan Anda…"></textarea>' +
      '<div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-gold btn-sm" onclick="submitReview()">Kirim Bintang &amp; Ulasan</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="submitBintangSaja()">Simpan Bintang Saja</button></div>'
      : '<p>Masuk dulu untuk memberi bintang dan ulasan.</p><button class="btn btn-navy btn-sm" onclick="openAuth()">Masuk / Daftar</button>';
    $("detail-body").innerHTML =
      '<div class="detail-head"><span class="badge ' + (d.status === "Dinilai" ? "b-sudah" : "b-terbit") + '">' + esc(d.status) + '</span> ' +
      '<span class="badge b-draf">' + esc(d.mapel || "") + ' · ' + esc(d.jenjang) + (d.kelas ? ' · Kelas ' + esc(d.kelas) : '') + '</span>' +
      '<h1>' + esc(d.judul) + '</h1><p class="excerpt">' + esc(d.ringkasan) + '</p>' +
      '<div class="author"><span class="avatar">' + esc(initials(d.penulis_nama)) + '</span><span><b><a href="javascript:void(0)" onclick="go(\'profil\',\'' + d.penulis_slug + '\')">' + esc(d.penulis_nama) + '</a></b><span>' + esc(d.penulis_instansi) + '</span></span></div>' +
      '<p style="margin-top:14px"><button class="btn btn-ghost btn-sm" onclick="salinTautan()">🔗 Salin tautan halaman ini</button></p></div>' +
      '<div class="detail-grid"><div class="article">' + ba + langkahHTML + '</div>' +
      '<div class="side"><div class="panel"><h3>Penilaian Asesor</h3>' + penHTML + '</div>' +
      '<div class="panel"><h3>Bintang Komunitas</h3><div class="score-big">' + (d.rating.jumlah ? d.rating.rata.toFixed(1) : "–") + '<span style="font-size:15px;color:var(--muted)"> / 5</span></div><p>dari ' + d.rating.jumlah + ' pemberi bintang · terpisah dari nilai asesor</p></div>' +
      '<div class="panel"><h3>Lampiran</h3>' + lamp + '</div>' +
      '<div class="panel"><h3>Beri Bintang &amp; Ulasan</h3>' + ratingForm + '</div>' +
      '<div class="panel"><h3>Ulasan (' + d.ulasan.length + ')</h3>' + ulasanHTML + '</div>' +
      '</div></div>';
  } catch (err) { $("detail-body").innerHTML = "<p>" + esc(err.message) + "</p>"; }
}
function salinTautan() {
  var url = location.origin + "/praktik/" + state.detailSlug;
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("Tautan disalin: " + url); });
  else toast(url);
}
function setStar(n) { state.myStars[state.detailSlug] = n; openDetail(state.detailSlug); }
async function submitBintangSaja() {
  var n = state.myStars[state.detailSlug] || 0;
  if (!n) { toast("Pilih dulu bintangnya (1–5)."); return; }
  try { await api("/api/praktik/" + state.detail.id + "/bintang", { method: "POST", body: JSON.stringify({ bintang: n }) }); toast("Bintang tersimpan."); openDetail(state.detailSlug); } catch (err) { toast(err.message); }
}
async function submitReview() {
  var n = state.myStars[state.detailSlug] || 0;
  var teks = ($("review-teks") || {}).value || "";
  try {
    if (n) await api("/api/praktik/" + state.detail.id + "/bintang", { method: "POST", body: JSON.stringify({ bintang: n }) });
    if (teks.trim()) await api("/api/praktik/" + state.detail.id + "/ulasan", { method: "POST", body: JSON.stringify({ teks: teks }) });
    if (!n && !teks.trim()) { toast("Pilih bintang atau tulis ulasan dulu."); return; }
    toast("Terima kasih! Bintang & ulasan tersimpan.");
    openDetail(state.detailSlug);
  } catch (err) { toast(err.message); }
}

/* ---------- Profil penulis ---------- */
async function openProfil(slug) {
  $("view-profil").classList.remove("hidden");
  $("profil-body").innerHTML = "<p>Memuat profil…</p>";
  try {
    var d = await api("/api/profil/" + encodeURIComponent(slug));
    $("profil-body").innerHTML =
      '<div class="detail-head" style="display:flex;gap:16px;align-items:center"><span class="avatar xl">' + esc(initials(d.profil.nama)) + '</span><span><h1 style="margin:0">' + esc(d.profil.nama) + '</h1><p class="excerpt">' + esc(d.profil.status) + ' · ' + esc(d.profil.instansi) + '</p><p>Tautan profil: <b>' + esc(location.origin + "/p/" + d.profil.profile_slug) + '</b></p></span></div>' +
      '<h2 style="margin-top:22px">Praktik yang diterbitkan (' + d.praktik.length + ')</h2>' +
      (d.praktik.map(function (p) {
        return '<div class="listcard" style="margin-top:12px"><div class="lrow"><div class="grow"><h3>' + esc(p.judul) + '</h3><p>' + esc(p.mapel) + ' · ' + esc(p.jenjang) + ' · ' + esc(p.status) + ' · ★ ' + (p.rating.jumlah ? p.rating.rata.toFixed(1) + ' (' + p.rating.jumlah + ')' : 'belum ada bintang') + '</p></div><button class="btn btn-navy btn-sm" onclick="go(\'detail\',\'' + p.slug + '\')">Baca</button></div></div>';
      }).join("") || "<p>Belum ada praktik terbit.</p>");
  } catch (err) { $("profil-body").innerHTML = "<p>" + esc(err.message) + "</p>"; }
}

/* ---------- Wizard tulis praktik ---------- */
function wizSet(k, v) { state.wizData[k] = v; }
function wizMetaSet(k, v) { state.wizMeta[k] = v; }
function wizMove(d) { state.wizStep = Math.min(state.langkah.length - 1, Math.max(0, state.wizStep + d)); renderWizard(); window.scrollTo({ top: 0 }); }
function fieldInput(fd) {
  var v = state.wizData[fd.key];
  if (fd.jenis === "list") {
    var txt = Array.isArray(v) ? v.join("\n") : (v || "");
    return '<textarea class="ta" rows="4" oninput="wizSet(\'' + fd.key + '\', this.value)" placeholder="Satu butir per baris">' + esc(txt) + '</textarea>';
  }
  if (fd.jenis === "area") {
    return '<textarea class="ta" rows="4" oninput="wizSet(\'' + fd.key + '\', this.value)">' + esc(v || "") + '</textarea>';
  }
  return '<input class="in" value="' + esc(v || "") + '" oninput="wizSet(\'' + fd.key + '\', this.value)">';
}
function renderWizard() {
  var stepsEl = $("wiz-steps");
  stepsEl.innerHTML = state.langkah.map(function (s, i) {
    return '<div class="stepdot ' + (i < state.wizStep ? "done" : i === state.wizStep ? "now" : "") + '"><span class="ball">' + (i + 1) + '</span><span>' + esc(s.judul) + '</span></div>';
  }).join("");
  $("wiz-progress").style.width = Math.round(((state.wizStep + 1) / state.langkah.length) * 100) + "%";
  var s = state.langkah[state.wizStep];
  var extra = "";
  if (state.wizStep === 0) {
    extra = '<div class="fgroup"><label class="fl">Mata pelajaran</label><input class="in" value="' + esc(state.wizMeta.mapel) + '" oninput="wizMetaSet(\'mapel\', this.value)" placeholder="cth. Matematika"></div>' +
      '<div class="f2"><div class="fgroup"><label class="fl">Jenjang</label><select class="in" onchange="wizMetaSet(\'jenjang\', this.value)">' + ["SD", "SMP", "SMA", "SMK"].map(function (j) { return '<option' + (state.wizMeta.jenjang === j ? ' selected' : '') + '>' + j + '</option>'; }).join("") + '</select></div>' +
      '<div class="fgroup"><label class="fl">Kelas</label><input class="in" value="' + esc(state.wizMeta.kelas) + '" oninput="wizMetaSet(\'kelas\', this.value)" placeholder="cth. VII"></div></div>' +
      '<div class="fgroup"><label class="fl">Ringkasan singkat</label><textarea class="ta" rows="3" oninput="wizMetaSet(\'ringkasan\', this.value)">' + esc(state.wizMeta.ringkasan) + '</textarea></div>';
  }
  var fields = s.fields.map(function (fd) {
    return '<div class="fgroup"><label class="fl">' + esc(fd.label) + (fd.wajib ? ' *' : '') + (fd.petunjuk ? ' <small>— ' + esc(fd.petunjuk) + '</small>' : '') + '</label>' + fieldInput(fd) + '</div>';
  }).join("");
  var nav = '<div class="wiz-nav">' +
    (state.wizStep > 0 ? '<button class="btn btn-ghost" onclick="wizMove(-1)">← Sebelumnya</button>' : '') +
    '<span class="sp"></span><button class="btn btn-ghost" onclick="saveDraft()">Simpan sebagai draf</button>' +
    (state.wizStep < state.langkah.length - 1 ? '<button class="btn btn-navy" onclick="wizMove(1)">Berikutnya →</button>' : '<button class="btn btn-gold" onclick="publishPractice()">Terbitkan Sekarang</button>') +
    '</div>';
  var lamp = "";
  if (state.wizId) {
    lamp = '<div class="fgroup" style="margin-top:20px"><label class="fl">Lampiran berkas (maks 5 MB per berkas: PDF/DOCX/gambar)</label>' +
      '<input type="file" id="lamp-file" class="in"><button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="uploadLampiran()">Unggah Berkas</button></div>' +
      '<div class="fgroup"><label class="fl">Tautan video (YouTube/Drive)</label><div class="f2"><input class="in" id="lamp-nama" placeholder="Nama tautan"><input class="in" id="lamp-url" placeholder="https://…"></div>' +
      '<button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="tambahTautan()">Tambah Tautan</button></div>';
  } else {
    lamp = '<p class="hint">Lampiran bisa ditambahkan setelah draf pertama disimpan.</p>';
  }
  $("wiz-body").innerHTML = '<h2>Langkah ' + (state.wizStep + 1) + ': ' + esc(s.judul) + '</h2><p class="sub">' + esc(s.sub) + '</p>' + extra + fields + lamp + nav;
}
function startCreate() {
  if (!requireLogin()) return;
  state.wizId = null; state.wizSlug = null; state.wizStep = 0; state.wizData = {}; state.wizMeta = { mapel: "", jenjang: "SMP", kelas: "", ringkasan: "" };
  go("create");
}
async function editPraktik(id) {
  try {
    var d = await api("/api/praktik/" + id);
    state.wizId = d.id; state.wizSlug = d.slug; state.wizStep = 0;
    state.wizData = {}; Object.keys(d.fields || {}).forEach(function (k) { state.wizData[k] = d.fields[k]; });
    state.wizMeta = { mapel: d.mapel || "", jenjang: d.jenjang || "SMP", kelas: d.kelas || "", ringkasan: d.ringkasan || "" };
    go("create");
  } catch (err) { toast(err.message); }
}
async function simpanPraktik() {
  var body = { fields: state.wizData, mapel: state.wizMeta.mapel, jenjang: state.wizMeta.jenjang, kelas: state.wizMeta.kelas, ringkasan: state.wizMeta.ringkasan };
  if (state.wizId) {
    await api("/api/praktik/" + state.wizId, { method: "PUT", body: JSON.stringify(body) });
    return { id: state.wizId, slug: state.wizSlug };
  }
  return await api("/api/praktik", { method: "POST", body: JSON.stringify(body) });
}
async function saveDraft() {
  try {
    var r = await simpanPraktik();
    state.wizId = r.id; state.wizSlug = r.slug;
    toast("Draf tersimpan. Anda bisa melanjutkannya dari Praktik Saya.");
    renderWizard();
  } catch (err) { toast(err.message); }
}
async function publishPractice() {
  try {
    var r = await simpanPraktik();
    state.wizId = r.id; state.wizSlug = r.slug;
    await api("/api/praktik/" + r.id + "/terbitkan", { method: "POST", body: "{}" });
    toast("Praktik Anda sudah TERBIT dan bisa dibagikan!");
    go("detail", r.slug);
  } catch (err) { toast(err.message); }
}
async function uploadLampiran() {
  var input = $("lamp-file");
  if (!input || !input.files.length) { toast("Pilih dulu berkasnya."); return; }
  var fd = new FormData();
  fd.append("berkas", input.files[0]);
  try {
    var res = await fetch("/api/praktik/" + state.wizId + "/lampiran", { method: "POST", credentials: "include", body: fd });
    var d = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(d.error || "Gagal mengunggah.");
    toast("Berkas terunggah.");
  } catch (err) { toast(err.message); }
}
async function tambahTautan() {
  var nama = ($("lamp-nama") || {}).value || "", url = ($("lamp-url") || {}).value || "";
  var fd = new FormData();
  fd.append("jenis", "tautan"); fd.append("nama", nama); fd.append("url", url);
  try {
    var res = await fetch("/api/praktik/" + state.wizId + "/lampiran", { method: "POST", credentials: "include", body: fd });
    var d = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(d.error || "Gagal menambah tautan.");
    toast("Tautan ditambahkan.");
  } catch (err) { toast(err.message); }
}

/* ---------- Dasbor peserta ---------- */
async function renderDashboard() {
  var el = $("dash-body");
  el.innerHTML = "<p>Memuat…</p>";
  try {
    var d = await api("/api/dasbor/saya");
    var s = d.statistik;
    el.innerHTML =
      '<div class="statgrid"><div class="stat"><b>' + s.total + '</b><span>Total praktik</span></div>' +
      '<div class="stat"><b>' + s.draf + '</b><span>Draf</span></div>' +
      '<div class="stat"><b>' + s.terbit + '</b><span>Terbit</span></div>' +
      '<div class="stat"><b>' + s.dinilai + '</b><span>Dinilai asesor</span></div>' +
      '<div class="stat"><b>' + s.total_bintang_diberikan + '</b><span>Bintang diterima</span></div></div>' +
      '<p>Profil publik Anda: <b>' + esc(location.origin + "/p/" + d.saya.profile_slug) + '</b> — bagikan tautan ini ke komunitas Anda.</p>' +
      '<div class="listcard">' + (d.praktik.map(function (p) {
        return '<div class="lrow"><div class="grow"><h3>' + esc(p.judul) + '</h3><p>' + esc(p.mapel) + ' · ' + esc(p.jenjang) + ' · ' + esc(p.status) + ' · ★ ' + (p.rating.jumlah ? p.rating.rata.toFixed(1) + ' (' + p.rating.jumlah + ')' : 'belum ada bintang') + ' · ' + p.jml_ulasan + ' ulasan</p></div>' +
          (p.status === "Draf" ? '<button class="btn btn-navy btn-sm" onclick="editPraktik(' + p.id + ')">Lanjutkan</button><button class="btn btn-gold btn-sm" onclick="terbitkanDariDasbor(' + p.id + ')">Terbitkan</button>' : '<button class="btn btn-navy btn-sm" onclick="go(\'detail\',\'' + p.slug + '\')">Lihat</button><button class="btn btn-ghost btn-sm" onclick="editPraktik(' + p.id + ')">Ubah</button><button class="btn btn-ghost btn-sm" onclick="salinTautanPraktik(\'' + p.slug + '\')">Bagikan</button>') +
          (p.status === "Draf" ? '<button class="btn btn-ghost btn-sm" onclick="hapusPraktik(' + p.id + ')">Hapus</button>' : '') +
          '</div>';
      }).join("") || '<div class="lrow"><p>Belum ada praktik. Tulis praktik baik pertama Anda!</p></div>') + '</div>';
  } catch (err) { el.innerHTML = "<p>" + esc(err.message) + "</p>"; }
}
async function terbitkanDariDasbor(id) {
  try { var r = await api("/api/praktik/" + id + "/terbitkan", { method: "POST", body: "{}" }); toast("Praktik terbit!"); go("detail", r.slug); } catch (err) { toast(err.message); }
}
async function hapusPraktik(id) {
  if (!confirm("Hapus draf ini?")) return;
  try { await api("/api/praktik/" + id, { method: "DELETE" }); toast("Draf dihapus."); renderDashboard(); } catch (err) { toast(err.message); }
}
function salinTautanPraktik(slug) {
  var url = location.origin + "/praktik/" + slug;
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("Tautan disalin: " + url); });
  else toast(url);
}

/* ---------- Asesor ---------- */
async function renderAsesor() {
  var el = $("asesor-list");
  el.innerHTML = "<p>Memuat antrean…</p>";
  try {
    var d = await api("/api/dasbor/asesor");
    $("as-antre").textContent = d.statistik.menunggu;
    $("as-selesai").textContent = d.statistik.sudah_dinilai;
    $("as-rata").textContent = d.statistik.rata_nilai_saya == null ? "–" : d.statistik.rata_nilai_saya.toFixed(1);
    el.innerHTML = (d.antrean.map(function (p) {
      return '<div class="lrow"><div class="grow"><h3>' + esc(p.judul) + '</h3><p>' + esc(p.penulis_nama) + ' · ' + esc(p.penulis_instansi) + '</p></div>' +
        '<button class="btn btn-navy btn-sm" onclick="go(\'detail\',\'' + p.slug + '\')">Baca</button>' +
        '<button class="btn btn-gold btn-sm" onclick="openAsesorForm(' + p.id + ',\'' + p.slug + '\')">Nilai</button></div>';
    }).join("") || '<div class="lrow"><p>Tidak ada praktik yang menunggu penilaian Anda.</p></div>') +
      '<div class="lrow" style="background:var(--surface2)"><div class="grow"><h3>Sudah Anda nilai (' + d.sudah.length + ')</h3></div></div>' +
      (d.sudah.map(function (p) {
        return '<div class="lrow"><div class="grow"><h3>' + esc(p.judul) + '</h3><p>Rata-rata nilai Anda: ' + Number(p.rata_saya).toFixed(1) + ' / 4 · ' + esc(p.keputusan) + '</p></div><button class="btn btn-ghost btn-sm" onclick="openAsesorForm(' + p.id + ',\'' + p.slug + '\')">Ubah Nilai</button></div>';
      }).join("") || "");
  } catch (err) { el.innerHTML = "<p>" + esc(err.message) + "</p>"; }
}
function openAsesorForm(id, slug) {
  state.asesorForm = { id: id, slug: slug, skor: [3, 3, 3, 3] };
  var labels = ["Kejelasan masalah & tujuan", "Strategi & inovasi", "Bukti & dampak", "Potensi replikasi"];
  $("asesor-panel").innerHTML = '<div class="listcard" style="margin-top:16px;padding:20px"><h3 style="margin-top:0">Nilai praktik ini</h3>' +
    labels.map(function (l, i) {
      return '<div class="fgroup"><label class="fl">' + l + ' — <span id="skor-val-' + i + '">3</span>/4</label><input type="range" min="1" max="4" step="1" value="3" oninput="state.asesorForm.skor[' + i + ']=+this.value;document.getElementById(\'skor-val-' + i + '\').textContent=this.value"></div>';
    }).join("") +
    '<div class="fgroup"><label class="fl">Umpan balik tertulis</label><textarea class="ta" id="asesor-umpan" rows="4" placeholder="Apa yang kuat, apa yang perlu diperbaiki…"></textarea></div>' +
    '<div class="fgroup"><label class="fl">Keputusan</label><select class="in" id="asesor-keputusan"><option>Dinilai</option><option>Perlu perbaikan</option></select></div>' +
    '<button class="btn btn-gold" onclick="submitAsesor()">Simpan Penilaian</button> ' +
    '<button class="btn btn-ghost" onclick="document.getElementById(\'asesor-panel\').innerHTML=\'\'">Batal</button></div>';
  window.scrollTo({ top: document.getElementById("asesor-panel").offsetTop - 80 });
}
async function submitAsesor() {
  var f = state.asesorForm;
  try {
    await api("/api/praktik/" + f.id + "/penilaian", {
      method: "POST",
      body: JSON.stringify({
        skor_masalah: f.skor[0], skor_strategi: f.skor[1], skor_bukti: f.skor[2], skor_replikasi: f.skor[3],
        umpan_balik: $("asesor-umpan").value, keputusan: $("asesor-keputusan").value,
      }),
    });
    toast("Penilaian tersimpan.");
    $("asesor-panel").innerHTML = "";
    renderAsesor();
  } catch (err) { toast(err.message); }
}

/* ---------- Admin ---------- */
async function renderAdmin() {
  var el = $("admin-body");
  el.innerHTML = "<p>Memuat…</p>";
  try {
    var s = await api("/api/admin/statistik");
    var users = await api("/api/admin/pengguna");
    var ulasan = await api("/api/admin/ulasan");
    el.innerHTML =
      '<div class="statgrid"><div class="stat"><b>' + s.total_pengguna + '</b><span>Pengguna</span></div>' +
      '<div class="stat"><b>' + s.total_praktik + '</b><span>Praktik</span></div>' +
      '<div class="stat"><b>' + s.total_terbit + '</b><span>Terbit</span></div>' +
      '<div class="stat"><b>' + s.total_dinilai + '</b><span>Dinilai</span></div>' +
      '<div class="stat"><b>' + s.total_ulasan + '</b><span>Ulasan (' + s.ulasan_tersembunyi + ' disembunyikan)</span></div></div>' +
      '<div class="panel"><h3>Buat akun asesor / admin</h3><div class="f2">' +
      '<div class="fgroup"><label class="fl">Nama</label><input class="in" id="ad-nama"></div>' +
      '<div class="fgroup"><label class="fl">Email</label><input class="in" id="ad-email" type="email"></div></div>' +
      '<div class="f2"><div class="fgroup"><label class="fl">Kata sandi (min 8)</label><input class="in" id="ad-pass" type="password"></div>' +
      '<div class="fgroup"><label class="fl">Peran</label><select class="in" id="ad-role"><option>asesor</option><option>admin</option><option>peserta</option><option>pengunjung</option></select></div></div>' +
      '<button class="btn btn-navy btn-sm" onclick="buatAkunAdmin()">Buat Akun</button></div>' +
      '<div class="panel" style="margin-top:16px"><h3>Kelola pengguna (' + users.pengguna.length + ')</h3>' +
      users.pengguna.map(function (u) {
        return '<div class="lrow"><div class="grow"><h3>' + esc(u.nama) + '</h3><p>' + esc(u.email) + ' · ' + esc(u.status) + ' · ' + esc(u.instansi) + '</p></div>' +
          '<select class="in" style="width:auto" onchange="ubahPeran(' + u.id + ', this.value)">' + ["admin", "asesor", "peserta", "pengunjung"].map(function (r) { return '<option' + (u.role === r ? ' selected' : '') + '>' + r + '</option>'; }).join("") + '</select></div>';
      }).join("") + '</div>' +
      '<div class="panel" style="margin-top:16px"><h3>Moderasi ulasan</h3>' +
      (ulasan.ulasan.map(function (r) {
        return '<div class="review"><div class="who"><span><b>' + esc(r.nama) + '</b><span> pada “' + esc(r.judul || "") + '”' + (r.tersembunyi ? ' · <i>disembunyikan</i>' : '') + '</span></span></div><p>' + esc(r.teks) + '</p>' +
          '<button class="btn btn-ghost btn-sm" onclick="toggleUlasan(' + r.id + ', ' + (r.tersembunyi ? 'false' : 'true') + ')">' + (r.tersembunyi ? 'Tampilkan lagi' : 'Sembunyikan') + '</button></div>';
      }).join("") || "<p>Belum ada ulasan.</p>") + '</div>' +
      '<div class="panel" style="margin-top:16px"><h3>Backup &amp; Restore</h3><p>Unduh seluruh data (pengguna, praktik, penilaian, ulasan, log) sebagai JSON. Restore mengganti seluruh isi database — gunakan dengan hati-hati.</p>' +
      '<a class="btn btn-navy btn-sm" href="/api/admin/backup">Unduh Backup JSON</a> ' +
      '<input type="file" id="restore-file" accept=".json" class="in" style="margin-top:10px"><button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="restoreBackup()">Pulihkan dari Backup</button></div>' +
      '<div class="panel" style="margin-top:16px"><h3>Log Aktivitas Terbaru</h3>' +
      (s.log_terbaru.map(function (l) { return '<div class="review"><p><b>' + esc(l.aksi) + '</b> — ' + esc(l.detail) + ' <span style="color:var(--muted)">(' + esc(l.nama || "sistem") + ', ' + esc(l.created_at) + ')</span></p></div>'; }).join("") || "<p>Belum ada log.</p>") + '</div>';
  } catch (err) { el.innerHTML = "<p>" + esc(err.message) + "</p>"; }
}
async function buatAkunAdmin() {
  try {
    await api("/api/admin/pengguna", {
      method: "POST",
      body: JSON.stringify({ nama: $("ad-nama").value, email: $("ad-email").value, password: $("ad-pass").value, role: $("ad-role").value }),
    });
    toast("Akun dibuat."); renderAdmin();
  } catch (err) { toast(err.message); }
}
async function ubahPeran(id, role) {
  try { await api("/api/admin/pengguna/" + id + "/peran", { method: "PUT", body: JSON.stringify({ role: role }) }); toast("Peran diubah menjadi " + role + "."); } catch (err) { toast(err.message); renderAdmin(); }
}
async function toggleUlasan(id, sembunyi) {
  try { await api("/api/admin/ulasan/" + id + "/sembunyikan", { method: "POST", body: JSON.stringify({ tersembunyi: sembunyi }) }); toast(sembunyi ? "Ulasan disembunyikan." : "Ulasan ditampilkan lagi."); renderAdmin(); } catch (err) { toast(err.message); }
}
async function restoreBackup() {
  var input = $("restore-file");
  if (!input || !input.files.length) { toast("Pilih dulu berkas backup JSON."); return; }
  if (!confirm("Restore akan MENGGANTI seluruh isi database. Lanjutkan?")) return;
  try {
    var teks = await input.files[0].text();
    await api("/api/admin/restore", { method: "POST", body: teks });
    toast("Backup dipulihkan."); renderAdmin();
  } catch (err) { toast(err.message); }
}

/* ---------- Muat awal ---------- */
(async function init() {
  try { state.langkah = (await api("/api/meta/langkah")).langkah; } catch (e) { state.langkah = []; }
  try { var me = await api("/api/auth/me"); state.user = me.user; } catch (e) { state.user = null; }
  renderAuth();
  loadStats();
  route();
})();
