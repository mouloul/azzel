'use client';

import { useEffect, useState } from 'react';
import { formatLocalTime, nowIsoUtc } from '@azzel/shared';

export function LocalClock() {
  const [time, setTime] = useState<{ iso: string; label: string } | null>(null);

  useEffect(() => {
    const tick = () => {
      const iso = nowIsoUtc();
      setTime({ iso, label: formatLocalTime(iso) });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!time) {
    return null;
  }

  return (
    <p className="freshness">
      Heure locale : <span className="mono-lg">{time.label}</span> — stockée en ISO 8601 UTC :{' '}
      <span className="meta">{time.iso}</span>
    </p>
  );
}
