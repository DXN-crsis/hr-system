// node check.js — self-check for the import/validation logic.
const assert = require('assert/strict')
const L = require('./logic.js')
const lists = structuredClone(L.DEFAULT_LISTS)
lists.schools = ['ثانوية النور']

// list matching: exact, spelling variants, typos, contained words, no match
assert.equal(L.matchOpt('بكلوريوس', lists.certs), 'بكالوريوس')
assert.equal(L.matchOpt('ابتداىية', lists.certs), 'ابتدائية')
assert.equal(L.matchOpt('يقراء ويكتب', lists.certs), 'يقرأ ويكتب')
assert.equal(L.matchOpt('معلمة', lists.titles), 'معلم')
assert.equal(L.matchOpt('موظف خدمة', lists.titles), 'موظف خدمات')
assert.equal(L.matchOpt('مستمر', lists.statuses), 'مستمر بالخدمة')
assert.equal(L.matchOpt('عزباء', L.MARITAL, L.FIELD.marital.syn), 'أعزب')
assert.equal(L.matchOpt('ماجستير', lists.certs), null)
assert.equal(L.matchOpt('', lists.certs), '')

// dates
const today = new Date(2026, 8, 17)
assert.equal(L.parseDate('12/3/2015'), '2015-03-12')
assert.equal(L.parseDate('٢٠١٥-٠٣-١٢'), '2015-03-12')
assert.equal(L.parseDate('31/2/2015'), null)
assert.equal(L.parseDate('2015'), null)
assert.equal(L.parseDate('2015', true), '2015')
assert.equal(L.parseDate('3/2015', true), '2015-03')
assert.equal(L.fmtDate('2015-03-12'), '12/3/2015')
assert.equal(L.fmtDate('2015-03'), '3/2015')
assert.equal(L.fmtDate(''), '')
assert.equal(L.parseDate(L.fmtDate('2015-03-12')), '2015-03-12')
assert.equal(L.service('2014-05-20', today), '12 سنة و3 أشهر')
assert.equal(L.service('2024-08-10', today), 'سنتان وشهر')
assert.equal(L.service('2009-10-01', today), '16 سنة و11 شهراً')
assert.equal(L.service('2021-09-17', today), '5 سنوات')
assert.equal(L.service('2026-09-01', today), 'أقل من شهر')
assert.deepEqual([1, 2, 7, 72, 100, 103, 111].map(n => L.counted(n, L.EMP)), ['موظف واحد', 'موظفان', '7 موظفين', '72 موظفاً', '100 موظف', '103 موظفين', '111 موظفاً'])

// row cleaning
const r = L.cleanRow({ school: 'ثانويه النور', name: 'علي حسن محمد كاظم', title: 'مدرسة', cert: 'بكلوريوس', marital: 'متزوجة', spouseJob: 'موظف', salary: '750,000', start: '1/9/2010', appoint: '2010', kids: '٣' }, lists)
assert.deepEqual(r.errors, {})
assert.equal(r.emp.gender, 'أنثى')
assert.equal(r.emp.title, 'مدرس')
assert.equal(r.emp.spouseJob, '1')
assert.equal(r.emp.salary, '750000')
assert.equal(r.emp.kids, '3')
assert.ok(r.fixes.cert && r.fixes.title && !r.fixes.school)
assert.equal(L.cleanRow({ name: 'س', school: 'مدرسة جديدة', cert: 'ماجستير', birth: '1980' }, lists).errors.cert !== undefined, true)
assert.deepEqual(Object.keys(L.cleanRow({ name: '', school: '' }, lists).errors).sort(), ['name', 'school'])
assert.equal(L.cleanRow({ name: 'س', school: 'ثانوية النصر' }, lists).emp.school, 'ثانوية النصر')
assert.equal(L.cleanRow({ name: 'س ص', school: 'x', title: 'موظف خدمة' }, lists).emp.gender, 'ذكر')

// duplicates
const idx = L.dupIndex([{ empNo: '77', name: 'علي حسن محمد كاظم', mother: 'زينب علي' }])
assert.ok(idx.has({ empNo: '77', name: 'اخر' }))
assert.ok(idx.has({ name: 'علي حسن محمد كاظم', mother: '' }))
assert.ok(!idx.has({ name: 'علي حسن محمد كاظم', mother: 'فاطمة' }))

// every exported header maps back to its own field (Excel round trip)
assert.deepEqual(L.mapHeader(L.FIELDS.map(f => f.label)), L.FIELDS.map(f => f.k))
// the manager's own sheet and text-list headers
assert.deepEqual(
  L.mapHeader(['ت', 'الرقم الوظيفي', 'الاسم الرباعي', 'الجنس', 'مكان العمل', 'الحالة الزوجية', 'التخصص', 'تاريخ التولد', 'السكن الحالي', 'التحصيل الدراسي', 'تاريخ المباشرة أول مرة', 'الدرجة الوظيفية', 'الراتب الاسمي', 'حالة الموظف', 'الملاحظات']),
  ['', 'empNo', 'name', 'gender', 'school', 'marital', 'spec', 'birth', 'address', 'cert', 'start', 'grade', 'salary', 'status', 'notes'])
assert.deepEqual(
  L.mapHeader(['تسلسل', 'اسم المدرسة', 'اسم الموظف الرباعي', 'اسم الزوجة الرباعي', 'اسم الام الثلاثي', 'حالة الزوجة', 'العنوان الوظيفي', 'التخصص الدقيق', 'الشهادة', 'تاريخ التعيين السنة', 'نوع التعيين', 'تاريخ مباشرة أول مرة', 'عدد سنوات الخدمة', 'تاريخ الامر التنسيب', 'عنوان السكن', 'عدد الأطفال', 'تاريخ استلام المنصب الحالي', 'اسم الجامعة أو كلية أو معهد']),
  ['', 'school', 'name', 'spouse', 'mother', 'spouseJob', 'title', 'spec', 'cert', 'appoint', 'type', 'start', 'service', 'placement', 'address', 'kids', 'position', 'uni'])

// header detection skips title rows, serial-only rows and repeated headers
const rows = [['كشف موظفي المديرية'], ['ت', 'الاسم', 'المدرسة', 'الشهادة'], ['1', 'علي', 'ثانوية النور', 'دبلوم'], ['2'], ['ت', 'الاسم', 'المدرسة', 'الشهادة'], ['3', 'حسن', 'ثانوية النور', 'دبلوم']]
const h = L.detectHeader(rows)
assert.equal(h.index, 1)
assert.deepEqual(L.dataRows(rows, h.index).map(r => L.toRaw(r, h.map).name), ['علي', 'حسن'])

// audits
const a = L.audits([{ empNo: '1', name: 'علي حسن', mother: '' }, { empNo: '1', name: 'حسن علي محمد جاسم', mother: '' }])
assert.deepEqual(a.map(x => x.n), [2, 1, 2, 0])

console.log('check.js: all passed')
