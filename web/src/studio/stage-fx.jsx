import { useEffect, useRef } from 'react'

// A field of light points that ripples behind the phone while an analysis runs (three.js, loaded on first run).
// `active` ramps the field up and holds it; when it turns off after a finished run (`done`) the field sends one
// pulse outward and fades. The render loop stops once the field is dark, so nothing animates at rest.

const COLS = 140
const ROWS = 70

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uPulse;
  attribute float aSeed;
  varying float vGlow;
  void main() {
    vec3 p = position;
    float d = length(p.xz);
    float wave = sin(p.x * .55 + uTime * 1.3) * .28 + sin(p.z * .7 - uTime * 1.9) * .22;
    float ring = exp(-pow(d - uPulse * 26.0, 2.0) * .35) * (1.0 - uPulse);
    p.y += (wave + ring * 2.4) * uEnergy;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.6 + aSeed * 1.8 + ring * 6.0) * (26.0 / -mv.z);
    vGlow = clamp(uEnergy * (.35 + .65 * (1.0 - d / 30.0)) + ring * 1.5, 0.0, 1.4);
  }
`

const FRAGMENT = /* glsl */ `
  varying float vGlow;
  void main() {
    vec2 c = gl_PointCoord - .5;
    float a = smoothstep(.5, 0.0, length(c)) * vGlow;
    vec3 col = mix(vec3(1.0, .42, .25), vec3(1.0, .78, .62), vGlow * .6);
    gl_FragColor = vec4(col, a);
  }
`

export function StageFx({ active, done }) {
  const host = useRef(null)
  const state = useRef({ target: 0, pulse: -1 })

  useEffect(() => {
    state.current.target = active ? 1 : 0
    if (!active && done) state.current.pulse = 0
    state.current.wake?.()
  }, [active, done])

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    let disposed = false
    let cleanup = () => {}
    // three.js only loads once a run has started; the idle studio never downloads it
    const boot = async () => {
      const THREE = await import('three')
      if (disposed || !host.current) return
      const el = host.current
      const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
      el.appendChild(renderer.domElement)
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100)
      camera.position.set(0, 7, 17)
      camera.lookAt(0, -1, 0)

      const positions = new Float32Array(COLS * ROWS * 3)
      const seeds = new Float32Array(COLS * ROWS)
      for (let r = 0, i = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++, i++) {
          positions.set([(c / (COLS - 1) - 0.5) * 60, -2.5, (r / (ROWS - 1) - 0.5) * 30 - 4], i * 3)
          seeds[i] = Math.random()
        }
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
      const uniforms = { uTime: { value: 0 }, uEnergy: { value: 0 }, uPulse: { value: 1 } }
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      })
      scene.add(new THREE.Points(geometry, material))

      const resize = () => {
        const w = el.clientWidth || 1
        const h = el.clientHeight || 1
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      }
      resize()
      const ro = new ResizeObserver(resize)
      ro.observe(el)

      let frame = 0
      let last = performance.now()
      const tick = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000)
        last = now
        const s = state.current
        uniforms.uTime.value += dt
        uniforms.uEnergy.value += (s.target - uniforms.uEnergy.value) * Math.min(1, dt * 1.6)
        if (s.pulse >= 0) {
          s.pulse = Math.min(1, s.pulse + dt * 0.55)
          uniforms.uPulse.value = s.pulse
          if (s.pulse >= 1) s.pulse = -1
        }
        renderer.render(scene, camera)
        const dark = s.target === 0 && uniforms.uEnergy.value < 0.004 && s.pulse < 0
        frame = dark ? 0 : requestAnimationFrame(tick)
      }
      state.current.wake = () => {
        if (!frame) {
          last = performance.now()
          frame = requestAnimationFrame(tick)
        }
      }
      state.current.wake()
      cleanup = () => {
        cancelAnimationFrame(frame)
        ro.disconnect()
        geometry.dispose()
        material.dispose()
        renderer.dispose()
        renderer.domElement.remove()
      }
    }
    const started = { current: false }
    const maybeBoot = () => {
      if (started.current || state.current.target === 0) return
      started.current = true
      boot()
    }
    state.current.wake = maybeBoot
    maybeBoot()
    return () => {
      disposed = true
      cleanup()
    }
  }, [])

  return <div ref={host} className={`stage-fx${active || done ? ' is-on' : ''}`} aria-hidden="true" />
}
