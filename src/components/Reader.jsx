import { useState, useEffect, useCallback, useRef } from 'react'

export default function Reader({ volume, seriesVolumes, savedPage, onProgress, onClose, isFullscreen, onFullscreenToggle, bookmarks, onToggleBookmark, onJumpVolume }) {
  const [pages, setPages] = useState([])
  const [current, setCurrent] = useState(0)
  const [doublePage, setDoublePage] = useState(false)
  const [rtl, setRtl] = useState(false)
  const [showUI, setShowUI] = useState(true)
  const [loading, setLoading] = useState(true)
  const [zoomed, setZoomed] = useState(false)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showImageSettings, setShowImageSettings] = useState(false)
  const uiTimer = useRef(null)

  useEffect(() => {
    setLoading(true)
    setZoomed(false)
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
    setZoomed(false)
    setCurrent(c => {
      const step = doublePage && c !== 0 ? 2 : 1
      return Math.min(c + step, totalPages - 1)
    })
  }, [doublePage, totalPages])

  const goPrev = useCallback(() => {
    setZoomed(false)
    setCurrent(c => {
      if (c === 0) return 0
      const step = doublePage && c !== 1 ? 2 : 1
      return Math.max(c - step, 0)
    })
  }, [doublePage])

  useEffect(() => {
    function onKey(e) {
      if (e.key === '?') { setShowShortcuts(v => !v); return }
      if (showShortcuts) { if (e.key === 'Escape') setShowShortcuts(false); return }
      if (e.key === 'Escape') { if (zoomed) { setZoomed(false); return } onClose(); return }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') rtl ? goPrev() : goNext()
      if (e.key === ' ') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') rtl ? goNext() : goPrev()
      if (e.key === 'd') setDoublePage(v => !v)
      if (e.key === 'f') onFullscreenToggle()
      if (e.key === 'r') setRtl(v => !v)
      if (e.key === 'z') setZoomed(v => !v)
      if (e.key === 'b') onToggleBookmark(current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, onClose, rtl, zoomed, showShortcuts, current, onToggleBookmark, onFullscreenToggle])

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
    if (e.target.closest('button, input, select')) return
    if (zoomed) { setZoomed(false); return }
    showUITemporarily()
    const mid = e.currentTarget.getBoundingClientRect().width / 2
    const isLeft = e.clientX < mid
    if (rtl) {
      isLeft ? goNext() : goPrev()
    } else {
      isLeft ? goPrev() : goNext()
    }
  }

  const imageFilter = `brightness(${brightness}%) contrast(${contrast}%)`
  const isBookmarked = bookmarks.includes(current)

  return (
    <div
      className={`reader${zoomed ? ' reader-zoomed' : ''}`}
      onMouseMove={showUITemporarily}
      onClick={handleReaderClick}
    >
      <div
        className={`reader-pages ${doublePage ? 'double' : 'single'}${rtl ? ' rtl' : ''}`}
        style={{ filter: imageFilter }}
      >
        {getDisplayIndices().map(i => (
          <div key={i} className="reader-page">
            <img src={pageUrl(i)} alt={`Page ${i + 1}`} draggable={false} />
          </div>
        ))}
      </div>

      {/* Top hover zone */}
      <div className="reader-top-zone">
        <div className="reader-top-bar">
          <button className="reader-btn" onClick={e => { e.stopPropagation(); onClose() }}>← Back</button>
          <div className="reader-top-center">
            <span className="reader-title">{volume.name}</span>
            {seriesVolumes?.length > 1 && (
              <select
                className="volume-jump-select"
                value={volume.path}
                onChange={e => {
                  const vol = seriesVolumes.find(v => v.path === e.target.value)
                  if (vol) onJumpVolume(vol)
                }}
                onClick={e => e.stopPropagation()}
              >
                {seriesVolumes.map(v => (
                  <option key={v.path} value={v.path}>{v.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="reader-top-right">
            <button
              className={`reader-btn ${rtl ? 'active' : ''}`}
              onClick={e => { e.stopPropagation(); setRtl(v => !v) }}
              title="Toggle reading direction (R)"
            >{rtl ? 'RTL' : 'LTR'}</button>
            <button
              className={`reader-btn ${doublePage ? 'active' : ''}`}
              onClick={e => { e.stopPropagation(); setDoublePage(v => !v) }}
              title="Toggle double page (D)"
            >⊟ Double</button>
            <button
              className={`reader-btn ${zoomed ? 'active' : ''}`}
              onClick={e => { e.stopPropagation(); setZoomed(v => !v) }}
              title="Toggle zoom (Z)"
            >⌕ Zoom</button>
            <button
              className={`reader-btn ${showImageSettings ? 'active' : ''}`}
              onClick={e => { e.stopPropagation(); setShowImageSettings(v => !v) }}
              title="Image adjustments"
            >☀</button>
            <button
              className="reader-btn"
              onClick={e => { e.stopPropagation(); onFullscreenToggle() }}
              title="Toggle fullscreen (F)"
            >{isFullscreen ? '⊠ Exit FS' : '⊞ Fullscreen'}</button>
            <button
              className="reader-btn"
              onClick={e => { e.stopPropagation(); setShowShortcuts(v => !v) }}
              title="Keyboard shortcuts (?)"
            >?</button>
          </div>
        </div>

        {showImageSettings && (
          <div className="image-settings-panel" onClick={e => e.stopPropagation()}>
            <div className="image-setting-row">
              <span className="image-setting-label">Brightness</span>
              <input type="range" min={50} max={150} value={brightness} onChange={e => setBrightness(Number(e.target.value))} className="image-setting-slider" />
              <span className="image-setting-val">{brightness}%</span>
            </div>
            <div className="image-setting-row">
              <span className="image-setting-label">Contrast</span>
              <input type="range" min={50} max={150} value={contrast} onChange={e => setContrast(Number(e.target.value))} className="image-setting-slider" />
              <span className="image-setting-val">{contrast}%</span>
            </div>
            <button className="reader-btn" onClick={() => { setBrightness(100); setContrast(100) }}>Reset</button>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className={`reader-ui ${showUI ? 'visible' : ''}`}>
        <div className="reader-bottom-bar">
          <button
            className="nav-btn"
            onClick={e => { e.stopPropagation(); rtl ? goNext() : goPrev() }}
            disabled={rtl ? current >= totalPages - 1 : current === 0}
          >{rtl ? 'Next ›' : '‹ Prev'}</button>
          <div className="reader-progress-wrap">
            <input
              type="range"
              className="page-slider"
              min={0}
              max={totalPages - 1}
              value={current}
              onChange={e => { setZoomed(false); setCurrent(Number(e.target.value)) }}
              onClick={e => e.stopPropagation()}
            />
            <div className="reader-progress-info">
              <span className="page-info">
                {doublePage && current !== 0
                  ? `${current + 1}–${Math.min(current + 2, totalPages)} / ${totalPages}`
                  : `${current + 1} / ${totalPages}`}
              </span>
              <span className="pct-info">{pct}% · {remaining} page{remaining !== 1 ? 's' : ''} left</span>
            </div>
          </div>
          <button
            className={`nav-btn bookmark-btn ${isBookmarked ? 'bookmarked' : ''}`}
            onClick={e => { e.stopPropagation(); onToggleBookmark(current) }}
            title="Bookmark this page (B)"
          >{isBookmarked ? '★' : '☆'}</button>
          <button
            className="nav-btn"
            onClick={e => { e.stopPropagation(); rtl ? goPrev() : goNext() }}
            disabled={rtl ? current === 0 : current >= totalPages - 1}
          >{rtl ? '‹ Prev' : 'Next ›'}</button>
        </div>
      </div>

      {/* Keyboard shortcuts overlay */}
      {showShortcuts && (
        <div className="shortcuts-overlay" onClick={e => { e.stopPropagation(); setShowShortcuts(false) }}>
          <div className="shortcuts-panel" onClick={e => e.stopPropagation()}>
            <h3 className="shortcuts-title">Keyboard Shortcuts</h3>
            <div className="shortcuts-grid">
              <kbd>← / →</kbd><span>Navigate pages</span>
              <kbd>Space</kbd><span>Next page</span>
              <kbd>D</kbd><span>Toggle double page</span>
              <kbd>F</kbd><span>Toggle fullscreen</span>
              <kbd>R</kbd><span>Toggle RTL / LTR direction</span>
              <kbd>Z</kbd><span>Toggle zoom</span>
              <kbd>B</kbd><span>Bookmark current page</span>
              <kbd>Esc</kbd><span>Exit zoom / close reader</span>
              <kbd>?</kbd><span>Show this overlay</span>
            </div>
            <button className="reader-btn" style={{ marginTop: 12 }} onClick={() => setShowShortcuts(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
