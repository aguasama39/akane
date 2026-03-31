import { useState, useEffect, useMemo } from 'react'

export default function Collection({ collection, progress, metadata, onOpen, onAddSeries, onAddCbz, onScanLibrary, onRemove, onContinue, onOpenStats }) {
  const [search, setSearch] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const [sort, setSort] = useState('added')
  const [viewMode, setViewMode] = useState('grid')
  const [statusFilter, setStatusFilter] = useState('all')
  const [activeTag, setActiveTag] = useState(null)
  const [thumbSize, setThumbSize] = useState(150)

  const allTags = useMemo(() => {
    const tagSet = new Set()
    collection.forEach(s => (metadata[s.id]?.tags || []).forEach(t => tagSet.add(t)))
    return [...tagSet].sort()
  }, [collection, metadata])

  let filtered = collection.filter(s => {
    if (!s.name.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter !== 'all' && (metadata[s.id]?.status || '') !== statusFilter) return false
    if (activeTag && !(metadata[s.id]?.tags || []).includes(activeTag)) return false
    return true
  })

  filtered = [...filtered].sort((a, b) => {
    if (sort === 'alpha') return a.name.localeCompare(b.name)
    if (sort === 'progress') {
      const pa = getSeriesPct(a, progress) ?? -1
      const pb = getSeriesPct(b, progress) ?? -1
      return pb - pa
    }
    if (sort === 'year') {
      const ya = parseInt(metadata[a.id]?.year || a.year || 0)
      const yb = parseInt(metadata[b.id]?.year || b.year || 0)
      return yb - ya
    }
    return 0
  })

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

  const showContinue = continueList.length > 0 && !search && statusFilter === 'all' && !activeTag

  return (
    <div className="collection-view" onClick={() => setContextMenu(null)}>
      <div className="collection-toolbar">
        <input
          className="search-input"
          placeholder="Search manga..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="sort-select" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="added">Added</option>
          <option value="alpha">A–Z</option>
          <option value="progress">Progress</option>
          <option value="year">Year</option>
        </select>
        <div className="view-toggle">
          <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Grid view">⊞</button>
          <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List view">☰</button>
        </div>
        <button className="add-btn" onClick={onScanLibrary}>+ Library</button>
        <button className="stats-btn" onClick={onOpenStats} title="Reading stats">📊</button>
      </div>

      <div className="filter-bar">
        {['all', 'reading', 'plan-to-read', 'completed'].map(s => (
          <button
            key={s}
            className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}
          >{s === 'all' ? 'All' : s === 'plan-to-read' ? 'Plan to Read' : s.charAt(0).toUpperCase() + s.slice(1)}</button>
        ))}
        {allTags.length > 0 && (
          <>
            <div className="filter-sep" />
            {allTags.map(tag => (
              <button
                key={tag}
                className={`filter-chip tag-chip ${activeTag === tag ? 'active' : ''}`}
                onClick={() => setActiveTag(t => t === tag ? null : tag)}
              >{tag}</button>
            ))}
          </>
        )}
        {viewMode === 'grid' && (
          <div className="thumb-size-wrap" title="Thumbnail size">
            <span className="thumb-size-icon">⊡</span>
            <input
              type="range" min={100} max={220} value={thumbSize}
              onChange={e => setThumbSize(Number(e.target.value))}
              className="thumb-slider"
            />
          </div>
        )}
      </div>

      {showContinue && (
        <div className="section">
          <h2 className="section-title">Continue Reading</h2>
          <div className="continue-grid">
            {continueList.map(({ cbzPath, vol, series, progress: p }) => (
              <ContinueCard key={cbzPath} vol={vol} series={series} progress={p} onClick={() => onContinue(cbzPath)} />
            ))}
          </div>
        </div>
      )}

      <div className="section">
        {showContinue && <h2 className="section-title">Library</h2>}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📚</div>
            <p>Your collection is empty</p>
            <p className="empty-sub">Add a manga series folder or individual .cbz / .cbr files</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="manga-grid" style={{ '--thumb-min': `${thumbSize}px` }}>
            {filtered.map(series => (
              <MangaCard
                key={series.id}
                series={series}
                progress={progress}
                meta={metadata[series.id] || {}}
                onOpen={() => onOpen(series)}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        ) : (
          <div className="manga-list">
            {filtered.map(series => (
              <MangaListRow
                key={series.id}
                series={series}
                progress={progress}
                meta={metadata[series.id] || {}}
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

function getSeriesPct(series, progress) {
  const vols = series.volumes.filter(v => progress[v.path]?.total > 0)
  if (vols.length === 0) return null
  const totalRead = vols.reduce((s, v) => s + (progress[v.path]?.page || 0), 0)
  const totalPages = vols.reduce((s, v) => s + (progress[v.path]?.total || 0), 0)
  return totalPages > 0 ? Math.round((totalRead / totalPages) * 100) : null
}

const STATUS_COLORS = { reading: '#4f8ef7', 'plan-to-read': '#f7a94f', completed: '#4fc78a' }

function MangaCard({ series, progress, meta, onOpen, onContextMenu }) {
  const [cover, setCover] = useState(null)

  useEffect(() => {
    if (series.coverCbz) window.api.getCover(series.coverCbz).then(setCover)
  }, [series.coverCbz])

  const seriesPct = getSeriesPct(series, progress)

  return (
    <div className="manga-card" onClick={onOpen} onContextMenu={e => onContextMenu(e, series)}>
      <div className="manga-cover">
        {cover ? <img src={cover} alt={series.name} /> : <div className="cover-placeholder">📖</div>}
        <div className="volume-badge">{series.volumes.length} vol{series.volumes.length !== 1 ? 's' : ''}</div>
        {meta.status && <div className="status-dot" style={{ background: STATUS_COLORS[meta.status] }} />}
        {meta.rating > 0 && <div className="card-rating">{'★'.repeat(meta.rating)}</div>}
        {seriesPct !== null && <div className="cover-progress-bar" style={{ width: `${seriesPct}%` }} />}
      </div>
      <div className="manga-name">{series.name}</div>
      {seriesPct !== null && <div className="manga-pct">{seriesPct}% read</div>}
    </div>
  )
}

function MangaListRow({ series, progress, meta, onOpen, onContextMenu }) {
  const [cover, setCover] = useState(null)

  useEffect(() => {
    if (series.coverCbz) window.api.getCover(series.coverCbz).then(setCover)
  }, [series.coverCbz])

  const seriesPct = getSeriesPct(series, progress)
  const STATUS_LABELS = { reading: 'Reading', 'plan-to-read': 'Plan to Read', completed: 'Completed' }

  return (
    <div className="manga-list-row" onClick={onOpen} onContextMenu={e => onContextMenu(e, series)}>
      <div className="list-cover">
        {cover ? <img src={cover} alt={series.name} /> : <div className="cover-placeholder small">📖</div>}
      </div>
      <div className="list-info">
        <div className="list-name">{series.name}</div>
        <div className="list-meta-row">
          {(meta.author || series.author) && <span className="list-meta-item">{meta.author || series.author}</span>}
          {(meta.year || series.year) && <span className="list-meta-item">{meta.year || series.year}</span>}
          <span className="list-meta-item">{series.volumes.length} vol{series.volumes.length !== 1 ? 's' : ''}</span>
          {meta.status && <span className="list-status" style={{ color: STATUS_COLORS[meta.status] }}>{STATUS_LABELS[meta.status]}</span>}
        </div>
        {meta.tags?.length > 0 && (
          <div className="list-tags">
            {meta.tags.map(t => <span key={t} className="tag-badge">{t}</span>)}
          </div>
        )}
      </div>
      <div className="list-right">
        {meta.rating > 0 && <div className="list-rating">{'★'.repeat(meta.rating)}{'☆'.repeat(5 - meta.rating)}</div>}
        {seriesPct !== null && (
          <div className="list-progress">
            <div className="list-progress-bar-wrap">
              <div className="list-progress-bar" style={{ width: `${seriesPct}%` }} />
            </div>
            <span className="list-pct">{seriesPct}%</span>
          </div>
        )}
      </div>
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
        <div className="continue-overlay"><span>Resume</span></div>
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
