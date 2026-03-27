import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService, type OhlcvCandle, type OhlcvInterval } from '../lib/api';

const REFRESH_INTERVAL_MS = 15_000; // 15 s

interface UseOhlcvResult {
  candles: OhlcvCandle[];
  isLoading: boolean;
  interval: OhlcvInterval;
  changeInterval: (i: OhlcvInterval) => void;
  refresh: () => void;
}

export function useOhlcv(poolId: string | undefined): UseOhlcvResult {
  const [candles, setCandles] = useState<OhlcvCandle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [interval, setInterval] = useState<OhlcvInterval>('5m');
  // Use a ref so the timer ID type unambiguously refers to the global setInterval.
  const timerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);

  const fetchCandles = useCallback(async () => {
    if (!poolId) return;
    setIsLoading(true);
    try {
      const res = await apiService.getOhlcv(poolId, interval, 200);
      if (res.success && res.data) {
        setCandles(res.data);
      }
    } catch {
      // ignore network errors — chart keeps last data
    } finally {
      setIsLoading(false);
    }
  }, [poolId, interval]);

  useEffect(() => {
    // Don't clear candles on refetch — keep stale data visible while loading
    fetchCandles();
    timerRef.current = globalThis.setInterval(fetchCandles, REFRESH_INTERVAL_MS);
    return () => {
      if (timerRef.current !== null) globalThis.clearInterval(timerRef.current);
    };
  }, [fetchCandles]);

  // Clear candles only when the pool changes (not on interval change)
  useEffect(() => {
    setCandles([]);
  }, [poolId]);

  const changeInterval = useCallback((i: OhlcvInterval) => {
    setInterval(i);
  }, []);

  return { candles, isLoading, interval, changeInterval, refresh: fetchCandles };
}
