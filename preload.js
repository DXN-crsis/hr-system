const { contextBridge, ipcRenderer } = require('electron')

const channels = ['load', 'save', 'backupExport', 'backupImport', 'importOpen', 'exportXlsx', 'exportDocx']
contextBridge.exposeInMainWorld('api', Object.fromEntries(channels.map(ch => [ch, (...args) => ipcRenderer.invoke(ch, ...args)])))
