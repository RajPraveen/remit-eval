// Keeps a page's data fresh while a run is still going.
import { useCallback, useEffect, useState } from 'react';

/** Loads data once (and when deps change), then reloads every 2 s while `isRunning(data)` is true. */
export function usePoll<T>(load: () => Promise<T>, isRunning: (data: T) => boolean, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => load().then(setData, () => undefined), deps);

  useEffect(() => {
    setData(null);
    reload();
  }, [reload]);

  const running = data !== null && isRunning(data);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(reload, 2000);
    return () => clearInterval(timer);
  }, [running, reload]);

  return { data, reload };
}
