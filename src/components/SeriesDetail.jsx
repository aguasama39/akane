import { useState, useEffect } from 'react'

export default function SeriesDetail({ series, progress, onOpen, onUpdateSeries }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    author: series.author || '',
    year: series.year || '',
    synopsis: series.synopsis || '',
  })
  const [pageCounts, setPageCounts] = useState({})
  const [covers, setCovers] = useState({})

  // Batch-fetch all volume covers at once
  useEffect(() => {
    const paths = series.volumes.map(v => v.path)
    window.api.getCoversBatch(paths).then(setCovers)
  }, [series.id])

  // Fetch page counts for volumes that don't have them yet
  useEffect(() => {
    const missing = series.volumes.filter(v => !v.pageCount)
    if (missing.length === 0) return
    Promise.all(
      missing.map(v => window.api.openVolume(v.path).then(({ total }) => ({ id: v.id, total })))
    ).then(results => {
      const counts = {}
      results.forEach(({ id, total }) => { counts[id] = total })
      setPageCounts(counts)
      const updatedVolumes = series.volumes.map(v => ({
        ...v,
        pageCount: v.pageCount || counts[v.id] || 0,
      }))
      onUpdateSeries(series.id, { volumes: updatedVolumes })
    })
  }, [series.id])

  const totalPages = series.volumes.reduce((sum, v) => {
    return sum + (v.pageCount || pageCounts[v.id] || 0)
  }, 0)

  function saveEdit() {
    onUpdateSeries(series.id, { author: draft.author, year: draft.year, synopsis: draft.synopsis })
    setEditing(false)
  }

  function cancelEdit() {
    setDraft({ author: series.author || '', year: series.year || '', synopsis: series.synopsis || '' })
    setEditing(false)
  }

  return (
    <div className="series-view">
      <div className="series-meta-panel">
        <SeriesCover path={series.coverCbz} />
        <div className="series-meta-info">
          <div className="series-meta-header">
            <h1 className="series-title">{series.name}</h1>
            {!editing && (
              <button className="meta-edit-btn" onClick={() => setEditing(true)}>Edit</button>
            )}
          </div>

          {editing ? (
            <div className="meta-edit-form">
              <div className="meta-row">
                <label className="meta-label">Author</label>
                <input
                  className="meta-input"
                  value={draft.author}
                  onChange={e => setDraft(d => ({ ...d, author: e.target.value }))}
                  placeholder="Unknown"
                />
              </div>
              <div className="meta-row">
                <label className="meta-label">Year</label>
                <input
                  className="meta-input meta-input-short"
                  value={draft.year}
                  onChange={e => setDraft(d => ({ ...d, year: e.target.value }))}
                  placeholder="—"
                  type="number"
                />
              </div>
              <div className="meta-row meta-row-col">
                <label className="meta-label">Synopsis</label>
                <textarea
                  className="meta-textarea"
                  value={draft.synopsis}
                  onChange={e => setDraft(d => ({ ...d, synopsis: e.target.value }))}
                  placeholder="No synopsis yet..."
                  rows={4}
                />
              </div>
              <div className="meta-edit-actions">
                <button className="add-btn" onClick={saveEdit}>Save</button>
                <button className="add-btn secondary" onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="meta-fields">
              <div className="meta-stats-row">
                <div className="meta-stat">
                  <span className="meta-label">Author</span>
                  <span className="meta-value">{series.author || '—'}</span>
                </div>
                <div className="meta-stat">
                  <span className="meta-label">Year</span>
                  <span className="meta-value">{series.year || '—'}</span>
                </div>
                <div className="meta-stat">
                  <span className="meta-label">Volumes</span>
                  <span className="meta-value">{series.volumes.length}</span>
                </div>
                <div className="meta-stat">
                  <span className="meta-label">Pages</span>
                  <span className="meta-value">{totalPages > 0 ? totalPages.toLocaleString() : '—'}</span>
                </div>
              </div>
              {series.synopsis && <p className="meta-synopsis">{series.synopsis}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="volumes-section">
        <h2 className="section-title">Volumes</h2>
        <div className="volumes-grid">
          {series.volumes.map((volume) => (
            <VolumeCard
              key={volume.id}
              volume={{ ...volume, pageCount: volume.pageCount || pageCounts[volume.id] || 0 }}
              cover={covers[volume.path] ?? null}
              progress={progress[volume.path]}
              onOpen={() => onOpen(volume)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SeriesCover({ path }) {
  const [cover, setCover] = useState(null)
  useEffect(() => {
    if (path) window.api.getCover(path).then(setCover)
  }, [path])
  return (
    <div className="series-cover-large">
      {cover ? <img src={cover} alt="" /> : <div className="cover-placeholder">📖</div>}
    </div>
  )
}

function VolumeCard({ volume, cover, progress, onOpen }) {
  const pct = progress?.total > 0
    ? Math.round((progress.page / Math.max(progress.total - 1, 1)) * 100)
    : null
  const finished = pct >= 100

  return (
    <div className="volume-card" onClick={onOpen}>
      <div className="volume-cover">
        {cover ? <img src={cover} alt={volume.name} /> : <div className="cover-placeholder">📖</div>}
        {finished && <div className="finished-badge">✓</div>}
        {pct !== null && !finished && (
          <div className="cover-progress-bar" style={{ width: `${pct}%` }} />
        )}
      </div>
      <div className="volume-info">
        <div className="volume-name">{volume.name}</div>
        {pct !== null ? (
          <div className="volume-pct" style={{ color: finished ? 'var(--accent)' : 'var(--text-dim)' }}>
            {finished ? 'Finished' : `${pct}% · ${progress.total - progress.page} left`}
          </div>
        ) : volume.pageCount > 0 ? (
          <div className="volume-pages">{volume.pageCount} pages</div>
        ) : null}
      </div>
    </div>
  )
}
