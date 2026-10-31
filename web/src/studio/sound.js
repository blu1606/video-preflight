// Studio sound: a quiet loop while an analysis runs, a short sweep when it starts and a chime when it is done
// (generated assets in public/audio, kie.ai), plus small cues synthesized with Web Audio as the run moves: a tick
// per finished agent step, a sonar ping per radar axis that gets its answer, a soft whoosh per turn of the radar
// sweep and a two-note settle when the score lands. Every sound follows a click by the seller, so browsers allow
// it; a missing file, a blocked play or no Web Audio is silent, never an error. One mute covers all of it.
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

// ---------- synthesized cues ----------

let ctx = null
let master = null
/** The shared audio context, created on first use (after a click) and resumed if the tab suspended it. */
function audio() {
  if (!ctx) {
    const AC = window.AudioContext ?? window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/** One enveloped oscillator note: quick attack, exponential decay, optional pitch glide. */
function note(freq, { at = 0, dur = 0.25, gain = 0.06, type = 'sine', glide = null, out = null } = {}) {
  const ac = audio()
  if (!ac) return
  const t0 = ac.currentTime + at
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t0 + dur * 0.6)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(out ?? master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

/** A short echo bus (feedback delay) for the sonar pings. */
let echo = null
function echoBus() {
  const ac = audio()
  if (!ac) return null
  if (!echo) {
    const input = ac.createGain()
    const delay = ac.createDelay(1)
    const fb = ac.createGain()
    const wet = ac.createGain()
    delay.delayTime.value = 0.13
    fb.gain.value = 0.32
    wet.gain.value = 0.55
    input.connect(master)
    input.connect(delay)
    delay.connect(fb).connect(delay)
    delay.connect(wet).connect(master)
    echo = input
  }
  return echo
}

/** Band-passed noise whose centre glides up and back: the soft air of a radar sweep. */
function whoosh(dur = 1.1, gain = 0.035) {
  const ac = audio()
  if (!ac) return
  const len = Math.floor(ac.sampleRate * dur)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buf
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 3
  const t0 = ac.currentTime
  bp.frequency.setValueAtTime(380, t0)
  bp.frequency.exponentialRampToValueAtTime(2400, t0 + dur * 0.55)
  bp.frequency.exponentialRampToValueAtTime(700, t0 + dur)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.45)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(bp).connect(g).connect(master)
  src.start(t0)
}

const BAND_PITCH = { good: 987.8, warn: 783.99, bad: 587.33 } // B5, G5, D5
const bandOf = (v) => (v == null ? 'warn' : v >= 75 ? 'good' : v >= 50 ? 'warn' : 'bad')
const SWEEP_PERIOD = 2800 // one turn of the radar sweep in glass.css (rd-sweep)

export function useStudioSound() {
  const [on, setOn] = useState(readOn)
  const onRef = useRef(on)
  const loop = useRef(null)
  const sweepTimer = useRef(0)

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
    if (!next) {
      stopLoop(250)
      window.clearInterval(sweepTimer.current)
    }
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

  // an agent step finished: a dry high tick; steps that land together share one
  const lastTick = useRef(0)
  const tick = useCallback(() => {
    if (!onRef.current) return
    const now = performance.now()
    if (now - lastTick.current < 90) return
    lastTick.current = now
    note(2093, { dur: 0.05, gain: 0.025, type: 'triangle', glide: 2637 })
  }, [])

  // a radar axis got its answer: a sonar ping, pitched by the answer's band, with a short echo
  const lastPing = useRef(0)
  const ping = useCallback((value) => {
    if (!onRef.current) return
    const now = performance.now()
    const at = Math.max(0, (lastPing.current + 70 - now) / 1000) // answers arriving together play as a run
    lastPing.current = now + at * 1000
    note(BAND_PITCH[bandOf(value)], { at, dur: 0.5, gain: 0.05, out: echoBus() })
  }, [])

  // the radar sweep turns: one soft whoosh per turn while `active`
  const sweep = useCallback((active) => {
    window.clearInterval(sweepTimer.current)
    sweepTimer.current = 0
    if (!active || !onRef.current) return
    whoosh()
    sweepTimer.current = window.setInterval(() => (onRef.current ? whoosh() : null), SWEEP_PERIOD)
  }, [])

  // the score lands: two notes up, brighter for a postable score, lower for one to fix
  const settle = useCallback((score) => {
    if (!onRef.current) return
    const b = bandOf(score)
    const [a, c] = b === 'good' ? [659.25, 987.77] : b === 'warn' ? [587.33, 880] : [440, 554.37]
    note(a, { dur: 0.35, gain: 0.06 })
    note(c, { at: 0.11, dur: 0.6, gain: 0.06, out: echoBus() })
  }, [])

  // the scan sweep that opens a pass, without the run loop (the short intro pass uses it)
  const scan = useCallback(() => {
    if (onRef.current) playOnce(FILES.scan, 0.3)
  }, [])

  useEffect(() => () => {
    loop.current?.pause()
    window.clearInterval(sweepTimer.current)
  }, [])
  return { on, toggle, start, finish, tick, ping, sweep, settle, scan }
}
