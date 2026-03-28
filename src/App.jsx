import { useState, useEffect } from 'react'
import Collection from './components/Collection'
import SeriesDetail from './components/SeriesDetail'
import Reader from './components/Reader'

export default function App() {
  const [view, setView] = useState('collection')
  const [collection, setCollection] = useState([])
  const [progress, setProgress] = useState({})
  const [metadata, setMetadata] = useState({})
  const [bookmarks, setBookmarks] = useState({})
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
      window.api.loadMetadata(),
      window.api.loadBookmarks(),
    ]).then(([saved, prog, meta, bookm]) => {
      setProgress(prog)
      setMetadata(meta)
      setBookmarks(bookm)
      window.api.syncCollection(saved).then(synced => {
        setCollection(synced)
        window.api.saveCollection(synced)
      })
    })
  }, [])

  useEffect(() => {
    if (collection.length > 0) window.api.saveCollection(collection)
  }, [collection])

  useEffect(() => {
    window.api.saveMetadata(metadata)
  }, [metadata])

  useEffect(() => {
    window.api.saveBookmarks(bookmarks)
  }, [bookmarks])

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
        if (c.some(s => s.volumes.some(v => v.path === cbzPath))) return c

        const existingSeries = c.find(s => s.folderPath === parentDir)
        if (existingSeries) {
          return c.map(s => s.folderPath === parentDir
            ? { ...s, volumes: [...s.volumes, volume] }
            : s
          )
        }

        if (parentDir === libraryPath) {
          return [...c, {
            id: `cbz-${Date.now()}`,
            name: volume.name,
            folderPath: null,
            coverCbz: cbzPath,
            volumes: [volume],
          }]
        }

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

  function updateMetadata(id, updates) {
    setMetadata(m => ({ ...m, [id]: { ...(m[id] || {}), ...updates } }))
  }

  function toggleBookmark(cbzPath, pageIndex) {
    setBookmarks(b => {
      const current = b[cbzPath] || []
      const has = current.includes(pageIndex)
      return {
        ...b,
        [cbzPath]: has ? current.filter(i => i !== pageIndex) : [...current, pageIndex],
      }
    })
  }

  function markAllRead(series) {
    series.volumes.forEach(vol => {
      if (vol.pageCount > 0) {
        updateProgress(vol.path, vol.pageCount - 1, vol.pageCount)
      }
    })
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

  function openReaderFromCollection(cbzPath) {
    for (const series of collection) {
      const vol = series.volumes.find(v => v.path === cbzPath)
      if (vol) { setSelectedSeries(series); openReader(vol); return }
    }
  }

  const currentSeries = selectedSeries
    ? collection.find(s => s.id === selectedSeries.id) || selectedSeries
    : null

  return (
    <div className="app">
      <TitleBar
        view={view}
        onBack={() => {
          if (view === 'reader') { if (isFullscreen) toggleFullscreen(); setView('series') }
          else setView('collection')
        }}
        isFullscreen={isFullscreen}
      />

      {view === 'collection' && (
        <Collection
          collection={collection}
          progress={progress}
          metadata={metadata}
          onOpen={openSeries}
          onAddSeries={addSeries}
          onAddCbz={addCbz}
          onScanLibrary={scanLibrary}
          onRemove={removeSeries}
          onContinue={openReaderFromCollection}
          onOpenStats={() => setView('stats')}
        />
      )}

      {view === 'stats' && (
        <StatsView collection={collection} progress={progress} metadata={metadata} />
      )}

      {view === 'series' && currentSeries && (
        <SeriesDetail
          series={currentSeries}
          progress={progress}
          seriesMeta={metadata[currentSeries.id] || {}}
          onOpen={openReader}
          onUpdateSeries={updateSeries}
          onUpdateMeta={updates => updateMetadata(currentSeries.id, updates)}
          onMarkAllRead={() => markAllRead(currentSeries)}
        />
      )}

      {view === 'reader' && selectedVolume && currentSeries && (
        <Reader
          volume={selectedVolume}
          seriesVolumes={currentSeries.volumes}
          savedPage={progress[selectedVolume.path]?.page ?? 0}
          onProgress={updateProgress}
          onClose={() => { if (isFullscreen) toggleFullscreen(); setView('series') }}
          isFullscreen={isFullscreen}
          onFullscreenToggle={toggleFullscreen}
          bookmarks={bookmarks[selectedVolume.path] || []}
          onToggleBookmark={pageIndex => toggleBookmark(selectedVolume.path, pageIndex)}
          onJumpVolume={vol => setSelectedVolume(vol)}
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

function StatsView({ collection, progress, metadata }) {
  const totalSeries = collection.length
  const totalVolumes = collection.reduce((s, c) => s + c.volumes.length, 0)
  const completedVols = Object.values(progress).filter(p => p.total > 0 && p.page >= p.total - 1).length
  const totalPagesRead = Object.values(progress).reduce((s, p) => s + (p.page || 0), 0)

  const week = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recentPagesRead = Object.values(progress)
    .filter(p => p.updatedAt > week)
    .reduce((s, p) => s + (p.page || 0), 0)

  const statusCounts = { reading: 0, 'plan-to-read': 0, completed: 0 }
  Object.values(metadata).forEach(m => {
    if (m.status && statusCounts[m.status] !== undefined) statusCounts[m.status]++
  })

  function computeStreak() {
    const daySet = new Set(
      Object.values(progress)
        .filter(p => p.updatedAt)
        .map(p => {
          const d = new Date(p.updatedAt)
          return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        })
    )
    let streak = 0
    const today = new Date()
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (daySet.has(key)) streak++
      else if (i > 0) break
    }
    return streak
  }

  const streak = computeStreak()

  const rated = collection
    .filter(s => metadata[s.id]?.rating > 0)
    .sort((a, b) => (metadata[b.id]?.rating || 0) - (metadata[a.id]?.rating || 0))
    .slice(0, 5)

  return (
    <div className="stats-view">
      <h2 className="stats-heading">Reading Stats</h2>
      <div className="stats-grid">
        <StatCard value={totalSeries} label="Series" />
        <StatCard value={totalVolumes} label="Volumes" />
        <StatCard value={completedVols} label="Finished" sub="vols" />
        <StatCard value={totalPagesRead.toLocaleString()} label="Pages Read" />
        <StatCard value={recentPagesRead.toLocaleString()} label="This Week" sub="pages" />
        <StatCard value={streak} label="Day Streak" />
      </div>
      <div className="stats-section">
        <h3 className="stats-sub">By Status</h3>
        <div className="stats-status-row">
          <div className="stats-status-item"><span className="dot dot-reading" />Reading: {statusCounts.reading}</div>
          <div className="stats-status-item"><span className="dot dot-plan" />Plan to Read: {statusCounts['plan-to-read']}</div>
          <div className="stats-status-item"><span className="dot dot-done" />Completed: {statusCounts.completed}</div>
        </div>
      </div>
      {rated.length > 0 && (
        <div className="stats-section">
          <h3 className="stats-sub">Top Rated</h3>
          <div className="stats-top-list">
            {rated.map(s => (
              <div key={s.id} className="stats-top-item">
                <span className="stats-top-name">{s.name}</span>
                <span className="stats-top-stars">{'★'.repeat(metadata[s.id].rating)}{'☆'.repeat(5 - metadata[s.id].rating)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ value, label, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}{sub && <span className="stat-sub"> {sub}</span>}</div>
    </div>
  )
}
