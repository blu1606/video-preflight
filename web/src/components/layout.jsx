import { Database, History, Store, Upload } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'

import { cn } from '@/lib/utils'

const NAV = [
  { to: '/studio', label: 'Kiểm tra video', icon: Upload, end: true },
  { to: '/analyze', label: 'Lịch sử', icon: History },
  { to: '/shops', label: 'Shops', icon: Store },
  { to: '/data', label: 'Data', icon: Database },
]



export default function Layout() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-6 px-4 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">VI</span>
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-tight">Video Intelligence Lab</span>
              <span className="block text-[11px] text-muted-foreground">Kiểm tra video bán hàng trước khi đăng</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition',
                    isActive ? 'bg-brand-tint text-brand-ink' : 'text-ink-2 hover:bg-subtle',
                  )
                }
              >
                <Icon className="size-3.5" /> <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <a href="/mockup-v2/" className="ml-auto hidden text-xs text-muted-foreground hover:text-ink md:inline">
            mockup-v2 (tham chiếu)
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-[1320px] px-4 py-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
