'use client';

import Link from 'next/link';
import { Suspense, lazy } from 'react';

const RevolutionMakerExplorer = lazy(() => import('./RevolutionMakerExplorer'));

function LoadingViewer() {
  return (
    <div className="w-full h-[500px] bg-white rounded-2xl border border-navy/10 flex items-center justify-center">
      <div className="text-muted text-sm">로딩 중…</div>
    </div>
  );
}

export default function RevolutionMakerClient() {
  return (
    <div className="flex flex-col min-h-screen bg-paper">
      <header className="border-b border-navy/10 bg-navy">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-5 flex items-center gap-3">
          <Link
            href="/"
            className="text-orange font-bold text-xl tracking-tight hover:text-orange/80 transition-colors"
          >
            트이다
          </Link>
          <span className="text-white/40 text-xl">|</span>
          <span className="text-white/80 text-sm font-medium">회전체 생성기</span>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10 w-full">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-muted text-xs hover:text-navy transition-colors mb-4"
          >
            ← 도구 목록으로
          </Link>
          <h1 className="text-2xl font-bold text-navy mb-2">회전체 생성기</h1>
          <p className="text-muted text-sm break-keep">
            평면도형을 회전축에 붙이거나 띄우고 슬라이더로 회전 각도를 조절하면 3D 회전체가 실시간으로 만들어집니다.
          </p>
        </div>

        <div className="bg-paper rounded-2xl">
          <Suspense fallback={<LoadingViewer />}>
            <RevolutionMakerExplorer />
          </Suspense>
        </div>

        <div className="mt-8 bg-white rounded-xl border border-navy/10 p-5">
          <h2 className="text-sm font-semibold text-navy mb-3">회전체 — 알아두기</h2>
          <ul className="text-sm text-muted space-y-1.5 list-disc list-inside break-keep">
            <li>직사각형 → <strong className="text-navy">원기둥</strong></li>
            <li>직각삼각형 (꼭짓점 위/아래) → <strong className="text-navy">원뿔</strong></li>
            <li>직각삼각형 (이중 원뿔형) → <strong className="text-navy">이중 원뿔</strong></li>
            <li>이등변삼각형 → <strong className="text-navy">이중 원뿔</strong></li>
            <li>반원 → <strong className="text-navy">구</strong></li>
            <li>원 → <strong className="text-navy">구 / 토러스</strong></li>
            <li>사다리꼴 (넓은/좁은 변 아래) → <strong className="text-navy">원뿔대</strong></li>
            <li>오각형 → <strong className="text-navy">모래시계</strong></li>
            <li>도형을 회전축에서 띄우면 <strong className="text-navy">중공(hollow)</strong> 회전체가 됩니다</li>
          </ul>
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
