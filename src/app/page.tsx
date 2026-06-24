import type { ComponentType } from "react";
import Link from "next/link";
import { Box, X, Orbit, type LucideIcon } from "lucide-react";
import RelationMiniIcon from "./line-relations/RelationMiniIcon";

interface Tool {
  href: string;
  icon: LucideIcon;
  customIcon?: ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  tags: string[];
}

const tools: Tool[] = [
  {
    href: "/solid-section",
    icon: Box,
    title: "입체도형 단면 탐구기",
    desc: "다면체와 회전체를 잘라 단면을 눈으로 확인하는 인터랙티브 탐구기",
    tags: ["3D", "단면", "다면체", "회전체"],
  },
  {
    href: "/line-relations",
    icon: X,
    customIcon: RelationMiniIcon,
    title: "직선 위치 관계 탐구기",
    desc: "공간에서 두 직선의 위치 관계를 눈으로 확인하는 인터랙티브 탐구기",
    tags: ["3D", "직선", "위치 관계", "공간도형"],
  },
  {
    href: "/revolution-maker",
    icon: Orbit,
    title: "회전체 생성기",
    desc: "평면도형을 회전축에 붙이고 슬라이더로 각도를 조절해 3D 회전체를 실시간으로 만드는 탐구 도구",
    tags: ["3D", "회전체", "원기둥", "원뿔", "구"],
  },
];

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-navy/15 bg-paper">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-3">
          <span className="text-orange font-bold text-xl tracking-tight">트이다</span>
          <span className="text-navy/20 text-xl">|</span>
          <span className="text-muted text-sm font-medium">수학 학습 도구</span>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-navy text-white">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <p className="text-gold text-sm font-semibold tracking-widest uppercase mb-3">
            Teuida Studio
          </p>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            수학, 눈으로 탐구하다
          </h1>
          <p className="text-white/60 text-lg max-w-xl break-keep">
            트이다 수학학원이 만드는 인터랙티브 수학 학습 도구 모음입니다.
            개념을 직접 조작하며 깊이 있게 이해하세요.
          </p>
        </div>
      </section>

      {/* Tools grid */}
      <main className="flex-1 max-w-5xl mx-auto px-6 py-14 w-full">
        <h2 className="text-xs font-semibold tracking-widest text-muted uppercase mb-6">
          도구 목록
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group block bg-white rounded-2xl border border-navy/8 p-6 shadow-sm hover:shadow-md hover:border-orange/40 transition-all duration-200"
            >
              {tool.customIcon
                ? <tool.customIcon className="w-10 h-10 mb-4" />
                : <tool.icon className="w-10 h-10 mb-4 text-navy group-hover:text-orange transition-colors" />
              }
              <h3 className="text-navy font-bold text-lg mb-2 group-hover:text-orange transition-colors">
                {tool.title}
              </h3>
              <p className="text-muted text-sm leading-relaxed mb-4 break-keep">{tool.desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {tool.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-paper text-muted px-2 py-0.5 rounded-full border border-navy/8"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ))}

          {/* Placeholder */}
          <div className="block bg-white/50 rounded-2xl border border-dashed border-navy/15 p-6 flex flex-col items-center justify-center text-center min-h-[180px]">
            <div className="text-3xl mb-3 text-navy/20">+</div>
            <p className="text-muted text-sm">새로운 도구 준비 중</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-navy/10 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="text-muted text-sm">
            © 2026 트이다 수학학원. All rights reserved.
          </span>
          <span className="text-muted text-xs">Teuida Studio</span>
        </div>
      </footer>
    </div>
  );
}
