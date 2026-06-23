import type { Metadata } from 'next';
import LineRelationsClient from './LineRelationsClient';

export const metadata: Metadata = {
  title: '직선의 위치 관계 탐구기 — 트이다 스튜디오',
  description: '정육면체 모서리 두 개를 선택해 공간에서 두 직선의 위치 관계(만난다/평행/꼬인 위치)를 탐구하는 인터랙티브 도구',
};

export default function LineRelationsPage() {
  return <LineRelationsClient />;
}
