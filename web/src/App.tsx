import { useState } from 'react'
import { Button } from '@/components/ui/button'

function App() {
  const [count, setCount] = useState(0)

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Video Preflight</h1>
      <p className="text-center text-muted-foreground">
        Bộ khung giao diện đã sẵn sàng. Chức năng phân tích video chưa được kết nối.
      </p>
      <Button onClick={() => setCount((value) => value + 1)}>
        Kiểm tra tương tác: {count}
      </Button>
    </main>
  )
}

export default App
