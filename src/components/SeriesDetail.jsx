import { useState, useEffect } from 'react'

export default function SeriesDetail({ series, progress, onOpen }) {
  return (
    <div className="series-view">
      <div className="series-header">
        <h1 className="series-title">{series.name}</h1>
        <span className="series-count">{series.volumes.length} volume{series.volumes.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="volumes-grid">
        {series.volumes.map((volume) => (
          <VolumeCard
            key={volume.id}
            volume={volume}
            progress={progress[volume.path]}
            onOpen={() => onOpen(volume)}
          />
        ))}
      </div>
    </div>
  )
}

function VolumeCard({ volume, progress, onOpen }) {
  const [cover, setCover] = useState(null)

  useEffect(() => {
    window.api.getCover(volume.path).then(setCover)
  }, [volume.path])

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
