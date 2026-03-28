import { useState, useEffect } from 'react'

export default function SeriesDetail({ series, progress, seriesMeta, onOpen, onUpdateSeries, onUpdateMeta, onMarkAllRead, onMarkAllUnread }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    author: series.author || '',
    year: series.year || '',
    synopsis: series.synopsis || '',
  })
  const [metaDraft, setMetaDraft] = useState(metaDraftFrom(seriesMeta))
  const [pageCounts, setPageCounts] = useState({})
  const [covers, setCovers] = useState({})

  function metaDraftFrom(m) {
    return {
      tags: (m.tags || []).join(', '),
      status: m.status || '',
      rating: m.rating || 0,
      notes: m.notes || '',
      publisher: m.publisher || '',
      seriesStatus: m.seriesStatus || '',
    }
  }

  useEffect(() => {
    setDraft({ author: series.author || '', year: series.year || '', synopsis: series.synopsis || '' })
    setMetaDraft(metaDraftFrom(seriesMeta))
  }, [series.id])

  useEffect(() => {
    const paths = series.volumes.map(v => v.path)
    window.api.getCoversBatch(paths).then(setCovers)
  }, [series.id])

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
    const tags = metaDraft.tags.split(',').map(t => t.trim()).filter(Boolean)
    onUpdateMeta({ tags, status: metaDraft.status, rating: metaDraft.rating, notes: metaDraft.notes, publisher: metaDraft.publisher, seriesStatus: metaDraft.seriesStatus })
    setEditing(false)
  }

  function cancelEdit() {
    setDraft({ author: series.author || '', year: series.year || '', synopsis: series.synopsis || '' })
    setMetaDraft(metaDraftFrom(seriesMeta))
    setEditing(false)
  }

  const STATUS_LABELS = { reading: 'Reading', 'plan-to-read': 'Plan to Read', completed: 'Completed' }
  const STATUS_COLORS = { reading: 'var(--accent)', 'plan-to-read': '#f7a94f', completed: '#4fc78a' }

  return (
    <div className="series-view">
      <div className="series-meta-panel">
        <SeriesCover path={series.coverCbz} />
        <div className="series-meta-info">
          <div className="series-meta-header">
            <h1 className="series-title">{series.name}</h1>
            <div className="series-header-actions">
              {!editing && (
                <>
                  <button className="meta-action-btn" onClick={onMarkAllRead} title="Mark all volumes as read">✓ All Read</button>
                  <button className="meta-action-btn" onClick={onMarkAllUnread} title="Reset all volume progress">↺ Reset All</button>
                  <button className="meta-edit-btn" onClick={() => setEditing(true)}>Edit</button>
                </>
              )}
            </div>
          </div>

          {editing ? (
            <div className="meta-edit-form">
              <div className="meta-row">
                <label className="meta-label">Author</label>
                <input className="meta-input" value={draft.author} onChange={e => setDraft(d => ({ ...d, author: e.target.value }))} placeholder="Unknown" />
              </div>
              <div className="meta-row">
                <label className="meta-label">Year</label>
                <input className="meta-input meta-input-short" value={draft.year} onChange={e => setDraft(d => ({ ...d, year: e.target.value }))} placeholder="—" type="number" />
              </div>
              <div className="meta-row">
                <label className="meta-label">Publisher</label>
                <input className="meta-input" value={metaDraft.publisher} onChange={e => setMetaDraft(d => ({ ...d, publisher: e.target.value }))} placeholder="—" />
              </div>
              <div className="meta-row">
                <label className="meta-label">My Status</label>
                <select className="meta-select" value={metaDraft.status} onChange={e => setMetaDraft(d => ({ ...d, status: e.target.value }))}>
                  <option value="">—</option>
                  <option value="plan-to-read">Plan to Read</option>
                  <option value="reading">Reading</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="meta-row">
                <label className="meta-label">Series</label>
                <select className="meta-select" value={metaDraft.seriesStatus} onChange={e => setMetaDraft(d => ({ ...d, seriesStatus: e.target.value }))}>
                  <option value="">—</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                  <option value="hiatus">On Hiatus</option>
                </select>
              </div>
              <div className="meta-row">
                <label className="meta-label">Rating</label>
                <StarRating value={metaDraft.rating} onChange={r => setMetaDraft(d => ({ ...d, rating: r }))} />
              </div>
              <div className="meta-row">
                <label className="meta-label">Tags</label>
                <input className="meta-input" value={metaDraft.tags} onChange={e => setMetaDraft(d => ({ ...d, tags: e.target.value }))} placeholder="action, romance, fantasy (comma-separated)" />
              </div>
              <div className="meta-row meta-row-col">
                <label className="meta-label">Synopsis</label>
                <textarea className="meta-textarea" value={draft.synopsis} onChange={e => setDraft(d => ({ ...d, synopsis: e.target.value }))} placeholder="No synopsis yet..." rows={3} />
              </div>
              <div className="meta-row meta-row-col">
                <label className="meta-label">Notes</label>
                <textarea className="meta-textarea" value={metaDraft.notes} onChange={e => setMetaDraft(d => ({ ...d, notes: e.target.value }))} placeholder="Personal notes..." rows={2} />
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
                {seriesMeta.publisher && (
                  <div className="meta-stat">
                    <span className="meta-label">Publisher</span>
                    <span className="meta-value">{seriesMeta.publisher}</span>
                  </div>
                )}
                <div className="meta-stat">
                  <span className="meta-label">Volumes</span>
                  <span className="meta-value">{series.volumes.length}</span>
                </div>
                <div className="meta-stat">
                  <span className="meta-label">Pages</span>
                  <span className="meta-value">{totalPages > 0 ? totalPages.toLocaleString() : '—'}</span>
                </div>
              </div>
              <div className="meta-badges-row">
                {seriesMeta.status && (
                  <span className="status-badge" style={{ background: STATUS_COLORS[seriesMeta.status] + '22', color: STATUS_COLORS[seriesMeta.status], borderColor: STATUS_COLORS[seriesMeta.status] + '44' }}>
                    {STATUS_LABELS[seriesMeta.status]}
                  </span>
                )}
                {seriesMeta.seriesStatus && (
                  <span className="status-badge secondary">{seriesMeta.seriesStatus}</span>
                )}
                {seriesMeta.rating > 0 && (
                  <span className="rating-display">{'★'.repeat(seriesMeta.rating)}{'☆'.repeat(5 - seriesMeta.rating)}</span>
                )}
              </div>
              {seriesMeta.tags?.length > 0 && (
                <div className="tags-row">
                  {seriesMeta.tags.map(t => <span key={t} className="tag-badge">{t}</span>)}
                </div>
              )}
              {series.synopsis && <p className="meta-synopsis">{series.synopsis}</p>}
              {seriesMeta.notes && (
                <p className="meta-notes"><span className="meta-label">Notes: </span>{seriesMeta.notes}</p>
              )}
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

function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          className={`star-btn ${(hover || value) >= i ? 'filled' : ''}`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(value === i ? 0 : i)}
        >★</button>
      ))}
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
        {pct !== null && !finished && (
          <div className="cover-progress-bar" style={{ width: `${pct}%` }} />
        )}
      </div>
      <div className="volume-info">
        <div className="volume-name">
          {volume.name}
          {finished && <span className="finished-badge">✓</span>}
        </div>
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
