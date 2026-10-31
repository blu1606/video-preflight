// Studio sound: a quiet loop while an analysis runs, a short sweep when it starts and a chime when it is done.
// Generated assets in public/audio (kie.ai). Every play follows the seller's click on "Phân tích", so browsers
// allow it; a missing file or a blocked play is silent, never an error. The seller can mute; the choice is kept.
import { useCallback, useEffect, useRef, useState } from 'react'

const FILES = { loop: '/audio/analysis-loop.mp3', scan: '/audio/scan-start.mp3', done: '/audio/done-chime.mp3' }
const LOOP_VOLUME = 0.16
const STORAGE_KEY = 'studio.sound'

const readOn = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

/** Fade an element's volume to `to` over `ms`; resolves when done. */
function fade(audio, to, ms) {
  return new Promise((resolve) => {
    const from = audio.volume
    const start = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms)
      audio.volume = from + (to - from) * t
      if (t < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}

const playOnce = (src, volume) => {
  const a = new Audio(src)
  a.volume = volume
  a.play().catch(() => {})
}

export function useStudioSound() {
  const [on, setOn] = useState(readOn)
  const onRef = useRef(on)
  const loop = useRef(null)

  const stopLoop = useCallback(async (ms) => {
    const a = loop.current
    if (!a) return
    loop.current = null
    await fade(a, 0, ms)
    a.pause()
  }, [])

  const toggle = useCallback(() => {
    const next = !onRef.current
    onRef.current = next
    setOn(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
    } catch {
      // the choice lasts for this visit only
    }
    if (!next) stopLoop(250)
  }, [stopLoop])

  const start = useCallback(() => {
    if (!onRef.current) return
    playOnce(FILES.scan, 0.35)
    const a = new Audio(FILES.loop)
    a.loop = true
    a.volume = 0
    a.play().then(() => fade(a, LOOP_VOLUME, 1400)).catch(() => {})
    loop.current = a
  }, [])

  const finish = useCallback((ok) => {
    stopLoop(900)
    if (onRef.current && ok) playOnce(FILES.done, 0.4)
  }, [stopLoop])

  useEffect(() => () => loop.current?.pause(), [])
  return { on, toggle, start, finish }
}
