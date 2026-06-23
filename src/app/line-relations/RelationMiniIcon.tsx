'use client';

import { useState, useEffect } from 'react';

const PHASES = [
  { l1: { ty: -9,  rot:  0 }, l2: { ty:  9,  rot:   0, opacity: 1,   dashed: false } },
  { l1: { ty:  0,  rot: 35 }, l2: { ty:  0,  rot: -35, opacity: 1,   dashed: false } },
  { l1: { ty:  7,  rot:  0 }, l2: { ty: -10, rot:  70, opacity: 0.4, dashed: true  } },
] as const;

export default function RelationMiniIcon({ className }: { className?: string }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % 3), 2400);
    return () => clearInterval(id);
  }, []);

  const p = PHASES[idx];

  return (
    <div className={className} style={{ position: 'relative' }}>
      {/* Line 1 — orange */}
      <div
        style={{
          position: 'absolute',
          width: 28,
          height: 2,
          borderRadius: 1.5,
          backgroundColor: '#E8650A',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, calc(-50% + ${p.l1.ty}px)) rotate(${p.l1.rot}deg)`,
          transition: 'transform 0.75s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
      {/* Line 2 — navy */}
      <div
        style={{
          position: 'absolute',
          width: 28,
          height: 2,
          borderRadius: 1.5,
          top: '50%',
          left: '50%',
          transform: `translate(-50%, calc(-50% + ${p.l2.ty}px)) rotate(${p.l2.rot}deg)`,
          transition: 'transform 0.75s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s',
          opacity: p.l2.opacity,
          background: p.l2.dashed
            ? 'repeating-linear-gradient(to right, #1B2A4A 0, #1B2A4A 4px, transparent 4px, transparent 7px)'
            : '#1B2A4A',
        }}
      />
    </div>
  );
}
