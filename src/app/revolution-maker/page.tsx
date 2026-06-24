import type { Metadata } from 'next';
import RevolutionMakerClient from './RevolutionMakerClient';

export const metadata: Metadata = {
  title: '회전체 생성기 — 트이다 스튜디오',
  description: '평면도형을 2D에서 배치하고 회전 각도를 조절하면 3D 회전체가 실시간으로 만들어지는 탐구 도구',
};

export default function RevolutionMakerPage() {
  return <RevolutionMakerClient />;
}
