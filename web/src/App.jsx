import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import Layout from '@/components/layout'
import AnalyzePage from '@/pages/analyze-page'
import DataExplorerPage from '@/pages/data-explorer-page'
import LandingPage from '@/pages/landing-page'
import LoginPage from '@/pages/login-page'
import OverviewPage from '@/pages/overview-page'
import AddVideoPage from '@/pages/add-video-page'
import ShopPage from '@/pages/shop-page'
import ShopProductsPage from '@/pages/shop-products-page'
import ShopsSelectPage from '@/pages/shops-select-page'
import StudioPage from '@/pages/studio-page'
import VideoPage from '@/pages/video-page'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="shops/select" element={<ShopsSelectPage />} />
        <Route path="shops/:id" element={<ShopProductsPage />} />
        <Route path="shops/:id/products/:skuId/add-video" element={<AddVideoPage />} />
        <Route path="studio" element={<StudioPage />} />
        <Route path="upload" element={<Navigate to="/studio" replace />} />
        <Route element={<Layout />}>
          <Route path="analyze" element={<AnalyzePage />} />
          <Route path="shops" element={<OverviewPage />} />
          <Route path="shops/:id/profile" element={<ShopPage />} />
          <Route path="videos/:id" element={<VideoPage />} />
          <Route path="data" element={<DataExplorerPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
