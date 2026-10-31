import { TriangleAlert } from 'lucide-react'
import { Component } from 'react'

import { Button } from '@/components/ui/button'

// Keeps a render bug in one region from blanking the whole page; "Thử lại" re-mounts the children.
export class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(`[${this.props.name ?? 'ErrorBoundary'}]`, error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="rounded-lg border border-critical/30 bg-critical-tint p-4 text-sm">
        <div className="flex items-center gap-2 font-semibold text-critical">
          <TriangleAlert className="size-4" /> {this.props.title ?? 'Không hiển thị được phần này'}
        </div>
        <p className="mt-1 font-mono text-xs break-all text-ink-2">{String(this.state.error?.message ?? this.state.error)}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => this.setState({ error: null })}>
          Thử lại
        </Button>
      </div>
    )
  }
}
