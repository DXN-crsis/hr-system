/* UI. Globals from logic.js: FIELDS, FIELD, LIST_FIELD, DEFAULT_LISTS, TYPES, norm, parseDate, fmtDate, service, show,
   spouseJobText, cleanRow, dupIndex, detectHeader, dataRows, toRaw, missing, audits, counted, EMP, EMP_OF */

const $ = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const icon = paths => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
const ICON_CARD = icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>')
const ICON_EDIT = icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>')
const ICON_TRASH =icon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>')

// per-viewer UI preferences only; employee data lives in data.json via the main process
const pref = (key, value) => {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key))
    localStorage.setItem(key, JSON.stringify(value))
  } catch { return null }
}

// fills missing fields so older/hand-edited backups can't break sorting and searching
const BLANK = Object.fromEntries(FIELDS.filter(f => f.type !== 'computed').map(f => [f.k, '']))
const normalizeData = d => ({
  lists: { ...structuredClone(DEFAULT_LISTS), ...d.lists },
  employees: d.employees.map(e => ({ ...BLANK, ...e, id: e.id || crypto.randomUUID() })),
})
let data = normalizeData({ employees: [] })
const state = { q: '', filters: {}, audit: null, editing: null }
const today = () => new Date().toLocaleDateString('en-GB').replaceAll('/', '-')
let loadFailed = false // never overwrite a data file we could not read

// In-page confirm: Electron's native confirm() breaks text-input focus on Windows.
function ask(message, okLabel = 'تأكيد', { danger = false, cancel = true } = {}) {
  const dlg = $('#dlg')
  $('#dlg-msg').textContent = message
  $('#dlg-ok').textContent = okLabel
  $('#dlg-ok').classList.toggle('danger', danger)
  $('#dlg-cancel').hidden = !cancel
  dlg.returnValue = ''
  dlg.showModal()
  return new Promise(resolve => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }))
}

async function save() {
  if (loadFailed) {
    toast('لم يُحفظ شيء لأن ملف البيانات لم يُقرأ. أعد تشغيل البرنامج.', true)
    return false
  }
  try {
    await api.save(data)
    return true
  } catch (e) {
    toast('تعذّر حفظ البيانات! ' + e.message, true)
    return false
  }
}

async function attempt(fn) {
  try { await fn() } catch (e) { toast('تعذّر تنفيذ العملية: ' + String(e.message).split('Error: ').pop(), true) }
}

let toastTimer
function toast(msg, bad = false) {
  const t = $('#toast')
  t.textContent = msg
  t.classList.toggle('bad', bad)
  t.hidden = false
  t.style.animation = 'none'
  void t.offsetWidth
  t.style.animation = ''
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { t.hidden = true }, bad ? 6000 : 2600)
}

/* ---------- navigation & theme ---------- */

function updatePill(smooth = true) {
  const btn = $('.nav-btn.active'), pill = $('#active-pill')
  const moved = pill.style.transform !== `translateX(${btn.offsetLeft}px)`
  pill.style.transition = smooth ? '' : 'none'
  pill.style.width = `${btn.offsetWidth}px`
  pill.style.transform = `translateX(${btn.offsetLeft}px)`
  if (smooth && moved) {
    pill.classList.remove('squish')
    void pill.offsetWidth // restart the animation
    pill.classList.add('squish')
  }
}

const calm = () => document.documentElement.classList.contains('lite') || matchMedia('(prefers-reduced-motion: reduce)').matches

// numbers count up, bars grow from zero
function animateHome(el) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('[data-w]', el).forEach(b => { b.style.width = `${b.dataset.w}%` })
  }))
  for (const n of $$('[data-count]', el)) {
    const target = +n.dataset.count, suffix = n.dataset.suffix || '', start = performance.now()
    const frame = now => {
      const p = calm() ? 1 : Math.min(1, (now - start) / 900)
      n.textContent = Math.round(target * (1 - (1 - p) ** 3)).toLocaleString('en-US') + suffix
      if (p < 1) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }
}

function go(page) {
  $$('.page').forEach(p => { p.hidden = p.id !== `page-${page}` })
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page))
  if (page !== 'form') setFormLabel(false)
  if (page === 'home') renderHome()
  if (page === 'list') renderList()
  if (page === 'settings') renderLists()
  updatePill()
  window.scrollTo(0, 0)
}

function setFormLabel(editing) {
  $('#form-nav-label').textContent = editing ? 'تعديل موظف' : 'إضافة موظف'
}

function refreshSchools() {
  $('#dl-schools').innerHTML = data.lists.schools.map(s => `<option value="${esc(s)}">`).join('')
}

/* ---------- home ---------- */

const STAT_GROUPS = [['school', 'حسب المدرسة'], ['title', 'حسب العنوان الوظيفي'], ['cert', 'حسب الشهادة'], ['type', 'حسب نوع التعيين'],
  ['status', 'حسب حالة الموظف'], ['gender', 'حسب الجنس'], ['marital', 'حسب الحالة الزوجية']]

function renderHome() {
  const el = $('#page-home'), emps = data.employees
  if (!emps.length) {
    el.innerHTML = `<div class="card empty">
      <div class="big" aria-hidden="true">👥</div>
      <h1>أهلاً بك في نظام إدارة الموارد البشرية</h1>
      <p class="muted">لا يوجد موظفون بعد. ابدأ بإضافة موظف، أو استورد قائمة جاهزة من Excel أو Word.</p>
      <div class="actions"><button class="btn primary" data-go="form">إضافة موظف</button><button class="btn" data-go="import">استيراد من ملف</button></div>
    </div>`
    return
  }
  const incomplete = emps.filter(e => missing(e).length).length
  const salaries = emps.reduce((sum, e) => sum + (+e.salary || 0), 0)
  const tiles = [
    ['إجمالي الموظفين', emps.length, 'data-go="list"'],
    ['سجلات مكتملة', emps.length - incomplete, 'data-go="list"'],
    ['سجلات ناقصة', incomplete, 'data-audit="incomplete"', incomplete ? 'warn' : ''],
    ['مجموع الرواتب الاسمية', salaries, 'data-go="list"', '', ' د.ع'],
  ]
  el.innerHTML = `
    <header class="page-head"><div><h1>لوحة المعلومات</h1>
      <p class="muted">${esc(new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}</p></div></header>
    <div class="tiles">${tiles.map(([label, value, attr, cls = '', suffix = '']) =>
      `<button class="card tile ${cls}" ${attr}><span class="muted">${label}</span>
        <strong data-count="${value}" data-suffix="${suffix}">0${suffix}</strong></button>`).join('')}</div>
    <div class="card"><h2>تدقيق البيانات</h2><div class="audits">${audits(emps).map(a =>
      `<button class="audit ${a.n ? 'warn' : 'ok'}" data-audit="${a.k}" ${a.n ? '' : 'disabled'}>
        <span class="mark" aria-hidden="true">${a.n ? '!' : '✓'}</span>${a.label}<b>${a.n}</b></button>`).join('')}</div></div>
    <div class="stats">${STAT_GROUPS.map(([k, title]) => statCard(k, title, emps)).join('')}</div>`
  animateHome(el)
}

function statCard(k, title, emps) {
  const counts = new Map()
  emps.forEach(e => counts.set(e[k] || '', (counts.get(e[k] || '') || 0) + 1))
  const rows = [...counts].sort((a, b) => b[1] - a[1])
  const max = rows[0][1]
  return `<div class="card stat"><h2>${title}</h2>${rows.map(([v, n]) => `
    <button class="bar-row" ${v ? `data-fk="${k}" data-fv="${esc(v)}"` : 'disabled'} title="${esc(v || 'غير محدد')}: ${n} (${Math.round(n / emps.length * 100)}%)">
      <span class="bar-label">${esc(v || 'غير محدد')}</span>
      <span class="bar-track"><span class="bar" data-w="${n / max * 100}"></span></span>
      <span class="bar-n">${n}</span>
    </button>`).join('')}</div>`
}

/* ---------- employee list ---------- */

const DEFAULT_COLS = ['empNo', 'name', 'school', 'title', 'cert', 'type', 'service', 'status']
let cols = pref('cols') || DEFAULT_COLS
const visibleFields = () => FIELDS.filter(f => cols.includes(f.k))
const FILTER_OPTS = () => ({ school: data.lists.schools, title: data.lists.titles, cert: data.lists.certs, type: TYPES, status: data.lists.statuses })
const MAX_ROWS = 1000 // ponytail: plain DOM table; virtualize if lists grow far past this

function filtered() {
  // normalise word by word so "رنا" doesn't match across the gap in "جبار ناصر"
  const words = s => ` ${String(s ?? '').split(/\s+/).map(norm).filter(Boolean).join(' ')}`
  const q = words(state.q).trim()
  const audit = state.audit && audits(data.employees).find(a => a.k === state.audit)
  return data.employees
    .filter(e => (!q || [e.name, e.empNo, e.mother].some(v => words(v).includes(' ' + q)))
      && Object.entries(state.filters).every(([k, v]) => !v || e[k] === v)
      && (!audit || audit.test(e)))
    .sort((a, b) => a.school.localeCompare(b.school, 'ar') || a.name.localeCompare(b.name, 'ar'))
}

function filterText() {
  const parts = Object.entries(state.filters).filter(([, v]) => v).map(([k, v]) => `${FIELD[k].label}: ${v}`)
  if (state.audit) parts.push(audits(data.employees).find(a => a.k === state.audit).label)
  if (state.q) parts.push(`بحث: ${state.q}`)
  return parts.join(' — ')
}

function renderList() {
  const opts = FILTER_OPTS()
  $$('[data-filter]').forEach(s => {
    const k = s.dataset.filter
    s.innerHTML = `<option value="">${FIELD[k].label}: الكل</option>` +
      opts[k].map(o => `<option ${state.filters[k] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')
  })
  $('#q').value = state.q
  const chips = Object.entries(state.filters).filter(([k, v]) => v && !opts[k]).map(([k, v]) => [k, `${FIELD[k].label}: ${v}`])
  if (state.audit) chips.push(['audit', audits(data.employees).find(a => a.k === state.audit).label])
  $('#chips').innerHTML = chips.map(([k, label]) => `<button class="chip" data-chip="${k}" title="إزالة التصفية">${esc(label)} ×</button>`).join('')
  $('#cols-menu').innerHTML = FIELDS.map(f =>
    `<label><input type="checkbox" data-col="${f.k}" ${cols.includes(f.k) ? 'checked' : ''}>${f.label}</label>`).join('')
  renderTable()
}

function renderTable() {
  const rows = filtered(), fields = visibleFields()
  $('#list-count').textContent = rows.length === data.employees.length
    ? counted(rows.length, EMP) : `${rows.length} من أصل ${counted(data.employees.length, EMP_OF)}`
  $('#emp-table').innerHTML = `
    <thead><tr><th>ت</th>${fields.map(f => `<th>${f.label}</th>`).join('')}<th><span hidden>إجراءات</span></th></tr></thead>
    <tbody>${rows.length ? rows.slice(0, MAX_ROWS).map((e, i) => `
      <tr data-edit="${e.id}" title="اضغط للتعديل"><td>${i + 1}</td>${fields.map(f => `<td>${esc(show(e, f.k))}</td>`).join('')}
        <td><div class="row-actions">
          <button class="icon-btn" data-edit="${e.id}" title="تعديل" aria-label="تعديل ${esc(e.name)}">${ICON_EDIT}</button>
          <button class="icon-btn" data-card="${e.id}" title="بطاقة الموظف (Word)" aria-label="بطاقة الموظف">${ICON_CARD}</button>
          <button class="icon-btn danger" data-del="${e.id}" title="حذف" aria-label="حذف">${ICON_TRASH}</button>
        </div></td></tr>`).join('')
      : `<tr><td class="no-rows" colspan="${fields.length + 2}">${data.employees.length ? 'لا توجد نتائج مطابقة' : 'لا يوجد موظفون بعد'}</td></tr>`}
    </tbody>`
  $('#list-more').hidden = rows.length <= MAX_ROWS
  $('#list-more').textContent = `يُعرض أول ${MAX_ROWS} موظف فقط. استخدم البحث أو التصفية لتضييق القائمة؛ التصدير يشمل الجميع.`
}

async function exportList(kind) {
  const rows = filtered()
  if (!rows.length) return toast('لا يوجد موظفون للتصدير', true)
  const fields = kind === 'xlsx' ? FIELDS : visibleFields()
  const payload = {
    name: `كشف الموظفين ${today()}`,
    title: 'كشف الموظفين',
    subtitle: [filterText(), `عدد الموظفين: ${rows.length}`, `التاريخ: ${today()}`].filter(Boolean).join('   |   '),
    headers: ['ت', ...fields.map(f => f.label)],
    rows: rows.map((e, i) => [i + 1, ...fields.map(f => show(e, f.k))]),
  }
  if (await (kind === 'xlsx' ? api.exportXlsx(payload) : api.exportDocx(payload))) toast(`تم التصدير إلى ${kind === 'xlsx' ? 'Excel' : 'Word'}`)
}

/* ---------- form ---------- */

const GROUPS = [
  ['البيانات الشخصية', ['empNo', 'name', 'gender', 'mother', 'birth', 'address']],
  ['الحالة الزوجية', ['marital', 'spouse', 'spouseJob', 'kids']],
  ['الوظيفة', ['school', 'title', 'grade', 'salary', 'status', 'position']],
  ['الشهادة', ['cert', 'spec', 'uni']],
  ['التعيين والخدمة', ['appoint', 'type', 'placement', 'start', 'service']],
  ['ملاحظات', ['notes']],
]
const SEG = ['gender', 'marital', 'type', 'spouseJob']

// spouse fields only for married employees, placement order only for contracts
const applies = (k, e) =>
  k === 'spouse' || k === 'spouseJob' ? e.marital === 'متزوج' : k === 'placement' ? e.type === 'عقد' : true

const fieldLabel = (f, e) =>
  f.k === 'spouse' ? (e.gender === 'أنثى' ? 'اسم الزوج الرباعي' : 'اسم الزوجة الرباعي')
    : f.k === 'spouseJob' ? (e.gender === 'أنثى' ? 'حالة الزوج' : 'حالة الزوجة') : f.label

function control(f) {
  if (SEG.includes(f.k)) {
    const opts = f.k === 'spouseJob' ? [['0', ''], ['1', '']] : f.opts.map(o => [o, o])
    return `<div class="seg" role="radiogroup" aria-label="${f.label}">${opts.map(([v, t]) =>
      `<label><input type="radio" name="${f.k}" value="${esc(v)}"><span>${esc(t)}</span></label>`).join('')}</div>`
  }
  const id = `id="f-${f.k}" name="${f.k}"`
  if (f.k === 'school') return `<input ${id} list="dl-schools" autocomplete="off" placeholder="اختر أو اكتب اسم مدرسة جديدة">`
  switch (f.type) {
    case 'list': return `<select ${id}></select>`
    // plain text in d/m/yyyy: native date inputs follow the Windows region (often mm/dd/yyyy)
    case 'date':
    case 'pdate': return `<input ${id} type="text" dir="ltr" inputmode="numeric" autocomplete="off"
      placeholder="${f.type === 'pdate' ? 'سنة، أو شهر/سنة، أو يوم/شهر/سنة' : 'يوم/شهر/سنة'}">`
    case 'int': return `<input ${id} type="number" min="0" max="30" step="1">`
    case 'money': return `<input ${id} type="number" min="0" step="1000" placeholder="بالدينار العراقي">`
    case 'computed': return `<output id="f-${f.k}" class="computed">—</output>`
    default: return f.k === 'notes' ? `<textarea ${id} rows="3"></textarea>` : `<input ${id} type="text">`
  }
}

function buildForm() {
  $('#page-form').innerHTML = `
    <header class="page-head">
      <div><h1 id="form-title">إضافة موظف</h1><p class="muted">الحقول المعلّمة بـ <span class="req">*</span> مطلوبة، والباقي يمكن إكماله لاحقاً</p></div>
      <div class="actions"><button type="button" class="btn" data-form-cancel>إلغاء</button><button class="btn primary" form="emp-form">حفظ</button></div>
    </header>
    <form id="emp-form" novalidate>
      ${GROUPS.map(([title, keys]) => `<section class="card"><h2>${title}</h2><div class="fields">${keys.map(k => {
        const f = FIELD[k]
        const tag = SEG.includes(k) || f.type === 'computed' ? 'span' : 'label'
        return `<div class="field ${k === 'notes' ? 'wide' : ''}" data-k="${k}">
          <${tag} class="label" ${tag === 'label' ? `for="f-${k}"` : ''}>${f.label}${f.req ? ' <span class="req">*</span>' : ''}</${tag}>
          ${control(f)}<small class="err"></small></div>`
      }).join('')}</div></section>`).join('')}
      <div class="form-foot"><button type="button" class="btn" data-form-cancel>إلغاء</button><button class="btn primary">حفظ</button></div>
    </form>`
  const form = $('#emp-form')
  form.addEventListener('input', ev => {
    const field = ev.target.closest('.field')
    if (field?.classList.contains('invalid')) { field.classList.remove('invalid'); $('.err', field).textContent = '' }
    syncForm()
  })
  form.addEventListener('change', syncForm)
  form.addEventListener('submit', submitForm)
}

function openForm(emp) {
  state.editing = emp?.id ?? null
  const form = $('#emp-form')
  form.reset()
  refreshSchools()
  for (const f of FIELDS.filter(f => f.type === 'list' && !SEG.includes(f.k) && f.k !== 'school')) {
    const opts = data.lists[f.opts], v = emp?.[f.k]
    const all = v && !opts.includes(v) ? [...opts, v] : opts // keep a value that was since removed from the list
    form.elements[f.k].innerHTML = '<option value="">— اختر —</option>' + all.map(o => `<option>${esc(o)}</option>`).join('')
  }
  const e = emp ?? {
    gender: 'ذكر',
    status: data.lists.statuses.includes('مستمر بالخدمة') ? 'مستمر بالخدمة' : '',
    school: data.lists.schools.length === 1 ? data.lists.schools[0] : '',
  }
  for (const f of FIELDS) {
    const v = e[f.k] ?? ''
    if (f.type === 'computed') continue
    if (SEG.includes(f.k)) $$(`[name="${f.k}"]`, form).forEach(r => { r.checked = r.value === v })
    else form.elements[f.k].value = f.type === 'date' || f.type === 'pdate' ? fmtDate(v) : v
  }
  $$('.field', form).forEach(el => { el.classList.remove('invalid'); $('.err', el).textContent = '' })
  $('#form-title').textContent = emp ? `تعديل: ${emp.name}` : 'إضافة موظف'
  syncForm()
  go('form')
  setFormLabel(!!emp)
  updatePill()
  if (!emp) form.elements.empNo.focus()
}

function readForm() {
  const form = $('#emp-form'), raw = {}
  for (const f of FIELDS) {
    if (f.type === 'computed') continue
    if (SEG.includes(f.k)) raw[f.k] = $(`[name="${f.k}"]:checked`, form)?.value ?? ''
    else raw[f.k] = form.elements[f.k].value
  }
  return raw
}

function syncForm() {
  const raw = readForm(), form = $('#emp-form')
  $$('.field', form).forEach(el => { el.hidden = !applies(el.dataset.k, raw) })
  $('[data-k="spouse"] .label', form).textContent = fieldLabel(FIELD.spouse, raw)
  $('[data-k="spouseJob"] .label', form).textContent = fieldLabel(FIELD.spouseJob, raw)
  $$('[name="spouseJob"] + span', form).forEach((s, i) => { s.textContent = spouseJobText(raw, i) })
  $('#f-service').textContent = service(parseDate(raw.start)) || '—'
}

async function submitForm(ev) {
  ev.preventDefault()
  const form = ev.target, raw = readForm()
  const { emp, errors } = cleanRow(raw, data.lists)
  for (const k of Object.keys(errors)) if (!applies(k, raw)) delete errors[k]
  $$('.field', form).forEach(el => {
    const msg = errors[el.dataset.k] || ''
    el.classList.toggle('invalid', !!msg)
    $('.err', el).textContent = msg
  })
  if (Object.keys(errors).length) {
    $('.field.invalid :is(input, select, textarea)', form)?.focus()
    return toast('راجع الحقول المعلّمة بالأحمر', true)
  }
  for (const k of ['spouse', 'spouseJob', 'placement']) if (!applies(k, emp)) emp[k] = ''
  const others = data.employees.filter(e => e.id !== state.editing)
  if (dupIndex(others).has(emp) &&
    !await ask('يوجد موظف مسجّل بنفس الرقم الوظيفي، أو بنفس الاسم واسم الأم.\nهل تريد الحفظ على أي حال؟', 'حفظ على أي حال')) return
  if (!data.lists.schools.includes(emp.school)) data.lists.schools.push(emp.school)
  const editing = state.editing
  if (editing) Object.assign(data.employees.find(e => e.id === editing), emp)
  else data.employees.push({ id: crypto.randomUUID(), ...emp })
  if (!await save()) return
  toast(editing ? 'تم حفظ التعديلات' : `تمت إضافة ${emp.name}`)
  if (editing) go('list')
  else openForm(null)
}

/* ---------- settings: lists, backup ---------- */

const LIST_TITLES = { schools: 'المدارس', titles: 'العناوين الوظيفية', certs: 'الشهادات', statuses: 'حالات الموظف' }

function renderLists() {
  $('#lite').checked = !!pref('lite')
  $('#lists').innerHTML = Object.entries(LIST_TITLES).map(([key, title]) => `
    <div class="card list-card" data-list="${key}"><h2>${title}</h2>
      <ul>${data.lists[key].map((v, i) => {
        const n = data.employees.filter(e => e[LIST_FIELD[key]] === v).length
        return `<li><input value="${esc(v)}" data-i="${i}" aria-label="تعديل ${esc(v)}">
          <span class="count" title="عدد الموظفين">${n}</span>
          <button class="icon-btn danger" data-list-del="${i}" ${n ? 'disabled title="لا يمكن الحذف: مستخدم لدى موظفين"' : 'title="حذف"'} aria-label="حذف">×</button></li>`
      }).join('') || '<li class="muted">القائمة فارغة</li>'}</ul>
      <form class="add-row" data-list-add="${key}"><input placeholder="إضافة عنصر جديد" aria-label="عنصر جديد"><button class="btn">إضافة</button></form>
    </div>`).join('')
}

async function renameListItem(input) {
  const key = input.closest('[data-list]').dataset.list, list = data.lists[key], i = +input.dataset.i
  const old = list[i], v = input.value.replace(/\s+/g, ' ').trim()
  if (v === old) return
  if (!v || list.some((x, j) => j !== i && norm(x) === norm(v))) {
    input.value = old
    return toast('الاسم فارغ أو موجود مسبقاً', true)
  }
  list[i] = v
  data.employees.forEach(e => { if (e[LIST_FIELD[key]] === old) e[LIST_FIELD[key]] = v })
  if (await save()) toast(`تم تغيير «${old}» إلى «${v}» لدى جميع الموظفين`)
  renderLists()
}

/* ---------- import ---------- */

let imp = null // { name, sheets: [{ name, rows }], sheet, header: { index, map }, defSchool, ok }

function headerFor(rows) {
  const h = detectHeader(rows)
  const map = h.index < 0 ? [] : h.map.map(k => (FIELD[k]?.type === 'computed' ? '' : k))
  return { index: h.index, map }
}

async function startImport() {
  const file = await api.importOpen()
  if (!file) return
  const sheets = file.html
    ? [{ name: 'Word', rows: $$('tr', new DOMParser().parseFromString(file.html, 'text/html')).map(tr => [...tr.cells].flatMap(td => Array(td.colSpan || 1).fill(td.textContent.replace(/\s+/g, ' ').trim()))) }]
    : file.sheets
  if (!sheets.some(s => s.rows.length)) return toast('الملف لا يحتوي على جداول', true)
  // choose the sheet with the most data rows under a recognised header
  const scored = sheets.map((s, i) => {
    const header = headerFor(s.rows)
    return { i, header, n: header.index < 0 ? -1 : dataRows(s.rows, header.index).length }
  }).sort((a, b) => b.n - a.n)
  imp = { name: file.name, sheets, sheet: scored[0].i, header: scored[0].header, defSchool: '' }
  if (scored[0].n < 0) toast('لم يتعرف البرنامج على عناوين الأعمدة؛ حدّد حقل كل عمود من القوائم', true)
  renderImport()
  $('#import-preview').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function renderImport() {
  const el = $('#import-preview')
  if (!imp) { el.hidden = true; el.innerHTML = ''; return }
  const sheet = imp.sheets[imp.sheet], { index, map } = imp.header
  const rows = dataRows(sheet.rows, index)
  const width = rows.reduce((w, r) => Math.max(w, r.length), map.length)
  const idx = dupIndex(data.employees)
  const results = rows.map(row => {
    const raw = toRaw(row, map)
    if (!String(raw.school ?? '').trim() && imp.defSchool) raw.school = imp.defSchool
    const r = cleanRow(raw, data.lists)
    r.row = row
    r.bad = Object.keys(r.errors).length > 0
    r.dup = !r.bad && idx.has(r.emp)
    if (!r.bad && !r.dup) idx.add(r.emp)
    return r
  })
  imp.ok = results.filter(r => !r.bad && !r.dup)
  const bad = results.filter(r => r.bad).length, dups = results.filter(r => r.dup).length
  const fixes = results.reduce((n, r) => n + Object.keys(r.fixes).length, 0)
  const newSchools = [...new Set(imp.ok.map(r => r.emp.school).filter(s => !data.lists.schools.some(x => norm(x) === norm(s))))]
  const rank = r => (r.bad ? 0 : r.dup ? 1 : Object.keys(r.fixes).length ? 2 : 3)
  const shown = [...results].sort((a, b) => rank(a) - rank(b)).slice(0, 300)
  const fieldOpts = FIELDS.filter(f => f.type !== 'computed')

  el.innerHTML = `<div class="card import">
    <header class="page-head">
      <div><h2>معاينة الاستيراد: ${esc(imp.name)}</h2>
        <p class="muted">تأكد أن كل عمود مربوط بالحقل الصحيح. الصفوف التي فيها أخطاء أو مكررة لن تُستورد، ويمكنك تصحيح الملف وإعادة استيراده.</p></div>
      <div class="actions"><button class="btn" data-imp="cancel">إلغاء</button>
        <button class="btn primary" data-imp="commit" ${imp.ok.length ? '' : 'disabled'}>استيراد ${counted(imp.ok.length, EMP_OF)}</button></div>
    </header>
    <div class="imp-opts">
      ${imp.sheets.length > 1 ? `<label>الورقة <select data-imp-sheet>${imp.sheets.map((s, i) =>
        `<option value="${i}" ${i === imp.sheet ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''}
      <label>مدرسة للصفوف التي بلا مدرسة <input data-imp-school list="dl-schools" value="${esc(imp.defSchool)}" placeholder="اختياري"></label>
    </div>
    <div class="summary">
      <span class="pill ok">✓ سليم: ${imp.ok.length}</span>
      <span class="pill bad">✗ فيه أخطاء: ${bad}</span>
      <span class="pill warn">⧉ مكرر: ${dups}</span>
      <span class="pill info">تصحيحات تلقائية: ${fixes}</span>
      ${newSchools.length ? `<span class="pill info">مدارس جديدة: ${esc(newSchools.join('، '))}</span>` : ''}
    </div>
    <div class="table-wrap"><table class="imp-table">
      <thead><tr><th>الحالة</th>${Array.from({ length: width }, (_, i) => `<th>
        <div class="src" title="${esc(sheet.rows[index]?.[i])}">${esc(sheet.rows[index]?.[i] || `عمود ${i + 1}`)}</div>
        <select data-imp-col="${i}" class="${map[i] ? '' : 'unmapped'}" aria-label="حقل العمود ${i + 1}">
          <option value="">— تجاهل —</option>${fieldOpts.map(f => `<option value="${f.k}" ${map[i] === f.k ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select></th>`).join('')}</tr></thead>
      <tbody>${shown.map(r => {
        const errs = Object.entries(r.errors).map(([k, m]) => `${FIELD[k].label}: ${m}`)
        const status = r.bad ? `✗ ${errs[0]}${errs.length > 1 ? ` (+${errs.length - 1})` : ''}` : r.dup ? '⧉ موجود مسبقاً' : '✓ سليم'
        return `<tr class="${r.bad ? 'r-bad' : r.dup ? 'r-dup' : 'r-ok'}"><td class="st" title="${esc(errs.join('\n'))}">${esc(status)}</td>${Array.from({ length: width }, (_, i) => {
          const k = map[i], err = k && r.errors[k], fix = k && r.fixes[k]
          const val = k && !err ? show(r.emp, k) : r.row[i]
          return `<td class="${err ? 'c-err' : fix ? 'c-fix' : ''}" title="${esc(err || fix || '')}">${esc(val)}</td>`
        }).join('')}</tr>`
      }).join('') || `<tr><td class="no-rows" colspan="${width + 1}">لا توجد صفوف بيانات</td></tr>`}</tbody>
    </table></div>
    ${results.length > shown.length ? `<p class="muted">تُعرض ${shown.length} صف من ${results.length} (الصفوف التي فيها مشاكل أولاً).</p>` : ''}
  </div>`
  el.hidden = false
}

async function commitImport() {
  for (const { emp } of imp.ok) {
    const school = data.lists.schools.find(s => norm(s) === norm(emp.school))
    if (school) emp.school = school
    else data.lists.schools.push(emp.school)
    data.employees.push({ id: crypto.randomUUID(), ...emp })
  }
  if (!await save()) return
  toast(`تم استيراد ${counted(imp.ok.length, EMP_OF)}`)
  imp = null
  renderImport()
  Object.assign(state, { q: '', filters: {}, audit: null })
  go('list')
}

/* ---------- events ---------- */

document.addEventListener('click', ev => {
  const t = ev.target.closest('button, tr[data-edit]')
  if (!t) return
  const byId = id => data.employees.find(e => e.id === id)
  const d = t.dataset
  if (t.matches('.nav-btn')) return d.page === 'form' ? openForm(null) : go(d.page)
  if (d.go === 'form') return openForm(null)
  if (d.go === 'import') { go('settings'); return attempt(startImport) }
  if (d.go === 'list' || d.audit || d.fk) {
    Object.assign(state, { q: '', filters: d.fk ? { [d.fk]: d.fv } : {}, audit: d.audit || null })
    return go('list')
  }
  if (d.chip) {
    if (d.chip === 'audit') state.audit = null
    else delete state.filters[d.chip]
    return renderList()
  }
  if (d.card) {
    const e = byId(d.card)
    return attempt(async () => {
      const rows = FIELDS.filter(f => applies(f.k, e)).map(f => [fieldLabel(f, e), show(e, f.k)])
      if (await api.exportDocx({ name: `بطاقة ${e.name}`, title: 'بطاقة بيانات موظف', subtitle: `${e.school}   |   ${today()}`, rows })) toast('تم حفظ بطاقة الموظف')
    })
  }
  if (d.del) {
    const e = byId(d.del)
    return ask(`هل تريد حذف «${e.name}» نهائياً؟`, 'حذف', { danger: true }).then(async yes => {
      if (!yes) return
      data.employees = data.employees.filter(x => x !== e)
      if (await save()) toast(`تم حذف ${e.name}`)
      renderTable()
    })
  }
  if (d.edit) return openForm(byId(d.edit))
  if (d.formCancel !== undefined) return go(state.editing ? 'list' : 'home')
  if (d.listDel) {
    const key = t.closest('[data-list]').dataset.list
    data.lists[key].splice(+d.listDel, 1)
    return save().then(renderLists)
  }
  if (d.imp === 'cancel') { imp = null; return renderImport() }
  if (d.imp === 'commit') return attempt(commitImport)
})

$('#q').addEventListener('input', e => { state.q = e.target.value; renderTable() })
$$('[data-filter]').forEach(s => s.addEventListener('change', () => { state.filters[s.dataset.filter] = s.value; renderTable() }))
$('#cols-menu').addEventListener('change', e => {
  const k = e.target.dataset.col
  cols = e.target.checked ? [...cols, k] : cols.filter(c => c !== k)
  if (!cols.includes('name')) cols.push('name')
  pref('cols', cols)
  renderList()
})
$('#export-xlsx').addEventListener('click', () => attempt(() => exportList('xlsx')))
$('#export-docx').addEventListener('click', () => attempt(() => exportList('docx')))

$('#lists').addEventListener('change', e => { if (e.target.matches('input[data-i]')) renameListItem(e.target) })
$('#lists').addEventListener('submit', async e => {
  e.preventDefault()
  const key = e.target.dataset.listAdd, input = $('input', e.target), v = input.value.replace(/\s+/g, ' ').trim()
  if (!v) return
  if (data.lists[key].some(x => norm(x) === norm(v))) return toast('العنصر موجود مسبقاً', true)
  data.lists[key].push(v)
  if (await save()) toast(`تمت إضافة «${v}»`)
  renderLists()
  $(`[data-list-add="${key}"] input`).focus()
})

$('#import-btn').addEventListener('click', () => attempt(startImport))
$('#import-preview').addEventListener('change', e => {
  const t = e.target
  if (t.dataset.impCol !== undefined) {
    const map = imp.header.map, i = +t.dataset.impCol
    if (t.value) map.forEach((k, j) => { if (k === t.value) map[j] = '' }) // one column per field
    map[i] = t.value
  } else if (t.dataset.impSheet !== undefined) {
    imp.sheet = +t.value
    imp.header = headerFor(imp.sheets[imp.sheet].rows)
  } else if (t.dataset.impSchool !== undefined) {
    imp.defSchool = t.value.replace(/\s+/g, ' ').trim()
  } else return
  renderImport()
})

$('#backup-export').addEventListener('click', () => attempt(async () => {
  if (await api.backupExport(data)) toast('تم حفظ النسخة الاحتياطية')
}))
$('#backup-import').addEventListener('click', async () => {
  let backup
  try { backup = await api.backupImport() } catch { return toast('الملف المختار ليس نسخة احتياطية صالحة من هذا البرنامج', true) }
  if (!backup) return
  if (!await ask(`ستُستبدل جميع البيانات الحالية (${counted(data.employees.length, EMP)}) بالنسخة المختارة (${counted(backup.employees.length, EMP)}).\nهل أنت متأكد؟`, 'استبدال البيانات', { danger: true })) return
  data = normalizeData(backup)
  if (await save()) toast('تمت استعادة النسخة الاحتياطية')
  go('home')
})

$('#lite').addEventListener('change', e => {
  pref('lite', e.target.checked)
  document.documentElement.classList.toggle('lite', e.target.checked)
})

$('#theme-btn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  pref('theme', next)
})

$('#nav').addEventListener('mousemove', e => {
  const rect = $('#nav').getBoundingClientRect()
  $('#glare').style.setProperty('--x', `${e.clientX - rect.left}px`)
  $('#glare').style.setProperty('--y', `${e.clientY - rect.top}px`)
})

// background light follows the cursor; cards get a soft highlight under it (one update per frame)
let pointerFrame = 0
document.addEventListener('mousemove', e => {
  if (pointerFrame) return
  pointerFrame = requestAnimationFrame(() => {
    pointerFrame = 0
    if (calm()) return
    $('#spot').style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
    const card = e.target.closest?.('.card')
    if (card) {
      const r = card.getBoundingClientRect()
      card.style.setProperty('--gx', `${e.clientX - r.left}px`)
      card.style.setProperty('--gy', `${e.clientY - r.top}px`)
    }
  })
})

window.addEventListener('resize', () => updatePill(false))

/* ---------- start ---------- */

document.documentElement.dataset.theme = pref('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
document.documentElement.classList.toggle('lite', !!pref('lite'))

;(async () => {
  buildForm()
  const saved = await api.load().catch(e => ({ error: e.message }))
  if (saved && !saved.corrupt && !saved.error) data = normalizeData(saved)
  loadFailed = !!saved?.error
  refreshSchools()
  go('home')
  const ok = { cancel: false }
  if (saved?.corrupt) ask(`تعذّرت قراءة ملف البيانات، وحُفظت نسخة منه باسم:\n${saved.corrupt}\n\nيمكنك استعادة آخر نسخة احتياطية من صفحة الإعدادات.`, 'حسناً', ok)
  if (saved?.error) ask(`تعذّر تحميل البيانات: ${saved.error}\nلن يُحفظ أي تعديل حتى تُعيد تشغيل البرنامج.`, 'حسناً', ok)
  updatePill(false)
  document.fonts.ready.then(() => updatePill(false))
})()
