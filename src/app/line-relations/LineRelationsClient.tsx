'use client';

import Link from 'next/link';
import { Suspense, lazy } from 'react';

const LineRelationsExplorer = lazy(() => import('./LineRelationsExplorer'));

function LoadingViewer() {
  return (
    <div className="w-full aspect-square md:aspect-auto md:h-[440px] bg-white rounded-2xl border border-navy/10 flex items-center justify-center">
      <div className="text-muted text-sm">3D 뷰어 로딩 중…</div>
    </div>
  );
}

export default function LineRelationsClient() {
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
          <span className="text-white/80 text-sm font-medium">직선의 위치 관계 탐구기</span>
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
          <h1 className="text-2xl font-bold text-navy mb-2">직선의 위치 관계 탐구기</h1>
          <p className="text-muted text-sm break-keep">
            정육면체의 모서리(직선) 두 개를 선택하면 두 직선의 위치 관계를 자동으로 판별합니다.
          </p>
        </div>

        <div className="bg-paper rounded-2xl">
          <Suspense fallback={<LoadingViewer />}>
            <LineRelationsExplorer />
          </Suspense>
        </div>

        {/* Info box */}
        <div className="mt-8 bg-white rounded-xl border border-navy/10 p-5">
          <h2 className="text-sm font-semibold text-navy mb-3">공간에서 두 직선의 위치 관계</h2>
          <ul className="text-sm text-muted space-y-2 list-disc list-inside break-keep">
            <li>
              <strong className="text-navy">한 점에서 만난다</strong> —
              두 직선이 같은 평면 위에 있고 교점이 존재합니다.
            </li>
            <li>
              <strong className="text-navy">평행</strong> —
              두 직선의 방향이 같고 아무리 연장해도 만나지 않습니다. 같은 평면 위에 있습니다.
            </li>
            <li>
              <strong className="text-navy">꼬인 위치</strong> —
              평행하지도 않고 만나지도 않습니다. 어떤 하나의 평면 위에 동시에 놓이지 않습니다.
            </li>
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
