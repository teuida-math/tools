'use client';

import Link from 'next/link';
import { Suspense, lazy } from 'react';
import SiteHeader from '@/components/SiteHeader';

const PolyhedraExplorer = lazy(() => import('./PolyhedraExplorer'));

function LoadingViewer() {
  return (
    <div className="w-full aspect-square md:aspect-auto md:h-[480px] bg-white rounded-2xl border border-navy/10 flex items-center justify-center">
      <div className="text-muted text-sm">3D 뷰어 로딩 중…</div>
    </div>
  );
}

export default function PolyhedraClient() {
  return (
    <div className="flex flex-col min-h-screen bg-paper">
      <SiteHeader title="정다면체 탐구기" />

      <main className="flex-1 max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10 w-full">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-muted text-xs hover:text-navy transition-colors mb-4"
          >
            ← 도구 목록으로
          </Link>
          <h1 className="text-2xl font-bold text-navy mb-2">정다면체 탐구기</h1>
          <p className="text-muted text-sm break-keep">
            5가지 정다면체를 3D로 탐구하고 꼭짓점·모서리·면을 시각화하며 오일러 공식을 확인하세요.
          </p>
        </div>

        <div className="bg-paper rounded-2xl">
          <Suspense fallback={<LoadingViewer />}>
            <PolyhedraExplorer />
          </Suspense>
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
