const { app, BrowserWindow, ipcMain, dialog, protocol, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { configure, ZipReader, Uint8ArrayReader, Uint8ArrayWriter } = require('@zip.js/zip.js');
const { createExtractorFromData } = require('node-unrar-js');
configure({ useWebWorkers: false });

let mainWindow;
const zipCache = new Map();
const libraryWatchers = new Map(); // libraryPath -> FSWatcher

// Page buffer cache — keeps last 30 pages in memory to avoid re-reading zip
const pageCache = new Map();
const PAGE_CACHE_LIMIT = 30;
function cacheKey(cbzPath, filename) { return `${cbzPath}::${filename}`; }
function cachePage(key, buffer) {
  if (pageCache.size >= PAGE_CACHE_LIMIT) {
    pageCache.delete(pageCache.keys().next().value);
  }
  pageCache.set(key, buffer);
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };

function isArchive(name) { return /\.(cbz|cbr)$/i.test(name); }
function stripArchiveExt(name) { return path.basename(name).replace(/\.(cbz|cbr)$/i, ''); }

function sortImages(names) {
  return names
    .filter(n => IMAGE_EXTS.has(path.extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

async function getZip(cbzPath) {
  if (zipCache.has(cbzPath)) return zipCache.get(cbzPath);
  const data = await fs.promises.readFile(cbzPath);
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(data)));
  const entries = await reader.getEntries();
  const entryMap = new Map(entries.filter(e => !e.directory).map(e => [e.filename, e]));
  zipCache.set(cbzPath, entryMap);
  return entryMap;
}

async function getCbr(cbrPath) {
  if (zipCache.has(cbrPath)) return zipCache.get(cbrPath);
  const buf = await fs.promises.readFile(cbrPath);
  const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const extractor = await createExtractorFromData({ data: uint8 });
  const list = extractor.getFileList();
  const headers = [...list.fileHeaders].filter(h => !h.flags.directory);
  const entryMap = new Map();
  for (const header of headers) {
    const name = header.name;
    entryMap.set(name, {
      filename: name,
      getData: async () => {
        const ext = await createExtractorFromData({ data: uint8 });
        const result = ext.extract({ files: [name] });
        const files = [...result.files];
        if (!files[0]?.extraction) throw new Error('Extraction failed: ' + name);
        return files[0].extraction; // Uint8Array
      },
    });
  }
  zipCache.set(cbrPath, entryMap);
  return entryMap;
}

function getArchive(filePath) {
  return path.extname(filePath).toLowerCase() === '.cbr' ? getCbr(filePath) : getZip(filePath);
}

// manga:// protocol — serves pages directly from zip
protocol.registerSchemesAsPrivileged([
  { scheme: 'manga', privileges: { secure: true, supportFetchAPI: true, bypassCSP: true } }
]);

// ── Library folder watcher ─────────────────────────────────────────────────
function watchLibraryFolder(libraryPath) {
  if (libraryWatchers.has(libraryPath)) return;

  const debounceMap = new Map();
  const watcher = fs.watch(libraryPath, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (!isArchive(filename)) return;

    if (debounceMap.has(filename)) clearTimeout(debounceMap.get(filename));
    debounceMap.set(filename, setTimeout(() => {
      debounceMap.delete(filename);
      const cbzPath = path.join(libraryPath, filename);
      if (!fs.existsSync(cbzPath)) return;
      const parentDir = path.dirname(cbzPath);
      mainWindow.webContents.send('library-file-added', { cbzPath, parentDir, libraryPath });
    }, 500));
  });

  watcher.on('error', () => libraryWatchers.delete(libraryPath));
  libraryWatchers.set(libraryPath, watcher);
}

app.whenReady().then(() => {
  protocol.handle('manga', async (request) => {
    try {
      const url = new URL(request.url);
      const cbzPath = decodeURIComponent(url.searchParams.get('cbz'));
      const filename = decodeURIComponent(url.searchParams.get('file'));
      const key = cacheKey(cbzPath, filename);
      const mime = MIME[path.extname(filename).toLowerCase()] || 'image/jpeg';
      const headers = { 'Content-Type': mime, 'Cache-Control': 'max-age=3600' };

      if (pageCache.has(key)) {
        return new Response(pageCache.get(key), { headers });
      }

      const zip = await getArchive(cbzPath);
      const entry = zip.get(filename);
      if (!entry) return new Response('Not found', { status: 404 });
      const buffer = (await entry.getData(new Uint8ArrayWriter())).buffer;
      cachePage(key, buffer);
      return new Response(buffer, { headers });
    } catch (e) {
      return new Response('Error', { status: 500 });
    }
  });

  createWindow();
  // Restore watchers for all saved library folders
  loadLibraryPaths().filter(p => fs.existsSync(p)).forEach(watchLibraryFolder);
  // Restore watchers for individual series folders (added via "Add Series")
  try {
    const libraryPaths = loadLibraryPaths();
    const collection = JSON.parse(fs.readFileSync(collectionFile(), 'utf8'));
    collection
      .filter(s => s.folderPath && fs.existsSync(s.folderPath))
      .filter(s => !libraryPaths.some(lp => s.folderPath.startsWith(lp + path.sep)))
      .forEach(s => watchLibraryFolder(s.folderPath));
  } catch (_) {}
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('fullscreen-change', true));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('fullscreen-change', false));

  const indexPath = path.join(__dirname, '..', 'dist-react', 'index.html');
  mainWindow.loadFile(indexPath);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── Collection persistence ─────────────────────────────────────────────────
const collectionFile = () => path.join(app.getPath('userData'), 'collection.json');

ipcMain.handle('load-collection', () => {
  try {
    const data = fs.readFileSync(collectionFile(), 'utf8');
    return JSON.parse(data);
  } catch (_) {
    return [];
  }
});

ipcMain.handle('save-collection', (_e, collection) => {
  try {
    fs.writeFileSync(collectionFile(), JSON.stringify(collection, null, 2));
  } catch (_) {}
});

// ── Add series (folder of .cbz volumes) ───────────────────────────────────
ipcMain.handle('add-series', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Manga Series Folder',
  });
  if (result.canceled) return null;

  const folderPath = result.filePaths[0];
  const name = path.basename(folderPath);

  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const volumes = entries
    .filter(e => e.isFile() && isArchive(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((e, i) => ({
      id: `${Date.now()}-${i}`,
      name: stripArchiveExt(e.name),
      path: path.join(folderPath, e.name),
      pageCount: 0,
    }));

  if (volumes.length === 0) return null;

  // Get page count and cover for first volume
  try {
    const zip = await getArchive(volumes[0].path);
    const pages = sortImages([...zip.keys()]);
    volumes[0].pageCount = pages.length;
  } catch (_) {}

  // Watch for new volumes added to this series folder
  watchLibraryFolder(folderPath);

  return {
    id: `series-${Date.now()}`,
    name,
    folderPath,
    coverCbz: volumes[0].path,
    volumes,
  };
});

// ── Library paths persistence ──────────────────────────────────────────────
const libraryPathsFile = () => path.join(app.getPath('userData'), 'library-paths.json');

function loadLibraryPaths() {
  try { return JSON.parse(fs.readFileSync(libraryPathsFile(), 'utf8')); } catch (_) { return []; }
}

function saveLibraryPaths(paths) {
  try { fs.writeFileSync(libraryPathsFile(), JSON.stringify(paths)); } catch (_) {}
}

// ── Scan a single library folder into series entries ───────────────────────
async function scanLibraryFolder(libraryPath) {
  const entries = fs.readdirSync(libraryPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(libraryPath, entry.name);

    if (entry.isDirectory()) {
      const cbzFiles = fs.readdirSync(fullPath, { withFileTypes: true })
        .filter(e => e.isFile() && isArchive(e.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map(e => ({
          id: `${Date.now()}-${Math.random()}`,
          name: stripArchiveExt(e.name),
          path: path.join(fullPath, e.name),
          pageCount: 0,
        }));

      if (cbzFiles.length === 0) continue;

      results.push({
        id: `series-${Date.now()}-${Math.random()}`,
        name: entry.name,
        folderPath: fullPath,
        coverCbz: cbzFiles[0].path,
        volumes: cbzFiles,
      });

    } else if (entry.isFile() && isArchive(entry.name)) {
      const name = stripArchiveExt(entry.name);
      results.push({
        id: `cbz-${Date.now()}-${Math.random()}`,
        name,
        folderPath: null,
        coverCbz: fullPath,
        volumes: [{ id: `vol-${Date.now()}-${Math.random()}`, name, path: fullPath, pageCount: 0 }],
      });
    }
  }

  return results;
}

// ── Scan library (opens dialog, saves path) ────────────────────────────────
ipcMain.handle('scan-library', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Library Folder',
  });
  if (result.canceled) return [];

  const libraryPath = result.filePaths[0];

  // Save so we can auto-refresh on startup
  const saved = loadLibraryPaths();
  if (!saved.includes(libraryPath)) {
    saveLibraryPaths([...saved, libraryPath]);
  }

  watchLibraryFolder(libraryPath);
  return scanLibraryFolder(libraryPath);
});

// ── Full startup sync — reconciles collection against disk ─────────────────
// Takes the saved collection, returns a fully synced version:
//   - series with folderPath: rescanned from disk (adds new files, removes deleted)
//   - standalone CBZ series: removed if file no longer exists
//   - library paths: new series/files discovered since last run are appended
ipcMain.handle('sync-collection', async (_e, collection) => {
  const synced = [];

  for (const series of collection) {
    if (series.folderPath) {
      if (!fs.existsSync(series.folderPath)) continue; // folder deleted — drop series

      // Rescan folder to get authoritative file list
      let diskFiles;
      try {
        diskFiles = fs.readdirSync(series.folderPath, { withFileTypes: true })
          .filter(e => e.isFile() && isArchive(e.name))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map(e => path.join(series.folderPath, e.name));
      } catch (_) { continue; }

      if (diskFiles.length === 0) continue; // folder now empty — drop series

      const existingByPath = new Map(series.volumes.map(v => [v.path, v]));
      const volumes = diskFiles.map(filePath =>
        existingByPath.get(filePath) ?? {
          id: `vol-${Date.now()}-${Math.random()}`,
          name: stripArchiveExt(filePath),
          path: filePath,
          pageCount: 0,
        }
      );
      synced.push({ ...series, volumes });
    } else {
      // Standalone CBZ — keep only if file still exists
      const volumes = series.volumes.filter(v => fs.existsSync(v.path));
      if (volumes.length > 0) synced.push({ ...series, volumes });
    }
  }

  // Discover new series/files in library paths not already in the synced collection
  const libraryPaths = loadLibraryPaths().filter(p => fs.existsSync(p));
  const knownFolders = new Set(synced.filter(s => s.folderPath).map(s => s.folderPath));
  const knownVolumes = new Set(synced.flatMap(s => s.volumes.map(v => v.path)));

  for (const libPath of libraryPaths) {
    let items;
    try { items = await scanLibraryFolder(libPath); } catch (_) { continue; }
    for (const item of items) {
      if (item.folderPath) {
        if (!knownFolders.has(item.folderPath)) synced.push(item); // new series subfolder
      } else {
        if (!knownVolumes.has(item.coverCbz)) synced.push(item); // new standalone CBZ
      }
    }
  }

  return synced;
});

// ── Add standalone .cbz files ──────────────────────────────────────────────
ipcMain.handle('add-cbz', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Comic Book Archive', extensions: ['cbz', 'cbr'] }],
    title: 'Add Comic Files',
  });
  if (result.canceled) return [];

  const series = [];
  for (const filePath of result.filePaths) {
    const name = stripArchiveExt(filePath);
    let pageCount = 0;
    try {
      const zip = await getArchive(filePath);
      pageCount = sortImages([...zip.keys()]).length;
    } catch (_) {}

    series.push({
      id: `cbz-${Date.now()}-${Math.random()}`,
      name,
      folderPath: null,
      coverCbz: filePath,
      volumes: [{
        id: `vol-${Date.now()}`,
        name,
        path: filePath,
        pageCount,
      }],
    });
  }
  return series;
});

// ── Open a volume — returns sorted page filenames ─────────────────────────
ipcMain.handle('open-volume', async (_e, cbzPath) => {
  try {
    const zip = await getArchive(cbzPath);
    const pages = sortImages([...zip.keys()]);
    return { pages, total: pages.length };
  } catch (err) {
    return { pages: [], total: 0 };
  }
});

// ── Cover thumbnail cache ──────────────────────────────────────────────────
let coversDir = null;

function getCoverCacheDir() {
  if (!coversDir) {
    coversDir = path.join(app.getPath('userData'), 'covers');
    if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });
  }
  return coversDir;
}

function coverCachePath(cbzPath) {
  const hash = crypto.createHash('md5').update(cbzPath).digest('hex');
  return path.join(getCoverCacheDir(), `${hash}.jpg`);
}

ipcMain.handle('get-cover', async (_e, cbzPath) => {
  try {
    const cachePath = coverCachePath(cbzPath);

    // Serve from cache if it exists
    if (fs.existsSync(cachePath)) {
      return `file://${cachePath.replace(/\\/g, '/')}`;
    }

    // Extract first page from archive
    const zip = await getArchive(cbzPath);
    const pages = sortImages([...zip.keys()]);
    if (pages.length === 0) return null;

    const entry = zip.get(pages[0]);
    const buffer = Buffer.from(await entry.getData(new Uint8ArrayWriter()));

    // Resize to thumbnail (200px wide) and save as JPEG
    const img = nativeImage.createFromBuffer(buffer);
    const resized = img.resize({ width: 200 });
    fs.writeFileSync(cachePath, resized.toJPEG(85));

    return `file://${cachePath.replace(/\\/g, '/')}`;
  } catch (_) {
    return null;
  }
});

// ── Batch cover fetch ──────────────────────────────────────────────────────
ipcMain.handle('get-covers-batch', async (_e, cbzPaths) => {
  const results = await Promise.all(cbzPaths.map(async (cbzPath) => {
    try {
      const cachePath = coverCachePath(cbzPath);
      if (fs.existsSync(cachePath)) {
        return [cbzPath, `file://${cachePath.replace(/\\/g, '/')}`];
      }
      const zip = await getArchive(cbzPath);
      const pages = sortImages([...zip.keys()]);
      if (pages.length === 0) return [cbzPath, null];
      const entry = zip.get(pages[0]);
      const buffer = Buffer.from(await entry.getData(new Uint8ArrayWriter()));
      const img = nativeImage.createFromBuffer(buffer);
      const resized = img.resize({ width: 200 });
      fs.writeFileSync(cachePath, resized.toJPEG(85));
      return [cbzPath, `file://${cachePath.replace(/\\/g, '/')}`];
    } catch (_) {
      return [cbzPath, null];
    }
  }));
  return Object.fromEntries(results);
});

// ── Reading progress ───────────────────────────────────────────────────────
const progressFile = () => path.join(app.getPath('userData'), 'progress.json');

ipcMain.handle('load-progress', () => {
  try {
    return JSON.parse(fs.readFileSync(progressFile(), 'utf8'));
  } catch (_) { return {}; }
});

ipcMain.handle('save-progress', (_e, cbzPath, page, total) => {
  try {
    let progress = {};
    try { progress = JSON.parse(fs.readFileSync(progressFile(), 'utf8')); } catch (_) {}
    progress[cbzPath] = { page, total, updatedAt: Date.now() };
    fs.writeFileSync(progressFile(), JSON.stringify(progress));
  } catch (_) {}
});

// ── Window controls ────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window-close', () => mainWindow.close());
ipcMain.on('window-fullscreen', () => mainWindow.setFullScreen(!mainWindow.isFullScreen()));
