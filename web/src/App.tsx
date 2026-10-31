import { lazy, Suspense } from 'react'

const Studio = lazy(() => import('./studio-entry'))
const SavedWorkspace = lazy(() => import('./features/preflight/preflight-app'))

export default function App() {
  return <Suspense fallback={<p role="status">Đang tải giao diện…</p>}>
    {location.pathname === '/demo' ? <SavedWorkspace /> : <Studio />}
  </Suspense>
}
