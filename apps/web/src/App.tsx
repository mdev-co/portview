import { useState } from 'react';
import { Button } from '@/components/ui/button';

function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">Smart Port Szczecin</h1>
      <p className="text-muted-foreground text-sm">D1 smoke test: Tailwind v4 + shadcn/ui</p>
      <Button onClick={() => setCount(c => c + 1)}>Clicks: {count}</Button>
    </main>
  );
}

export default App;
