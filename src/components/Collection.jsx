import { useState, useEffect } from 'react'

export default function Collection({ collection, progress, onOpen, onAddSeries, onAddCbz, onScanLibrary, onRemove, onContinue }) {
  const [search, setSearch] = useState('')
  const [contextMenu, setContextMenu] = useState(null)

  const filtered = collection.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  // Build "continue reading" list — volumes with progress, sorted by most recent
  const continueList = Object.entries(progress)
    .filter(([, p]) => p.page > 0 && p.page < p.total - 1)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, 6)
    .map(([cbzPath, p]) => {
      for (const series of collection) {
        const vol = series.volumes.find(v => v.path === cbzPath)
        if (vol) return { cbzPath, vol, series, progress: p }
      }
      return null
    })
    .filter(Boolean)

  function handleContextMenu(e, series) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, id: series.id })
  }

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  return (
    <div className="collection-view" onClick={() => setContextMenu(null)}>
      <div className="collection-toolbar">
        <input
          className="search-input"
          placeholder="Search manga..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="add-btn" onClick={onScanLibrary}>+ Library</button>
      </div>

      {continueList.length > 0 && !search && (
        <div className="section">
          <h2 className="section-title">Continue Reading</h2>
          <div className="continue-grid">
            {continueList.map(({ cbzPath, vol, series, progress: p }) => (
              <ContinueCard
                key={cbzPath}
                vol={vol}
                series={series}
                progress={p}
                onClick={() => onContinue(cbzPath)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="section">
        {continueList.length > 0 && !search && <h2 className="section-title">Library</h2>}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📚</div>
            <p>Your collection is empty</p>
            <p className="empty-sub">Add a manga series folder or individual .cbz files</p>
          </div>
        ) : (
          <div className="manga-grid">
            {filtered.map(series => (
              <MangaCard
                key={series.id}
                series={series}
                progress={progress}
                onOpen={() => onOpen(series)}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        )}
      </div>

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => { onRemove(contextMenu.id); setContextMenu(null) }}>
            Remove from collection
          </button>
        </div>
      )}
    </div>
  )
}

function ContinueCard({ vol, series, progress, onClick }) {
  const [cover, setCover] = useState(null)
  const pct = Math.round((progress.page / Math.max(progress.total - 1, 1)) * 100)

  useEffect(() => {
    window.api.getCover(vol.path).then(setCover)
  }, [vol.path])

  return (
    <div className="continue-card" onClick={onClick}>
      <div className="continue-cover">
        {cover ? <img src={cover} alt={vol.name} /> : <div className="cover-placeholder">📖</div>}
        <div className="continue-overlay">
          <span>Resume</span>
        </div>
      </div>
      <div className="continue-info">
        <div className="continue-series">{series.name}</div>
        <div className="continue-vol">{vol.name}</div>
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-pct">{pct}% • {progress.total - progress.page} pages left</div>
      </div>
    </div>
  )
}

function MangaCard({ series, progress, onOpen, onContextMenu }) {
  const [cover, setCover] = useState(null)

  useEffect(() => {
    if (series.coverCbz) window.api.getCover(series.coverCbz).then(setCover)
  }, [series.coverCbz])

  // Overall series progress — average across volumes that have progress
  const volsWithProgress = series.volumes.filter(v => progress[v.path]?.total > 0)
  const totalRead = volsWithProgress.reduce((sum, v) => sum + (progress[v.path]?.page || 0), 0)
  const totalPages = volsWithProgress.reduce((sum, v) => sum + (progress[v.path]?.total || 0), 0)
  const seriesPct = totalPages > 0 ? Math.round((totalRead / totalPages) * 100) : null

  return (
    <div className="manga-card" onClick={onOpen} onContextMenu={e => onContextMenu(e, series)}>
      <div className="manga-cover">
        {cover ? <img src={cover} alt={series.name} /> : <div className="cover-placeholder">📖</div>}
        <div className="volume-badge">{series.volumes.length} vol{series.volumes.length !== 1 ? 's' : ''}</div>
        {seriesPct !== null && (
          <div className="cover-progress-bar" style={{ width: `${seriesPct}%` }} />
        )}
      </div>
      <div className="manga-name">{series.name}</div>
      {seriesPct !== null && <div className="manga-pct">{seriesPct}% read</div>}
    </div>
  )
}
