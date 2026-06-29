import type { Metadata } from 'next';
import PolyhedraClient from './PolyhedraClient';

export const metadata: Metadata = {
  title: '정다면체 탐구기 — 트이다 스튜디오',
  description: '5개 정다면체를 3D로 탐구하고 꼭짓점·모서리·면을 시각화하며 오일러 공식을 확인하는 인터랙티브 도구',
};

export default function PolyhedraPage() {
  return <PolyhedraClient />;
}
