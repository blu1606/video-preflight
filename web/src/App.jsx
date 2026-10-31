import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import Layout from '@/components/layout'
import AnalyzePage from '@/pages/analyze-page'
import DataExplorerPage from '@/pages/data-explorer-page'
import OverviewPage from '@/pages/overview-page'
import ShopPage from '@/pages/shop-page'
import StudioPage from '@/pages/studio-page'
import VideoPage from '@/pages/video-page'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<StudioPage />} />
        <Route path="upload" element={<Navigate to="/" replace />} />
        <Route element={<Layout />}>
          <Route path="analyze" element={<AnalyzePage />} />
          <Route path="shops" element={<OverviewPage />} />
          <Route path="shops/:id" element={<ShopPage />} />
          <Route path="videos/:id" element={<VideoPage />} />
          <Route path="data" element={<DataExplorerPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
