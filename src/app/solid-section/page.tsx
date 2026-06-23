import type { Metadata } from 'next';
import SolidSectionClient from './SolidSectionClient';

export const metadata: Metadata = {
  title: '입체도형 단면 탐구기 — 트이다 스튜디오',
  description: '다면체와 회전체를 직접 잘라 단면을 탐구하는 인터랙티브 도구',
};

export default function SolidSectionPage() {
  return <SolidSectionClient />;
}
