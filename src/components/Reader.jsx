import { useState, useEffect, useCallback, useRef } from 'react'

export default function Reader({ volume, savedPage, onProgress, onClose }) {
  const [pages, setPages] = useState([])
  const [current, setCurrent] = useState(0)
  const [doublePage, setDoublePage] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showUI, setShowUI] = useState(true)
  const [loading, setLoading] = useState(true)
  const uiTimer = useRef(null)

  useEffect(() => {
    setLoading(true)
    window.api.openVolume(volume.path).then(({ pages }) => {
      setPages(pages)
      setCurrent(savedPage || 0)
      setLoading(false)
    })
  }, [volume.path])

  useEffect(() => {
    if (pages.length > 0) onProgress(volume.path, current, pages.length)
  }, [current, pages.length])

  useEffect(() => {
    if (pages.length === 0) return
    const toPreload = [current + 1, current + 2, current + 3, current - 1]
      .filter(i => i >= 0 && i < pages.length)
    toPreload.forEach(i => {
      const img = new Image()
      img.src = `manga://page?cbz=${encodeURIComponent(volume.path)}&file=${encodeURIComponent(pages[i])}`
    })
  }, [current, pages])

  function showUITemporarily() {
    setShowUI(true)
    clearTimeout(uiTimer.current)
    uiTimer.current = setTimeout(() => setShowUI(false), 3000)
  }
  useEffect(() => () => clearTimeout(uiTimer.current), [])

  const totalPages = pages.length
  const pct = totalPages > 1 ? Math.round((current / (totalPages - 1)) * 100) : 0
  const remaining = totalPages - current - 1

  function getDisplayIndices() {
    if (!doublePage || current === 0) return [current]
    return [current, current + 1].filter(i => i < totalPages)
  }

  const goNext = useCallback(() => {
    setCurrent(c => {
      const step = doublePage && c !== 0 ? 2 : 1
      return Math.min(c + step, totalPages - 1)
    })
  }, [doublePage, totalPages])

  const goPrev = useCallback(() => {
    setCurrent(c => {
      if (c === 0) return 0
      const step = doublePage && c !== 1 ? 2 : 1
      return Math.max(c - step, 0)
    })
  }, [doublePage])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') goNext()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev()
      if (e.key === 'Escape') onClose()
      if (e.key === 'd') setDoublePage(v => !v)
      if (e.key === 'f') { window.api.windowFullscreen(); setFullscreen(v => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, onClose])

  function pageUrl(index) {
    if (index >= totalPages) return null
    return `manga://page?cbz=${encodeURIComponent(volume.path)}&file=${encodeURIComponent(pages[index])}`
  }

  if (loading) return (
    <div className="reader-loading">
      <div className="spinner" />
      <p>Loading pages...</p>
    </div>
  )

  function handleReaderClick(e) {
    if (e.target.closest('button, input')) return
    showUITemporarily()
    const mid = e.currentTarget.getBoundingClientRect().width / 2
    if (e.clientX < mid) goPrev()
    else goNext()
  }

  return (
    <div
      className="reader"
      onMouseMove={showUITemporarily}
      onClick={handleReaderClick}
    >
      <div className={`reader-pages ${doublePage ? 'double' : 'single'}`}>
        {getDisplayIndices().map(i => (
          <div key={i} className="reader-page">
            <img src={pageUrl(i)} alt={`Page ${i + 1}`} draggable={false} />
          </div>
        ))}
      </div>

      <div className={`reader-ui ${showUI ? 'visible' : ''}`}>
        <div className="reader-top-bar">
          <button className="reader-btn" onClick={onClose}>← Back</button>
          <span className="reader-title">{volume.name}</span>
          <div className="reader-top-right">
            <button
              className={`reader-btn ${doublePage ? 'active' : ''}`}
              onClick={() => setDoublePage(v => !v)}
              title="Toggle double page (D)"
            >⊟ Double</button>
            <button
              className="reader-btn"
              onClick={() => { window.api.windowFullscreen(); setFullscreen(v => !v) }}
              title="Toggle fullscreen (F)"
            >{fullscreen ? '⊠ Exit FS' : '⊞ Fullscreen'}</button>
          </div>
        </div>

        <div className="reader-bottom-bar">
          <button className="nav-btn" onClick={goPrev} disabled={current === 0}>‹ Prev</button>
          <div className="reader-progress-wrap">
            <input
              type="range"
              className="page-slider"
              min={0}
              max={totalPages - 1}
              value={current}
              onChange={e => setCurrent(Number(e.target.value))}
            />
            <div className="reader-progress-info">
              <span className="page-info">
                {doublePage && current !== 0
                  ? `${current + 1}–${Math.min(current + 2, totalPages)} / ${totalPages}`
                  : `${current + 1} / ${totalPages}`}
              </span>
              <span className="pct-info">
                {pct}% · {remaining} page{remaining !== 1 ? 's' : ''} left
              </span>
            </div>
          </div>
          <button className="nav-btn" onClick={goNext} disabled={current >= totalPages - 1}>Next ›</button>
        </div>
      </div>
    </div>
  )
}
