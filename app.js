(() => {
// v2: grades are now stored on the 1.00-5.00 scale (v1 stored percentages, so it is left untouched).
const KEY = 'isu-grade-calc-v2';
// scale entries are [percentage equivalent, grade]
const DEF = { weights: { p: 30, m: 30, f: 40 }, pass: 3, theme: 'light', scale: [[96, 1], [94, 1.25], [91, 1.5], [88, 1.75], [85, 2], [82, 2.25], [79, 2.5], [76, 2.75], [70, 3]] };
const $ = id => document.getElementById(id);
const ic = n => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
let S = load(), filter = 'All', editing = null, editingCls = null;

function load() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && Array.isArray(d.classes) && Array.isArray(d.records)) return { ...d, set: { ...clone(DEF), ...d.set } }; } catch {} return { set: clone(DEF), classes: [], records: [], cur: null }; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Could not save. Browser storage may be full or blocked.'); } }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const num = v => (v === '' || v == null || isNaN(+v)) ? null : +v;
const fx = n => n == null ? '—' : n.toFixed(2);
const badGrade = v => v != null && (v < 1 || v > 5);

// ----- grading core (numerical 1.00-5.00) -----
const EPS = 1e-9;
const scaleAsc = () => [...S.set.scale].sort((a, b) => a[1] - b[1]);            // best grade first
const passList = () => scaleAsc().filter(s => s[1] <= S.set.pass + EPS);        // grades that are passing
const lowPct = () => { const L = passList(); return L.length ? L[L.length - 1][0] : 0; };
// Weighted numerical average, e.g. (2.00*30 + 1.50*30 + 1.75*40) / 100 = 1.75
const weighted = r => { const w = S.set.weights, t = w.p + w.m + w.f; return t > 0 ? Math.round((r.p * w.p + r.m * w.m + r.f * w.f) / t * 10000) / 10000 : null; };
// Round the weighted grade to the nearest configured grade; returns [pct, grade]
function toGrade(avg) {
  const L = passList();
  for (let i = 0; i < L.length; i++) { const up = i < L.length - 1 ? (L[i][1] + L[i + 1][1]) / 2 : S.set.pass; if (avg <= up + EPS) return L[i]; }
  return L.length ? L[L.length - 1] : [0, 5];
}
function calc(r) {
  if (r.inc || r.p == null || r.m == null || r.f == null) return { st: 'INC' };
  const avg = weighted(r);
  if (avg == null) return { st: 'INC' };
  if (avg > S.set.pass + EPS) return { avg, pct: null, g: 5, st: 'Failed' };
  const [pct, g] = toGrade(avg);
  return { avg, pct, g, st: 'Passed' };
}
const pctTxt = c => c.pct != null ? c.pct + '%' : c.st === 'Failed' ? 'Below ' + lowPct() + '%' : '—';

function toast(msg, undo) {
  const t = $('toast'); t.innerHTML = `<span>${esc(msg)}</span>` + (undo ? '<button id="undoBtn">Undo</button>' : ''); t.classList.remove('hidden');
  if (undo) $('undoBtn').onclick = () => { undo(); t.classList.add('hidden'); };
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), undo ? 7000 : 3500);
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

// ----- navigation, theme -----
function show(id) { ['home', 'fac', 'stu'].forEach(s => $(s).classList.toggle('hidden', s !== id)); if (id === 'fac') renderFac(); if (id === 'stu') fillTargets(); scrollTo(0, 0); }
document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) show(g.dataset.go); });
function setTheme(t) { S.set.theme = t; document.documentElement.dataset.theme = t; $('themeBtn').innerHTML = ic(t === 'dark' ? 'sun' : 'moon') + (t === 'dark' ? 'Light mode' : 'Dark mode'); save(); }
$('themeBtn').onclick = () => setTheme(S.set.theme === 'dark' ? 'light' : 'dark');
if (!localStorage.getItem(KEY) && matchMedia('(prefers-color-scheme: dark)').matches) S.set.theme = 'dark';
setTheme(S.set.theme);
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
  $('recTab').classList.toggle('hidden', b.dataset.tab !== 'rec'); $('setTab').classList.toggle('hidden', b.dataset.tab !== 'set'); if (b.dataset.tab === 'set') fillSettings();
});

// ----- faculty: records -----
const curCls = () => S.classes.find(c => c.id === S.cur) || S.classes[0];
function renderFac() {
  if (!S.classes.some(c => c.id === S.cur)) S.cur = S.classes[0]?.id || null;
  $('clsSel').innerHTML = S.classes.map(c => `<option value="${c.id}" ${c.id === S.cur ? 'selected' : ''}>${esc(c.subject)} · ${esc(c.section)}</option>`).join('');
  const has = S.classes.length > 0;
  $('noCls').classList.toggle('hidden', has); $('clsBody').classList.toggle('hidden', !has);
  ['editCls', 'delCls'].forEach(i => $(i).disabled = !has);
  if (!has) return;
  const all = S.records.filter(r => r.cls === S.cur).map(r => ({ r, c: calc(r) }));
  const graded = all.filter(x => x.c.avg != null), passed = graded.filter(x => x.c.st === 'Passed');
  const inc = all.filter(x => x.c.st === 'INC');
  const best = graded.length ? graded.reduce((a, x) => x.c.avg < a.c.avg ? x : a) : null;     // lowest number = best grade
  const avg = graded.length ? graded.reduce((a, x) => a + x.c.avg, 0) / graded.length : null;
  const st = (l, v, s) => `<div class="card stat"><span class="mu">${l}</span><b>${v}</b><span class="mu">${s}</span></div>`;
  $('stats').innerHTML = st('Class average', fx(avg), `${graded.length} graded · 1.00 is best`) + st('Pass rate', graded.length ? Math.round(passed.length / graded.length * 100) + '%' : '—', `${passed.length} of ${graded.length} passed`) + st('Highest grade', best ? fx(best.c.g) : '—', best ? `${pctTxt(best.c)} equivalent` : '') + st('Incomplete', inc.length, 'Awaiting grades');
  const counts = { All: all.length, Passed: passed.length, Failed: graded.length - passed.length, INC: inc.length };
  if (!(filter in counts)) filter = 'All';
  $('chips').innerHTML = Object.entries(counts).map(([k, n]) => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}">${k} ${n}</button>`).join('');
  const q = $('q').value.trim().toLowerCase();
  const list = all.filter(x => (filter === 'All' || x.c.st === filter) && (!q || (x.r.name + x.r.sid).toLowerCase().includes(q)));
  $('rows').innerHTML = list.map(({ r, c }) => `<tr><td>${esc(r.sid)}</td><td><b>${esc(r.name)}</b></td><td class="n">${fx(r.p)}</td><td class="n">${fx(r.m)}</td><td class="n">${fx(r.f)}</td><td class="n">${fx(c.avg)}</td><td class="n">${pctTxt(c)}</td><td class="n"><b>${c.g != null ? fx(c.g) : 'INC'}</b></td><td><span class="tag ${c.st}">${c.st}</span></td><td class="n" style="white-space:nowrap"><button class="btn" style="min-height:36px;padding:0 10px" data-edit="${r.id}">${c.st === 'INC' ? 'Complete' : 'Edit'}</button> <button class="ib" data-del="${r.id}" aria-label="Delete ${esc(r.name)}">${ic('x')}</button></td></tr>`).join('');
  $('empty').textContent = list.length ? '' : (all.length ? 'No records match.' : 'No records yet. Add grades or import a CSV.');
  const w = S.set.weights; $('wnote').textContent = `Weights: Prelim ${w.p}% · Midterm ${w.m}% · Final ${w.f}% · Passing grade ${fx(S.set.pass)}`;
}
$('clsSel').onchange = e => { S.cur = e.target.value; save(); renderFac(); };
$('q').oninput = renderFac;
$('chips').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; renderFac(); } };
$('rows').onclick = e => {
  const ed = e.target.closest('[data-edit]'), dl = e.target.closest('[data-del]');
  if (ed) openRec(S.records.find(r => r.id === ed.dataset.edit));
  if (dl) { const i = S.records.findIndex(r => r.id === dl.dataset.del), rec = S.records[i]; S.records.splice(i, 1); save(); renderFac(); toast('Record deleted.', () => { S.records.splice(i, 0, rec); save(); renderFac(); }); }
};

// record dialog
function openRec(r) {
  editing = r || null; $('recTitle').textContent = r ? 'Edit grades' : 'Add grades'; $('rErr').textContent = '';
  $('rSid').value = r?.sid || ''; $('rName').value = r?.name || ''; $('rP').value = r?.p != null ? r.p.toFixed(2) : ''; $('rM').value = r?.m != null ? r.m.toFixed(2) : ''; $('rF').value = r?.f != null ? r.f.toFixed(2) : ''; $('rInc').checked = !!r?.inc;
  live(); $('recDlg').showModal(); $('rSid').focus();
}
const readRec = () => ({ sid: $('rSid').value.trim(), name: $('rName').value.trim(), p: num($('rP').value), m: num($('rM').value), f: num($('rF').value), inc: $('rInc').checked });
function live() {
  const r = readRec(), c = calc(r);
  $('lvA').textContent = c.avg == null ? '—' : `${fx(c.avg)} · ${fx(c.g)} · ${pctTxt(c)}`;
  $('lvS').textContent = c.st; $('lvS').className = 'tag ' + c.st;
  if (badGrade(r.p) || badGrade(r.m) || badGrade(r.f)) { $('lvA').textContent = '—'; }
}
['rP', 'rM', 'rF', 'rInc'].forEach(i => $(i).addEventListener('input', live));
$('addRec').onclick = () => openRec(null);
$('rCancel').onclick = () => $('recDlg').close();
$('recForm').onsubmit = e => {
  e.preventDefault(); const r = readRec();
  const fail = m => { $('rErr').textContent = m; };
  if (!r.sid || !r.name) return fail('Student ID and name are required.');
  if (badGrade(r.p) || badGrade(r.m) || badGrade(r.f)) return fail('Grades must be between 1.00 and 5.00.');
  if (!r.inc && (r.p == null || r.m == null || r.f == null)) return fail('Enter all three grades, or mark the record as INC.');
  if (S.records.some(x => x.cls === S.cur && x.sid.toLowerCase() === r.sid.toLowerCase() && x !== editing)) return fail('This Student ID already has a record in this class.');
  if (editing) Object.assign(editing, r); else S.records.push({ id: uid(), cls: S.cur, ...r });
  save(); $('recDlg').close(); renderFac(); toast('Record saved.');
};

// class dialog
function openCls(c) { editingCls = c || null; $('clsTitle').textContent = c ? 'Edit class' : 'New class'; $('cErr').textContent = ''; $('cSub').value = c?.subject || ''; $('cSec').value = c?.section || ''; $('cUn').value = c?.units ?? 3; $('cSem').value = c?.sem || ''; $('clsDlg').showModal(); $('cSub').focus(); }
$('newCls').onclick = () => openCls(null); $('editCls').onclick = () => openCls(curCls()); $('cCancel').onclick = () => $('clsDlg').close();
$('clsForm').onsubmit = e => {
  e.preventDefault(); const subject = $('cSub').value.trim(), section = $('cSec').value.trim(), units = num($('cUn').value), sem = $('cSem').value.trim() || 'Semester';
  if (!subject || !section || !units || units <= 0) { $('cErr').textContent = 'Subject, section and units are required.'; return; }
  if (editingCls) Object.assign(editingCls, { subject, section, units, sem }); else { const c = { id: uid(), subject, section, units, sem }; S.classes.push(c); S.cur = c.id; }
  save(); $('clsDlg').close(); renderFac();
};
$('delCls').onclick = () => {
  const c = curCls(); if (!c || !confirm(`Delete "${c.subject} · ${c.section}" and all its records?`)) return;
  const recs = S.records.filter(r => r.cls === c.id), i = S.classes.indexOf(c);
  S.classes.splice(i, 1); S.records = S.records.filter(r => r.cls !== c.id); save(); renderFac();
  toast('Class deleted.', () => { S.classes.splice(i, 0, c); S.records.push(...recs); S.cur = c.id; save(); renderFac(); });
};

// CSV
const csvCell = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
$('expBtn').onclick = () => {
  const c = curCls(); if (!c) return;
  const rows = [['Student ID', 'Name', 'Prelim', 'Midterm', 'Final', 'INC', 'Weighted Average', 'Percentage Equivalent', 'Grade', 'Remarks']];
  S.records.filter(r => r.cls === c.id).forEach(r => { const k = calc(r); rows.push([r.sid, r.name, r.p != null ? r.p.toFixed(2) : '', r.m != null ? r.m.toFixed(2) : '', r.f != null ? r.f.toFixed(2) : '', r.inc ? 'yes' : '', k.avg != null ? k.avg.toFixed(2) : '', k.pct != null ? k.pct + '%' : (k.st === 'Failed' ? 'Below ' + lowPct() + '%' : ''), k.g != null ? k.g.toFixed(2) : 'INC', k.st]); });
  download(`${c.subject}-${c.section}.csv`.replace(/\s+/g, '_'), rows.map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv');
};
function parseCSV(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
  if (cur || row.length) { row.push(cur); rows.push(row); } return rows.filter(r => r.some(x => x.trim()));
}
$('impBtn').onclick = () => $('impFile').click();
$('impFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const rows = parseCSV(await f.text()), h = (rows.shift() || []).map(x => x.trim().toLowerCase());
  const ix = n => h.findIndex(x => x.includes(n));
  const [is, inm, ip, im, iff, ii] = [ix('id'), ix('name'), ix('prelim'), ix('mid'), ix('final'), ix('inc')];
  if (is < 0 || inm < 0 || ip < 0 || im < 0 || iff < 0) return toast('CSV needs columns: Student ID, Name, Prelim, Midterm, Final (grades 1.00 to 5.00).');
  let added = 0, skipped = 0;
  rows.forEach(c => {
    const r = { sid: (c[is] || '').trim(), name: (c[inm] || '').trim(), p: num(c[ip]), m: num(c[im]), f: num(c[iff]), inc: ii >= 0 && /^(y|yes|1|true|inc)$/i.test((c[ii] || '').trim()) };
    const missing = !r.inc && (r.p == null || r.m == null || r.f == null);
    if (!r.sid || !r.name || missing || badGrade(r.p) || badGrade(r.m) || badGrade(r.f) || S.records.some(x => x.cls === S.cur && x.sid.toLowerCase() === r.sid.toLowerCase())) { skipped++; return; }
    S.records.push({ id: uid(), cls: S.cur, ...r }); added++;
  });
  save(); renderFac(); toast(`Imported ${added} record(s)${skipped ? `, skipped ${skipped} (invalid, out of 1.00 to 5.00, or duplicate)` : ''}.`);
};

// ----- settings -----
function fillSettings() {
  const w = S.set.weights; $('wp').value = w.p; $('wm').value = w.m; $('wf').value = w.f; $('ps').value = S.set.pass.toFixed(2); $('setErr').textContent = '';
  $('scaleBox').innerHTML = scaleAsc().map(([m, g], i) => `<div><label for="sc${i}">Grade ${g.toFixed(2)} = %</label><input id="sc${i}" data-g="${g}" type="number" min="0" max="100" step="any" value="${m}"></div>`).join('');
}
$('setForm').onsubmit = e => {
  e.preventDefault(); const w = { p: num($('wp').value), m: num($('wm').value), f: num($('wf').value) }, ps = num($('ps').value);
  const scale = [...$('scaleBox').querySelectorAll('input')].map(i => [num(i.value), +i.dataset.g]);
  const fail = m => { $('setErr').textContent = m; };
  if ([w.p, w.m, w.f].some(v => v == null || v < 0 || v > 100)) return fail('Weights must be 0 to 100.');
  if (ps == null || ps < 1 || ps > 5) return fail('Passing grade must be between 1.00 and 5.00.');
  if (Math.round((w.p + w.m + w.f) * 100) !== 10000) return fail(`Weights must add up to 100 (now ${w.p + w.m + w.f}).`);
  if (scale.some(s => s[0] == null || s[0] < 0 || s[0] > 100)) return fail('Every grade needs a percentage between 0 and 100.');
  for (let i = 1; i < scale.length; i++) if (scale[i][0] >= scale[i - 1][0]) return fail('Percentages must go down as the grade number goes up.');
  if (!scale.some(s => s[1] <= ps + EPS)) return fail('The scale needs at least one grade at or better than the passing grade.');
  S.set.weights = w; S.set.pass = ps; S.set.scale = scale; save(); toast('Settings saved.');
};
$('defBtn').onclick = () => { const t = S.set.theme; S.set = { ...clone(DEF), theme: t }; save(); fillSettings(); toast('Defaults restored.'); };
$('bkBtn').onclick = () => download('isu-grades-backup.json', JSON.stringify(S, null, 2), 'application/json');
$('rsBtn').onclick = () => $('rsFile').click();
$('rsFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); if (!Array.isArray(d.classes) || !Array.isArray(d.records)) throw 0;
    if (d.records.some(r => badGrade(r.p) || badGrade(r.m) || badGrade(r.f))) { toast('Backup has grades outside 1.00 to 5.00 (an old percentage backup?). Not restored.'); return; }
    if (!confirm('Replace all current data with this backup?')) return;
    S = { ...d, set: { ...clone(DEF), ...d.set } }; save(); setTheme(S.set.theme); fillSettings(); toast('Backup restored.');
  } catch { toast('That file is not a valid backup.'); }
};
$('smpBtn').onclick = () => {
  if (S.records.length && !confirm('Add sample data to your current records?')) return;
  const a = { id: uid(), subject: 'Subject 1', section: 'A', units: 3, sem: '1st Sem' }, b = { id: uid(), subject: 'Subject 2', section: 'A', units: 3, sem: '1st Sem' };
  S.classes.push(a, b); S.cur = a.id;
  [['00-0001', 'Student A', 1.25, 1.0, 1.25], ['00-0002', 'Student B', 2.0, 1.5, 1.75], ['00-0003', 'Student C', 1.0, 1.0, 1.0], ['00-0004', 'Student D', 3.25, 3.5, 3.0]].forEach(([sid, name, p, m, f]) => S.records.push({ id: uid(), cls: a.id, sid, name, p, m, f, inc: false }));
  S.records.push({ id: uid(), cls: a.id, sid: '00-0005', name: 'Student E', p: 1.75, m: 2.0, f: null, inc: true }, { id: uid(), cls: b.id, sid: '00-0001', name: 'Student A', p: 1.5, m: 1.5, f: 1.75, inc: false });
  save(); renderFac(); toast('Sample data loaded.');
};
$('clrBtn').onclick = () => { if (confirm('Erase all classes and records from this browser?') && confirm('This cannot be undone. Erase everything?')) { S = { set: S.set, classes: [], records: [], cur: null }; save(); renderFac(); toast('All data erased.'); } };

// ----- student -----
$('lookup').onsubmit = e => {
  e.preventDefault(); const id = $('sid').value.trim().toLowerCase(), res = $('res');
  const mine = S.records.filter(r => r.sid.toLowerCase() === id);
  $('lkErr').textContent = ''; res.classList.add('hidden');
  if (!mine.length) { $('lkErr').textContent = 'No records found for that Student ID.'; return; }
  const groups = {}; mine.forEach(r => { const c = S.classes.find(x => x.id === r.cls); if (c) (groups[c.sem] ||= []).push({ r, c, k: calc(r) }); });
  res.innerHTML = `<div class="card" style="margin-top:16px"><p class="eyebrow">Student information</p><h3>${esc(mine[0].name)}</h3><p class="mu" style="margin:0">Student ID: <b>${esc(mine[0].sid)}</b></p></div>` + Object.entries(groups).map(([sem, items]) => {
    const g = items.filter(x => x.k.g != null), u = g.reduce((a, x) => a + x.c.units, 0), gwa = u ? g.reduce((a, x) => a + x.c.units * x.k.g, 0) / u : null;
    return `<div class="card" style="margin-top:16px"><div class="gwa"><div><p class="eyebrow">${esc(sem)}</p><span class="mu">General weighted average · ${u} graded unit(s)</span></div><b>${fx(gwa)}</b></div><div class="tw"><table><thead><tr><th>Subject</th><th class="n">Units</th><th class="n">Prelim</th><th class="n">Midterm</th><th class="n">Final</th><th class="n">Weighted avg</th><th class="n">Equiv. %</th><th class="n">Grade</th><th>Remarks</th></tr></thead><tbody>${items.map(({ r, c, k }) => `<tr><td>${esc(c.subject)} · ${esc(c.section)}</td><td class="n">${c.units}</td><td class="n">${fx(r.p)}</td><td class="n">${fx(r.m)}</td><td class="n">${fx(r.f)}</td><td class="n">${fx(k.avg)}</td><td class="n">${pctTxt(k)}</td><td class="n"><b>${k.g != null ? fx(k.g) : 'INC'}</b></td><td><span class="tag ${k.st}">${k.st}</span></td></tr>`).join('')}</tbody></table></div></div>`;
  }).join('') + '<div class="row noprint" style="margin-top:14px"><button class="btn p" type="button" id="printBtn">' + ic('print') + 'Print report card</button></div>';
  res.classList.remove('hidden'); $('printBtn').onclick = () => print();
};
function fillTargets() { if ($('pt').options.length) return; passList().map(s => s[1]).forEach(g => $('pt').add(new Option(g.toFixed(2), g))); $('pt').value = '2'; plan(); }
// Worst weighted average that still rounds to grade g, then solve for the Final grade.
function plan() {
  const p = num($('pp').value), m = num($('pm').value), g = +$('pt').value, out = $('pr'), w = S.set.weights, t = w.p + w.m + w.f;
  if (p == null || m == null) { out.textContent = ''; return; }
  if (badGrade(p) || badGrade(m)) { out.textContent = 'Enter grades between 1.00 and 5.00.'; return; }
  const L = passList(), i = L.findIndex(s => s[1] === g);
  if (i < 0 || !w.f) { out.textContent = ''; return; }
  const maxAvg = i < L.length - 1 ? (g + L[i + 1][1]) / 2 : S.set.pass;
  const need = (maxAvg * t - p * w.p - m * w.m) / w.f;
  out.innerHTML = need < 1 ? `A grade of ${g.toFixed(2)} is not reachable, even with a 1.00 on the final.` : need >= 5 ? `You already have enough for ${g.toFixed(2)}, whatever the final is.` : `To get ${g.toFixed(2)}, score <b style="color:var(--g);font-size:1.4rem">${(Math.floor(need * 100 + 1e-9) / 100).toFixed(2)}</b> or better on the final.`;
}
['pp', 'pm', 'pt'].forEach(i => $(i).addEventListener('input', plan));
renderFac();
})();
