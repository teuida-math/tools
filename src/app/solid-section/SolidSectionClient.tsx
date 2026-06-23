'use client';

import Link from 'next/link';
import { useState, Suspense, lazy } from 'react';

const PolyhedronExplorer = lazy(() => import('./PolyhedronExplorer'));
const RotationExplorer = lazy(() => import('./RotationExplorer'));

type Tab = 'polyhedron' | 'rotation';

function LoadingViewer() {
  return (
    <div className="w-full aspect-square md:aspect-auto md:h-[400px] bg-white rounded-2xl border border-navy/10 flex items-center justify-center">
      <div className="text-muted text-sm">3D 뷰어 로딩 중…</div>
    </div>
  );
}

export default function SolidSectionClient() {
  const [tab, setTab] = useState<Tab>('polyhedron');

  return (
    <div className="flex flex-col min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-navy/10 bg-navy">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-5 flex items-center gap-3">
          <Link href="/" className="text-orange font-bold text-xl tracking-tight hover:text-orange/80 transition-colors">
            트이다
          </Link>
          <span className="text-white/40 text-xl">|</span>
          <span className="text-white/80 text-sm font-medium">입체도형 단면 탐구기</span>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10 w-full">
        {/* Title */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-muted text-xs hover:text-navy transition-colors mb-4"
          >
            ← 도구 목록으로
          </Link>
          <h1 className="text-2xl font-bold text-navy mb-2">입체도형 단면 탐구기</h1>
          <p className="text-muted text-sm break-keep">
            입체도형을 평면으로 잘라 단면의 모양을 직접 확인하세요.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-navy/10 rounded-xl p-1 mb-6 md:mb-8 w-full md:w-fit">
          <button
            onClick={() => setTab('polyhedron')}
            className={`flex-1 md:flex-none px-2 md:px-5 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${
              tab === 'polyhedron'
                ? 'bg-navy text-white shadow-sm'
                : 'text-muted hover:text-navy'
            }`}
          >
            다면체 단면 탐구기
          </button>
          <button
            onClick={() => setTab('rotation')}
            className={`flex-1 md:flex-none px-2 md:px-5 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${
              tab === 'rotation'
                ? 'bg-navy text-white shadow-sm'
                : 'text-muted hover:text-navy'
            }`}
          >
            회전체 단면 탐구기
          </button>
        </div>

        {/* Content */}
        <div className="bg-paper rounded-2xl">
          <Suspense fallback={<LoadingViewer />}>
            {tab === 'polyhedron' ? <PolyhedronExplorer /> : <RotationExplorer />}
          </Suspense>
        </div>

        {/* Info box */}
        <div className="mt-8 bg-white rounded-xl border border-navy/10 p-5">
          <h2 className="text-sm font-semibold text-navy mb-3">
            {tab === 'polyhedron' ? '다면체 단면 — 알아두기' : '회전체 단면 — 알아두기'}
          </h2>
          {tab === 'polyhedron' ? (
            <ul className="text-sm text-muted space-y-1.5 list-disc list-inside break-keep">
              <li>정육면체를 수평으로 자르면 <strong className="text-navy">정사각형</strong></li>
              <li>꼭짓점을 지나도록 자르면 <strong className="text-navy">삼각형</strong>이 나타납니다</li>
              <li>정팔면체의 중간을 수평으로 자르면 <strong className="text-navy">정사각형</strong></li>
              <li>슬라이더를 천천히 움직이며 단면 변화를 관찰하세요</li>
            </ul>
          ) : (
            <ul className="text-sm text-muted space-y-1.5 list-disc list-inside break-keep">
              <li>원기둥을 수평으로 자르면 <strong className="text-navy">원</strong></li>
              <li>원기둥을 수직으로 자르면 <strong className="text-navy">직사각형</strong></li>
              <li>원뿔을 수평으로 자르면 <strong className="text-navy">원</strong>, 꼭짓점을 지나면 <strong className="text-navy">점</strong></li>
              <li>구를 어느 방향으로 잘라도 단면은 <strong className="text-navy">원</strong></li>
            </ul>
          )}
        </div>
      </main>

      <footer className="border-t border-navy/10 py-6">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="text-muted text-xs">© 2026 트이다 수학학원 · Teuida Studio</span>
        </div>
      </footer>
    </div>
  );
}
