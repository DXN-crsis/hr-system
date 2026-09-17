const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

// One window only: two instances writing data.json would overwrite each other.
if (!app.requestSingleInstanceLock()) app.quit()

let win
const dataFile = () => path.join(app.getPath('userData'), 'data.json')
const writeAtomic = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file + '.tmp', text)
  fs.renameSync(file + '.tmp', file)
}
const today = () => new Date().toISOString().slice(0, 10)

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 960, minHeight: 640, show: false,
    backgroundColor: '#e5e5ea', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  win.removeMenu()
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', e => e.preventDefault())
  win.once('ready-to-show', () => { win.maximize(); win.show() })
  win.loadFile('index.html')
})
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })
app.on('window-all-closed', () => app.quit())

async function saveAs(name, filter, bytes) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), name.replace(/[\\/:*?"<>|]/g, '-')),
    filters: [filter],
  })
  if (canceled) return false
  fs.writeFileSync(filePath, bytes)
  return true
}

async function openOne(filter) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [filter] })
  return canceled ? null : filePaths[0]
}

ipcMain.handle('load', () => {
  const file = dataFile()
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    // keep the unreadable file for recovery instead of overwriting it
    const bad = file.replace(/\.json$/, `.corrupt-${Date.now()}.json`)
    fs.renameSync(file, bad)
    return { corrupt: bad }
  }
})

ipcMain.handle('save', (_, data) => writeAtomic(dataFile(), JSON.stringify(data)))

ipcMain.handle('backupExport', (_, data) =>
  saveAs(`نسخة احتياطية ${today()}.json`, { name: 'نسخة احتياطية', extensions: ['json'] }, JSON.stringify(data, null, 1)))

ipcMain.handle('backupImport', async () => {
  const file = await openOne({ name: 'نسخة احتياطية', extensions: ['json'] })
  if (!file) return null
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(data?.employees) || typeof data.lists !== 'object') throw new Error('not a backup file')
  if (fs.existsSync(dataFile())) fs.copyFileSync(dataFile(), dataFile().replace(/\.json$/, '.before-restore.json'))
  return data
})

// Excel -> { sheets: [{ name, rows: string[][] }] }, Word -> { html } (tables parsed in the page)
ipcMain.handle('importOpen', async () => {
  const file = await openOne({ name: 'Excel / Word', extensions: ['xlsx', 'xls', 'docx'] })
  if (!file) return null
  const name = path.basename(file)
  if (/\.docx$/i.test(file)) return { name, html: (await require('mammoth').convertToHtml({ path: file })).value }
  const XLSX = require('xlsx')
  const wb = XLSX.readFile(file, { cellNF: true })
  return {
    name,
    sheets: wb.SheetNames.map(sheet => {
      const rows = []
      for (const [addr, c] of Object.entries(wb.Sheets[sheet])) {
        if (addr[0] === '!') continue
        const { r, c: col } = XLSX.utils.decode_cell(addr)
        let v = String(c.w ?? c.v ?? '').trim()
        if (c.t === 'n' && c.z && XLSX.SSF.is_date(c.z)) { const d = XLSX.SSF.parse_date_code(c.v); v = `${d.d}/${d.m}/${d.y}` }
        ;(rows[r] ??= [])[col] = v
      }
      return { name: sheet, rows: Array.from(rows, r => Array.from(r ?? [], v => v ?? '')) }
    }),
  }
})

ipcMain.handle('exportXlsx', (_, { name, headers, rows }) => {
  const XLSX = require('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = headers.map((h, i) => ({ wch: Math.min(45, rows.reduce((m, r) => Math.max(m, String(r[i]).length), h.length) + 3) }))
  ws['!autofilter'] = { ref: ws['!ref'] }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'الموظفون')
  wb.Workbook = { Views: [{ RTL: true }] }
  return saveAs(`${name}.xlsx`, { name: 'Excel', extensions: ['xlsx'] }, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
})

// List: headers + rows, landscape (A3 when wide). Card: rows of [label, value], portrait.
ipcMain.handle('exportDocx', async (_, { name, title, subtitle, headers, rows }) => {
  const d = require('docx')
  const card = !headers
  const size = card ? 24 : headers.length > 12 ? 14 : 18
  const run = (text, bold, sz = size) => new d.TextRun({ text: String(text ?? ''), bold, rightToLeft: true, font: 'Arial', size: sz })
  const par = (children, alignment) => new d.Paragraph({ bidirectional: true, alignment, children })
  const cell = (text, head) => new d.TableCell({
    children: [par([run(text, head)])],
    shading: head ? { type: d.ShadingType.CLEAR, color: 'auto', fill: 'DCE6F7' } : undefined,
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
  })
  const table = new d.Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    rows: [
      ...(card ? [] : [new d.TableRow({ tableHeader: true, children: headers.map(h => cell(h, true)) })]),
      ...rows.map(r => new d.TableRow({ cantSplit: true, children: r.map((v, i) => cell(v, card && i === 0)) })),
    ],
  })
  const a3 = !card && headers.length > 12 ? { width: 16838, height: 23811 } : {}
  const doc = new d.Document({
    sections: [{
      properties: {
        page: {
          size: { ...a3, orientation: card ? d.PageOrientation.PORTRAIT : d.PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children: [
        par([run(title, true, 32)], d.AlignmentType.CENTER),
        par([run(subtitle, false, 20)], d.AlignmentType.CENTER),
        par([]),
        table,
      ],
    }],
  })
  return saveAs(`${name}.docx`, { name: 'Word', extensions: ['docx'] }, await d.Packer.toBuffer(doc))
})
