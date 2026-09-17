// Pure logic shared by the UI (app.js) and the self-check (check.js).

const GENDERS = ['ذكر', 'أنثى']
const MARITAL = ['أعزب', 'متزوج', 'مطلق', 'أرمل']
const TYPES = ['ملاك', 'عقد']

const DEFAULT_LISTS = {
  schools: [],
  titles: ['مدرس', 'معلم', 'كاتب', 'حرفي', 'موظف خدمات', 'حارس'],
  certs: ['بكالوريوس', 'دبلوم', 'إعدادية', 'متوسطة', 'ابتدائية', 'يقرأ ويكتب'],
  statuses: ['مستمر بالخدمة', 'إجازة', 'منقول', 'متقاعد'],
}

// type: text | list | date | pdate (year, optional month/day) | int | money | spouseJob | computed
// opts: a fixed array, or the key of an editable list in data.lists
const FIELDS = [
  { k: 'empNo', label: 'الرقم الوظيفي', type: 'text', alias: ['الرقم الوظيفي', 'رقم الموظف'] },
  { k: 'school', label: 'المدرسة', type: 'list', opts: 'schools', req: true, alias: ['المدرسة', 'مكان العمل', 'جهة العمل'] },
  { k: 'name', label: 'اسم الموظف الرباعي', type: 'text', req: true, alias: ['اسم الموظف', 'الاسم'] },
  { k: 'gender', label: 'الجنس', type: 'list', opts: GENDERS, alias: ['الجنس'] },
  { k: 'mother', label: 'اسم الأم الثلاثي', type: 'text', alias: ['اسم الأم', 'الأم'] },
  { k: 'birth', label: 'تاريخ التولد', type: 'date', alias: ['تاريخ التولد', 'التولد', 'الميلاد', 'المواليد'] },
  { k: 'address', label: 'عنوان السكن', type: 'text', alias: ['عنوان السكن', 'السكن', 'العنوان'] },
  { k: 'marital', label: 'الحالة الزوجية', type: 'list', opts: MARITAL, syn: { 'عزباء': 'أعزب', 'باكر': 'أعزب' }, alias: ['الحالة الزوجية', 'الحالة الاجتماعية'] },
  { k: 'spouse', label: 'اسم الزوج/الزوجة الرباعي', type: 'text', alias: ['اسم الزوج', 'الزوجة', 'الزوج'] },
  { k: 'spouseJob', label: 'حالة الزوج/الزوجة', type: 'spouseJob', alias: ['حالة الزوج', 'عمل الزوج'] },
  { k: 'kids', label: 'عدد الأطفال', type: 'int', alias: ['الأطفال', 'الأولاد', 'الابناء'] },
  { k: 'title', label: 'العنوان الوظيفي', type: 'list', opts: 'titles', alias: ['العنوان الوظيفي', 'الوظيفة', 'المسمى الوظيفي'] },
  { k: 'grade', label: 'الدرجة الوظيفية', type: 'text', alias: ['الدرجة'] },
  { k: 'salary', label: 'الراتب الاسمي', type: 'money', alias: ['الراتب'] },
  { k: 'status', label: 'حالة الموظف', type: 'list', opts: 'statuses', alias: ['حالة الموظف'] },
  { k: 'position', label: 'تاريخ استلام المنصب الحالي', type: 'date', alias: ['استلام المنصب', 'المنصب'] },
  { k: 'cert', label: 'الشهادة', type: 'list', opts: 'certs', alias: ['الشهادة', 'التحصيل', 'المؤهل'] },
  { k: 'spec', label: 'التخصص الدقيق', type: 'text', alias: ['التخصص', 'الاختصاص'] },
  { k: 'uni', label: 'الجامعة/الكلية/المعهد', type: 'text', alias: ['الجامعة', 'الكلية', 'المعهد'] },
  { k: 'appoint', label: 'تاريخ التعيين', type: 'pdate', alias: ['تاريخ التعيين', 'سنة التعيين'] },
  { k: 'type', label: 'نوع التعيين', type: 'list', opts: TYPES, alias: ['نوع التعيين'] },
  { k: 'placement', label: 'تاريخ أمر التنسيب', type: 'date', alias: ['التنسيب'] },
  { k: 'start', label: 'تاريخ المباشرة أول مرة', type: 'date', alias: ['مباشرة'] },
  { k: 'service', label: 'عدد سنوات الخدمة', type: 'computed', alias: ['سنوات الخدمة', 'الخدمة'] },
  { k: 'notes', label: 'الملاحظات', type: 'text', alias: ['ملاحظات'] },
]

const FIELD = Object.fromEntries(FIELDS.map(f => [f.k, f]))
const LIST_FIELD = { schools: 'school', titles: 'title', certs: 'cert', statuses: 'status' }

const toLatinDigits = s => String(s ?? '')
  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))

// Loose Arabic key: no diacritics/spaces/punctuation, unified alef/yaa/taa marbuta.
const norm = s => toLatinDigits(s)
  .replace(/\p{M}|ـ/gu, '') // harakat + tatweel
  .replace(/[أإآٱ]/g, 'ا').replace(/[ىئ]/g, 'ي').replace(/ؤ/g, 'و').replace(/ة/g, 'ه')
  .replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()

function lev(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

// '' for empty, the canonical option when it matches, null when it doesn't.
function matchOpt(raw, opts, syn = {}) {
  const v = norm(raw)
  if (!v) return ''
  const hit = opts.find(o => norm(o) === v) || Object.entries(syn).find(([s]) => norm(s) === v)?.[1]
  if (hit) return hit
  const unique = list => list.length === 1 ? list[0] : undefined
  const contained = unique(opts.filter(o => v.includes(norm(o)))) // "بكالوريوس تربية", "حارس ليلي"
    ?? (v.length >= 4 ? unique(opts.filter(o => norm(o).includes(v))) : undefined) // "مستمر"
  if (contained) return contained
  // ponytail: edit-distance guess for typos ("بكلوريوس"); add syn entries if real files show misses
  const scored = opts.map(o => [o, lev(v, norm(o))]).sort((a, b) => a[1] - b[1])
  const [best, second] = scored
  return best && best[1] <= (v.length >= 6 ? 2 : 1) && (!second || second[1] > best[1]) ? best[0] : null
}

const pad = n => String(n).padStart(2, '0')

// Accepts d/m/yyyy, yyyy-mm-dd (any of / - . space); partial also m/yyyy and yyyy.
// Returns 'yyyy[-mm[-dd]]', '' for empty, null when invalid.
function parseDate(raw, partial = false, today = new Date()) {
  const s = toLatinDigits(raw).trim()
  if (!s) return ''
  const p = s.split(/[\/\-.\s]+/).filter(Boolean)
  if (!p.every(x => /^\d+$/.test(x))) return null
  let y, m, d
  if (p.length === 3) [y, m, d] = p[0].length === 4 ? p : [p[2], p[1], p[0]]
  else if (partial && p.length === 2) [y, m] = p[0].length === 4 ? p : [p[1], p[0]]
  else if (partial && p.length === 1) [y] = p
  else return null
  if (y.length !== 4 || +y < 1900 || +y > today.getFullYear() + 1) return null
  if (m !== undefined && (+m < 1 || +m > 12)) return null
  if (d !== undefined && (+d < 1 || +d > new Date(+y, +m, 0).getDate())) return null
  return [y, m && pad(+m), d && pad(+d)].filter(Boolean).join('-')
}

const fmtDate = iso => iso ? iso.split('-').map(Number).reverse().join('/') : ''

// Arabic number agreement with digits. forms: [1, 2, 3–10, 11–99, 100/101/102…]
function counted(n, [one, two, few, many, hundred = many]) {
  const r = n % 100
  return n === 1 ? one : n === 2 ? two : r >= 3 && r <= 10 ? `${n} ${few}` : r >= 11 ? `${n} ${many}` : `${n} ${hundred}`
}
const YEARS = ['سنة', 'سنتان', 'سنوات', 'سنة']
const MONTHS = ['شهر', 'شهران', 'أشهر', 'شهراً']
const EMP = ['موظف واحد', 'موظفان', 'موظفين', 'موظفاً', 'موظف']
const EMP_OF = ['موظف واحد', 'موظفَين', 'موظفين', 'موظفاً', 'موظف'] // after a noun: "استيراد موظفَين"

function service(start, today = new Date()) {
  const [y, m, d] = (start || '').split('-').map(Number)
  if (!d) return ''
  const months = (today.getFullYear() - y) * 12 + today.getMonth() + 1 - m - (today.getDate() < d ? 1 : 0)
  if (months < 0) return ''
  const Y = Math.floor(months / 12), M = months % 12
  return [Y && counted(Y, YEARS), M && counted(M, MONTHS)].filter(Boolean).join(' و') || 'أقل من شهر'
}

const spouseJobText = (e, v = e.spouseJob) =>
  (e.gender === 'أنثى' ? ['غير موظف', 'موظف'] : ['ربة بيت', 'موظفة'])[v] ?? ''

// Display text of a field, as shown in tables and exports.
function show(e, k) {
  const f = FIELD[k], v = e[k] ?? ''
  if (f.type === 'computed') return service(e.start)
  if (v === '') return ''
  if (f.type === 'date' || f.type === 'pdate') return fmtDate(v)
  if (f.type === 'money') return Number(v).toLocaleString('en-US')
  if (f.type === 'spouseJob') return spouseJobText(e)
  return String(v)
}

// raw: { fieldKey: any } -> { emp, errors: {k: msg}, fixes: {k: msg} }
function cleanRow(raw, lists) {
  const emp = {}, errors = {}, fixes = {}
  for (const f of FIELDS) {
    if (f.type === 'computed') continue
    const v = String(raw[f.k] ?? '').replace(/\s+/g, ' ').trim()
    let out = v
    if (f.type === 'list') {
      const opts = Array.isArray(f.opts) ? f.opts : lists[f.opts]
      // schools differ by one word ("النور"/"النصر"), so no fuzzy matching for them
      out = f.opts === 'schools' ? (opts.find(o => norm(o) === norm(v)) ?? (v ? null : '')) : matchOpt(v, opts, f.syn)
      if (out === null && f.opts === 'schools') out = v // new school, added to the list on save
      else if (out === null) { out = v; errors[f.k] = 'ليست ضمن القائمة: ' + opts.join('، ') }
      else if (norm(out) !== norm(v)) fixes[f.k] = 'كانت: ' + v
    } else if (f.type === 'date' || f.type === 'pdate') {
      out = parseDate(v, f.type === 'pdate')
      if (out === null) { out = v; errors[f.k] = f.type === 'pdate' ? 'تاريخ غير صحيح (سنة، أو شهر/سنة، أو يوم/شهر/سنة)' : 'تاريخ غير صحيح (يوم/شهر/سنة)' }
    } else if (f.type === 'int' || f.type === 'money') {
      out = toLatinDigits(v).replace(/[,،٬\s]|د\.?ع\.?|دينار/g, '')
      if (out && (!/^\d+$/.test(out) || (f.type === 'int' && +out > 30))) { out = v; errors[f.k] = 'رقم غير صحيح' }
      else if (out) out = String(+out)
    } else if (f.type === 'spouseJob') {
      const n = norm(v)
      out = !n ? '' : /غير|بيت|0/.test(n) ? '0' : /موظف|1/.test(n) ? '1' : null
      if (out === null) { out = v; errors[f.k] = 'اكتب: ربة بيت/غير موظف أو موظفة/موظف' }
    }
    if (f.req && !out) errors[f.k] = 'حقل مطلوب'
    emp[f.k] = out
  }
  if (!emp.marital && (emp.spouse || emp.spouseJob)) emp.marital = 'متزوج'
  // ponytail: feminine wording of a matched title/marital ("معلمة", "متزوجة", "عزباء") implies أنثى; else ذكر
  const fem = (rawV, opt) => !!opt && (norm(rawV) === norm(opt) + 'ه' || norm(rawV) === 'عزباء')
  if (!emp.gender) emp.gender = fem(raw.title, emp.title) || fem(raw.marital, emp.marital) ? 'أنثى' : 'ذكر'
  return { emp, errors, fixes }
}

// Duplicate = same employee number, or same name with the same (or unknown) mother name.
function dupIndex(list = []) {
  const nos = new Set(), names = new Map()
  const idx = {
    has: e => (!!e.empNo && nos.has(norm(e.empNo))) ||
      (names.get(norm(e.name)) || []).some(m => !m || !norm(e.mother) || m === norm(e.mother)),
    add: e => {
      if (e.empNo) nos.add(norm(e.empNo))
      const k = norm(e.name)
      if (k) names.set(k, [...(names.get(k) || []), norm(e.mother)])
    },
  }
  list.forEach(idx.add)
  return idx
}

// Header row -> field key per column ('' = ignored). Longest alias wins so
// "حالة الزوجة" is not taken for "الزوجة".
const ALIASES = FIELDS.flatMap(f => [f.label, ...f.alias].map(a => [norm(a), f.k])).sort((a, b) => b[0].length - a[0].length)
function mapHeader(cells) {
  const used = new Set()
  return cells.map(c => {
    const h = norm(c)
    const hit = h && ALIASES.find(([a]) => h.includes(a))
    if (!hit || used.has(hit[1])) return ''
    used.add(hit[1])
    return hit[1]
  })
}

// ponytail: header = first row (of 15) matching >=3 known columns; fails on files with title rows that name 3 fields
function detectHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const map = mapHeader(rows[i]), filled = rows[i].filter(c => String(c).trim()).length
    if (filled >= 2 && map.filter(Boolean).length >= Math.min(3, filled)) return { index: i, map }
  }
  return { index: -1, map: [] }
}

// Data rows under the header; skips blank/serial-only rows and repeated headers.
function dataRows(rows, index) {
  const header = (rows[index] || []).map(norm).join('|')
  return rows.slice(index + 1)
    .filter(r => r.filter(c => String(c).trim()).length >= 2 && r.map(norm).join('|') !== header)
}
const toRaw = (row, map) => Object.fromEntries(map.map((k, i) => [k, row[i] ?? '']).filter(([k]) => k))

const CORE = ['empNo', 'school', 'name', 'gender', 'mother', 'birth', 'address', 'marital', 'title', 'status', 'cert', 'appoint', 'type', 'start']
function missing(e) {
  const m = CORE.filter(k => !e[k])
  if (e.marital === 'متزوج') m.push(...['spouse', 'spouseJob'].filter(k => !e[k]))
  if (e.type === 'عقد' && !e.placement) m.push('placement')
  return m
}

function audits(emps) {
  const repeated = key => {
    const n = new Map()
    emps.forEach(e => { const k = key(e); if (k) n.set(k, (n.get(k) || 0) + 1) })
    return e => n.get(key(e)) > 1
  }
  return [
    ['incomplete', 'سجلات ناقصة', e => missing(e).length > 0],
    ['name4', 'أسماء غير رباعية', e => e.name.trim().split(/\s+/).length < 4],
    ['dupNo', 'أرقام وظيفية مكررة', repeated(e => norm(e.empNo))],
    ['dupName', 'موظفون مكررون (الاسم واسم الأم)', repeated(e => norm(e.name) && norm(e.name) + '|' + norm(e.mother))],
  ].map(([k, label, test]) => ({ k, label, test, n: emps.filter(test).length }))
}

if (typeof module !== 'undefined') module.exports = {
  GENDERS, MARITAL, TYPES, DEFAULT_LISTS, FIELDS, FIELD, LIST_FIELD, norm, matchOpt, parseDate, fmtDate,
  counted, EMP, EMP_OF, service, show, cleanRow, dupIndex, mapHeader, detectHeader, dataRows, toRaw, missing, audits,
}
