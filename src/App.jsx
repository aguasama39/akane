import { useState, useEffect } from 'react'
import Collection from './components/Collection'
import SeriesDetail from './components/SeriesDetail'
import Reader from './components/Reader'

export default function App() {
  const [view, setView] = useState('collection')
  const [collection, setCollection] = useState([])
  const [progress, setProgress] = useState({})
  const [selectedSeries, setSelectedSeries] = useState(null)
  const [selectedVolume, setSelectedVolume] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  function toggleFullscreen() {
    window.api.windowFullscreen()
    setIsFullscreen(v => !v)
  }

  useEffect(() => {
    Promise.all([
      window.api.loadCollection(),
      window.api.loadProgress(),
    ]).then(([saved, prog]) => {
      setCollection(saved)
      setProgress(prog)
      // Auto-refresh library folders for new content
      const existingVolumePaths = saved.flatMap(s => s.volumes.map(v => v.path))
      const existingFolderPaths = saved.map(s => s.folderPath).filter(Boolean)
      window.api.refreshLibrary(existingVolumePaths, existingFolderPaths).then(({ newSeries, newVolumes }) => {
        if (newSeries.length === 0 && newVolumes.length === 0) return
        setCollection(c => {
          let updated = [...c]
          // Add brand new series
          if (newSeries.length > 0) updated = [...updated, ...newSeries]
          // Add new volumes to existing series
          for (const { seriesFolderPath, volume } of newVolumes) {
            updated = updated.map(s =>
              s.folderPath === seriesFolderPath
                ? { ...s, volumes: [...s.volumes, volume] }
                : s
            )
          }
          return updated
        })
      })
    })
  }, [])

  useEffect(() => {
    if (collection.length > 0) window.api.saveCollection(collection)
  }, [collection])

  // Live folder watching — auto-add new .cbz files while app is open
  useEffect(() => {
    window.api.onLibraryFileAdded(({ cbzPath, parentDir, libraryPath }) => {
      const volume = {
        id: `vol-${Date.now()}-${Math.random()}`,
        name: cbzPath.split(/[\\/]/).pop().replace(/\.(cbz|cbr)$/i, ''),
        path: cbzPath,
        pageCount: 0,
      }

      setCollection(c => {
        // Already in collection?
        if (c.some(s => s.volumes.some(v => v.path === cbzPath))) return c

        // New volume for an existing series?
        const existingSeries = c.find(s => s.folderPath === parentDir)
        if (existingSeries) {
          return c.map(s => s.folderPath === parentDir
            ? { ...s, volumes: [...s.volumes, volume] }
            : s
          )
        }

        // New standalone or new series subfolder
        if (parentDir === libraryPath) {
          // Standalone .cbz in library root
          return [...c, {
            id: `cbz-${Date.now()}`,
            name: volume.name,
            folderPath: null,
            coverCbz: cbzPath,
            volumes: [volume],
          }]
        }

        // New subfolder = new series
        return [...c, {
          id: `series-${Date.now()}`,
          name: parentDir.split(/[\\/]/).pop(),
          folderPath: parentDir,
          coverCbz: cbzPath,
          volumes: [volume],
        }]
      })
    })
  }, [])

  function updateProgress(cbzPath, page, total) {
    setProgress(p => ({ ...p, [cbzPath]: { page, total, updatedAt: Date.now() } }))
    window.api.saveProgress(cbzPath, page, total)
  }

  function openSeries(series) {
    setSelectedSeries(series)
    setView('series')
  }

  function openReader(volume) {
    setSelectedVolume(volume)
    setView('reader')
  }

  function addSeries() {
    window.api.addSeries().then(series => {
      if (!series) return
      setCollection(c => [...c, series])
    })
  }

  function addCbz() {
    window.api.addCbz().then(items => {
      if (!items.length) return
      setCollection(c => [...c, ...items])
    })
  }

  function scanLibrary() {
    window.api.scanLibrary().then(items => {
      if (!items.length) return
      setCollection(c => {
        const existingPaths = new Set(c.map(s => s.folderPath || s.coverCbz))
        const newItems = items.filter(s => !existingPaths.has(s.folderPath || s.coverCbz))
        return [...c, ...newItems]
      })
    })
  }

  function removeSeries(id) {
    setCollection(c => c.filter(s => s.id !== id))
  }

  function updateSeries(id, updates) {
    setCollection(c => c.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  // Find series + volume for "continue reading" navigation
  function openReaderFromCollection(cbzPath) {
    for (const series of collection) {
      const vol = series.volumes.find(v => v.path === cbzPath)
      if (vol) { setSelectedSeries(series); openReader(vol); return }
    }
  }

  return (
    <div className="app">
      <TitleBar view={view} onBack={() => setView(view === 'reader' ? 'series' : 'collection')} isFullscreen={isFullscreen} />

      {view === 'collection' && (
        <Collection
          collection={collection}
          progress={progress}
          onOpen={openSeries}
          onAddSeries={addSeries}
          onAddCbz={addCbz}
          onScanLibrary={scanLibrary}
          onRemove={removeSeries}
          onContinue={openReaderFromCollection}
        />
      )}

      {view === 'series' && selectedSeries && (
        <SeriesDetail
          series={collection.find(s => s.id === selectedSeries.id) || selectedSeries}
          progress={progress}
          onOpen={openReader}
          onUpdateSeries={updateSeries}
        />
      )}

      {view === 'reader' && selectedVolume && (
        <Reader
          volume={selectedVolume}
          savedPage={progress[selectedVolume.path]?.page ?? 0}
          onProgress={updateProgress}
          onClose={() => { if (isFullscreen) toggleFullscreen(); setView('series') }}
          isFullscreen={isFullscreen}
          onFullscreenToggle={toggleFullscreen}
        />
      )}
    </div>
  )
}

function TitleBar({ view, onBack, isFullscreen }) {
  return (
    <div className={`titlebar${isFullscreen ? ' titlebar--autohide' : ''}`}>
      <div className="titlebar-left">
        {view !== 'collection' && (
          <button className="back-btn" onClick={onBack}>← Back</button>
        )}
        <span className="app-title">Akane</span>
      </div>
      <div className="titlebar-controls">
        <button className="tb-btn" onClick={() => window.api.windowMinimize()}>−</button>
        <button className="tb-btn" onClick={() => window.api.windowMaximize()}>□</button>
        <button className="tb-btn" onClick={() => window.api.windowFullscreen()} title="Fullscreen">⛶</button>
        <button className="tb-btn close" onClick={() => window.api.windowClose()}>✕</button>
      </div>
    </div>
  )
}
