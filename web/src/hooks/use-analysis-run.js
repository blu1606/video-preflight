import { useCallback, useEffect, useReducer, useRef } from 'react'

import { analysisRunReducer, initialRunState } from '@/lib/analysis-run-reducer'
import { streamAnalysis } from '@/lib/analysis-stream'

// One live analysis run: start(videoId, params) opens the stream; state follows its events.
// The stream is closed on unmount; the close is deferred one tick so React StrictMode's simulated
// unmount/remount in dev does not kill a run that was just started (a restart would run it twice).
export function useAnalysisRun() {
  const [state, dispatch] = useReducer(analysisRunReducer, initialRunState)
  const controller = useRef(null)
  const closeTimer = useRef(null)

  useEffect(() => {
    clearTimeout(closeTimer.current)
    return () => {
      closeTimer.current = setTimeout(() => controller.current?.close(), 0)
    }
  }, [])

  const start = useCallback((videoId, params) => {
    controller.current?.close()
    dispatch({ type: 'start' })
    controller.current = streamAnalysis(videoId, params, {
      onEvent: (type, data) => dispatch({ type, data }),
    })
  }, [])

  const reset = useCallback(() => {
    controller.current?.close()
    controller.current = null
    dispatch({ type: 'reset' })
  }, [])

  return { ...state, start, reset }
}
