import { useEffect, useState } from 'react'

// Runs `load` when deps change; `reload()` re-runs it (e.g. after saving an analysis).
export function useFetch(load, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    load()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState({ data: null, loading: false, error }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { ...state, reload: () => setTick((t) => t + 1) }
}
