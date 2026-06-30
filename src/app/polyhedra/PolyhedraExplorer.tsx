'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import PolyhedraNet from './PolyhedraNet';
import PolyhedraDual from './PolyhedraDual';

/* ─── Polyhedra data ──────────────────────────────────────────────────────── */

type PolyType = 'tetra' | 'cube' | 'octa' | 'dodeca' | 'icosa';
type VisMode = 'vertices' | 'edges' | 'faces';
type TabType = 'explore' | 'net' | 'advanced';

const POLY_LIST: { key: PolyType; label: string; korean: string }[] = [
  { key: 'tetra',  label: 'Tetrahedron',   korean: '정사면체' },
  { key: 'cube',   label: 'Hexahedron',    korean: '정육면체' },
  { key: 'octa',   label: 'Octahedron',    korean: '정팔면체' },
  { key: 'dodeca', label: 'Dodecahedron',  korean: '정십이면체' },
  { key: 'icosa',  label: 'Icosahedron',   korean: '정이십면체' },
];

const POLY_EXTRA: Record<PolyType, { interiorAngle: number; dual: string; selfDual: boolean }> = {
  tetra:  { interiorAngle: 60,  dual: '정사면체',   selfDual: true  },
  cube:   { interiorAngle: 90,  dual: '정팔면체',   selfDual: false },
  octa:   { interiorAngle: 60,  dual: '정육면체',   selfDual: false },
  dodeca: { interiorAngle: 108, dual: '정이십면체', selfDual: false },
  icosa:  { interiorAngle: 60,  dual: '정십이면체', selfDual: false },
};

interface PolyData {
  V: number;
  E: number;
  F: number;
  faceShape: string;
  facesPerVertex: number;
  verts: THREE.Vector3[];
  edges: [number, number][];
  faces: number[][];
}

function buildTetrahedron(): PolyData {
  const s = 1.2;
  const verts = [
    new THREE.Vector3( s,  s,  s),
    new THREE.Vector3( s, -s, -s),
    new THREE.Vector3(-s,  s, -s),
    new THREE.Vector3(-s, -s,  s),
  ];
  const edges: [number, number][] = [
    [0,1],[0,2],[0,3],[1,2],[1,3],[2,3],
  ];
  const faces = [[0,1,2],[0,1,3],[0,2,3],[1,2,3]];
  return { V: 4, E: 6, F: 4, faceShape: '정삼각형', facesPerVertex: 3, verts, edges, faces };
}

function buildHexahedron(): PolyData {
  const verts: THREE.Vector3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1])
    verts.push(new THREE.Vector3(x, y, z));
  const edges: [number, number][] = [];
  for (let i = 0; i < verts.length; i++)
    for (let j = i + 1; j < verts.length; j++)
      if (Math.abs(verts[i].distanceTo(verts[j]) - 2) < 0.01)
        edges.push([i, j]);
  const faces = [
    [0,1,3,2],[4,5,7,6],
    [0,1,5,4],[2,3,7,6],
    [0,2,6,4],[1,3,7,5],
  ];
  return { V: 8, E: 12, F: 6, faceShape: '정사각형', facesPerVertex: 3, verts, edges, faces };
}

function buildOctahedron(): PolyData {
  const r = 1.4;
  const verts = [
    new THREE.Vector3( r,  0,  0),
    new THREE.Vector3(-r,  0,  0),
    new THREE.Vector3( 0,  r,  0),
    new THREE.Vector3( 0, -r,  0),
    new THREE.Vector3( 0,  0,  r),
    new THREE.Vector3( 0,  0, -r),
  ];
  const edges: [number, number][] = [
    [0,2],[0,3],[0,4],[0,5],
    [1,2],[1,3],[1,4],[1,5],
    [2,4],[2,5],[3,4],[3,5],
  ];
  const faces = [
    [0,2,4],[0,4,3],[0,3,5],[0,5,2],
    [1,4,2],[1,3,4],[1,5,3],[1,2,5],
  ];
  return { V: 6, E: 12, F: 8, faceShape: '정삼각형', facesPerVertex: 4, verts, edges, faces };
}

function buildDodecahedron(): PolyData {
  // EdgesGeometry filters coplanar triangle edges — only 30 real pentagon boundary edges survive
  const baseGeo = new THREE.DodecahedronGeometry(1.3);
  const edgesGeo = new THREE.EdgesGeometry(baseGeo);
  baseGeo.dispose();

  const posAttr = edgesGeo.getAttribute('position');
  const seen = new Map<string, number>();
  const verts: THREE.Vector3[] = [];
  const rawIndices: number[] = [];

  for (let i = 0; i < posAttr.count; i++) {
    const x = Math.round(posAttr.getX(i) * 1000) / 1000;
    const y = Math.round(posAttr.getY(i) * 1000) / 1000;
    const z = Math.round(posAttr.getZ(i) * 1000) / 1000;
    const key = `${x},${y},${z}`;
    if (!seen.has(key)) { seen.set(key, verts.length); verts.push(new THREE.Vector3(x, y, z)); }
    rawIndices.push(seen.get(key)!);
  }

  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  for (let i = 0; i < rawIndices.length; i += 2) {
    const lo = Math.min(rawIndices[i], rawIndices[i + 1]);
    const hi = Math.max(rawIndices[i], rawIndices[i + 1]);
    const key = `${lo}-${hi}`;
    if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([lo, hi]); }
  }

  edgesGeo.dispose();
  return { V: 20, E: 30, F: 12, faceShape: '정오각형', facesPerVertex: 3, verts, edges, faces: [] };
}

function buildIcosahedron(): PolyData {
  const geo = new THREE.IcosahedronGeometry(1.3);
  const posAttr = geo.getAttribute('position');
  const seen = new Map<string, number>();
  const verts: THREE.Vector3[] = [];
  for (let i = 0; i < posAttr.count; i++) {
    const x = Math.round(posAttr.getX(i) * 1000) / 1000;
    const y = Math.round(posAttr.getY(i) * 1000) / 1000;
    const z = Math.round(posAttr.getZ(i) * 1000) / 1000;
    const key = `${x},${y},${z}`;
    if (!seen.has(key)) { seen.set(key, verts.length); verts.push(new THREE.Vector3(x, y, z)); }
  }

  let minEdge = Infinity;
  for (let i = 0; i < verts.length; i++)
    for (let j = i + 1; j < verts.length; j++) {
      const d = verts[i].distanceTo(verts[j]);
      if (d > 0.01 && d < minEdge) minEdge = d;
    }

  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      const d = verts[i].distanceTo(verts[j]);
      if (Math.abs(d - minEdge) < minEdge * 0.1) {
        const key = `${i}-${j}`;
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([i, j]); }
      }
    }
  }

  const faces: number[][] = [];
  for (let i = 0; i < verts.length; i++)
    for (let j = i + 1; j < verts.length; j++)
      for (let k = j + 1; k < verts.length; k++) {
        const ij = edgeSet.has(`${i}-${j}`);
        const jk = edgeSet.has(`${j}-${k}`);
        const ik = edgeSet.has(`${i}-${k}`);
        if (ij && jk && ik) faces.push([i, j, k]);
      }

  geo.dispose();
  return { V: 12, E: 30, F: 20, faceShape: '정삼각형', facesPerVertex: 5, verts, edges, faces };
}

function getPolyData(key: PolyType): PolyData {
  if (key === 'tetra')  return buildTetrahedron();
  if (key === 'cube')   return buildHexahedron();
  if (key === 'octa')   return buildOctahedron();
  if (key === 'dodeca') return buildDodecahedron();
  return buildIcosahedron();
}

/* ─── Three.js helpers ───────────────────────────────────────────────────── */

function makeEdgeCylinder(v0: THREE.Vector3, v1: THREE.Vector3, radius: number, color: number): THREE.Mesh {
  const dir = v1.clone().sub(v0);
  const len = dir.length();
  const mid = v0.clone().add(v1).multiplyScalar(0.5);
  const geo = new THREE.CylinderGeometry(radius, radius, len, 8, 1);
  const mat = new THREE.MeshPhongMaterial({ color, shininess: 60, transparent: true, opacity: 0.6 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(mid);
  const axis = new THREE.Vector3(0, 1, 0);
  const dirNorm = dir.clone().normalize();
  const q = new THREE.Quaternion();
  if (dirNorm.dot(axis) < -0.9999) {
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  } else {
    q.setFromUnitVectors(axis, dirNorm);
  }
  mesh.quaternion.copy(q);
  return mesh;
}

function makeLabel(text: string, pos: THREE.Vector3, fontSize = 36, scale = 0.32): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 80, 80);
  ctx.fillStyle = '#1B2A4A';
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 40, 40);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(scale, scale, 1);
  sprite.position.copy(pos).multiplyScalar(1.28);
  sprite.renderOrder = 10;
  return sprite;
}

function buildFaceMeshFromGeometry(key: PolyType): THREE.Mesh {
  const mat = new THREE.MeshPhongMaterial({ color: 0xf4f2ee, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
  if (key === 'tetra') {
    const geo = new THREE.TetrahedronGeometry(1.2 * Math.sqrt(3));
    return new THREE.Mesh(geo, mat);
  }
  if (key === 'cube') return new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
  if (key === 'octa') return new THREE.Mesh(new THREE.OctahedronGeometry(1.4), mat);
  if (key === 'dodeca') return new THREE.Mesh(new THREE.DodecahedronGeometry(1.3), mat);
  return new THREE.Mesh(new THREE.IcosahedronGeometry(1.3), mat);
}

function buildFaceMeshHighlight(key: PolyType): THREE.Mesh {
  const mat = new THREE.MeshPhongMaterial({ color: 0xf4f2ee, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
  if (key === 'tetra') return new THREE.Mesh(new THREE.TetrahedronGeometry(1.2 * Math.sqrt(3)), mat);
  if (key === 'cube') return new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
  if (key === 'octa') return new THREE.Mesh(new THREE.OctahedronGeometry(1.4), mat);
  if (key === 'dodeca') return new THREE.Mesh(new THREE.DodecahedronGeometry(1.3), mat);
  return new THREE.Mesh(new THREE.IcosahedronGeometry(1.3), mat);
}

/* ─── Component ──────────────────────────────────────────────────────────── */

const VERTEX_LABELS = 'ABCDEFGHIJKLMNOPQRST'.split('');

const TAB_LIST: { key: TabType; label: string }[] = [
  { key: 'explore',  label: '탐구' },
  { key: 'net',      label: '전개도' },
  { key: 'advanced', label: '심화' },
];

export default function PolyhedraExplorer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [poly, setPoly]           = useState<PolyType>('tetra');
  const [visMode, setVisMode]     = useState<VisMode>('edges');
  const [activeTab, setActiveTab] = useState<TabType>('explore');

  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef  = useRef<OrbitControls | null>(null);
  const frameIdRef   = useRef(0);
  const autoRotRef   = useRef(true);
  const activeTabRef = useRef<TabType>('explore');
  activeTabRef.current = activeTab;

  /* ── Scene setup ── */
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const isMobile = window.innerWidth < 768;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);

    // el may be hidden (parent has 'hidden' class) when poly/visMode changes on another tab
    const rect = el.getBoundingClientRect();
    const initW = el.clientWidth  || rect.width  || 400;
    const initH = el.clientHeight || rect.height || 480;
    renderer.setSize(initW, initH);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = activeTabRef.current !== 'explore' ? 'none' : '';
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, initW / initH, 0.1, 100);
    camera.position.set(3.2, 2.4, 4.0);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 2;
    controls.maxDistance = 10;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(4, 6, 4);
    scene.add(dirLight);

    const grid = new THREE.GridHelper(6, 10, 0x8b97ac, 0x8b97ac);
    (grid.material as THREE.Material).opacity = 0.12;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const data = getPolyData(poly);
    buildScene(scene, poly, data, visMode, isMobile);

    let autoRotating = true;
    autoRotRef.current = true;

    const onInteractionStart = () => {
      autoRotating = false;
      autoRotRef.current = false;
    };
    renderer.domElement.addEventListener('pointerdown', onInteractionStart);

    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      if (autoRotating) {
        scene.rotation.y += 0.004;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);

    let lastDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        lastDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const delta = lastDist - dist;
        camera.position.multiplyScalar(1 + delta * 0.005);
        lastDist = dist;
      }
    };
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: true });

    return () => {
      cancelAnimationFrame(frameIdRef.current);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onInteractionStart);
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      renderer.domElement.removeEventListener('touchmove', onTouchMove);
      controls.dispose();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poly, visMode]);

  // Sync Three.js canvas visibility with active tab
  useEffect(() => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return;
    canvas.style.display = activeTab !== 'explore' ? 'none' : '';
    if (activeTab === 'explore') {
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const el = mountRef.current;
      if (renderer && camera && el && el.clientWidth && el.clientHeight) {
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight);
      }
    }
  }, [activeTab]);

  const data = getPolyData(poly);
  const polyInfo  = POLY_LIST.find(p => p.key === poly)!;
  const polyExtra = POLY_EXTRA[poly];

  return (
    <div className="flex flex-col gap-4">
      {/* Polyhedron selector */}
      <div className="grid grid-cols-5 gap-1 bg-white border border-navy/10 rounded-xl p-1 w-full">
        {POLY_LIST.map(({ key, korean }) => (
          <button
            key={key}
            onClick={() => setPoly(key)}
            className={`text-center px-1 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              poly === key
                ? 'bg-navy text-white shadow-sm'
                : 'text-muted hover:text-navy'
            }`}
          >
            {korean}
          </button>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-white border border-navy/10 rounded-xl p-1">
        {TAB_LIST.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 text-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-navy text-white shadow-sm'
                : 'text-muted hover:text-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── 탐구 tab — always in DOM to keep Three.js renderer alive ─── */}
      <div className={`flex flex-col gap-4${activeTab !== 'explore' ? ' hidden' : ''}`}>
      <div className="flex flex-col md:flex-row gap-4 md:items-stretch">
        <div
          ref={mountRef}
          className="relative w-full md:flex-1 md:min-w-0 aspect-square md:aspect-auto md:h-[480px] bg-white rounded-2xl border border-navy/10 overflow-hidden touch-none"
        />

        <div className="w-full md:w-64 md:flex-shrink-0 bg-white rounded-2xl border border-navy/10 p-5 flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold text-navy uppercase tracking-widest mb-1">{polyInfo.korean}</p>
            <p className="text-xs text-muted">{polyInfo.label}</p>
          </div>

          {/* V, E, F */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'V', value: data.V, desc: '꼭짓점' },
              { label: 'E', value: data.E, desc: '모서리' },
              { label: 'F', value: data.F, desc: '면' },
            ].map(({ label, value, desc }) => (
              <div key={label} className="flex flex-col items-center justify-center bg-paper rounded-xl py-3 gap-0.5">
                <span className="text-2xl font-bold text-navy">{value}</span>
                <span className="text-xs text-orange font-semibold">{label}</span>
                <span className="text-[10px] text-muted">{desc}</span>
              </div>
            ))}
          </div>

          {/* Euler formula */}
          <div className="bg-navy/5 rounded-xl p-3 text-center">
            <p className="text-xs text-muted mb-1">오일러 공식</p>
            <p className="text-sm font-bold text-navy">
              {data.V} − {data.E} + {data.F} = <span className="text-orange">{data.V - data.E + data.F}</span>
            </p>
            <p className="text-xs text-muted mt-1">V − E + F = 2 ✓</p>
          </div>

          {/* Extra info */}
          <div className="flex flex-col gap-2 text-xs text-muted">
            <div className="flex justify-between">
              <span>면의 모양</span>
              <span className="text-navy font-medium">{data.faceShape}</span>
            </div>
            <div className="flex justify-between">
              <span>꼭짓점당 면 수</span>
              <span className="text-navy font-medium">{data.facesPerVertex}개</span>
            </div>
          </div>

          {/* Vis mode */}
          <div>
            <p className="text-xs font-semibold text-navy uppercase tracking-widest mb-2">시각화</p>
            <div className="flex flex-col gap-1">
              {([
                { key: 'vertices', label: '꼭짓점 강조' },
                { key: 'edges',    label: '모서리 강조' },
                { key: 'faces',    label: '면 강조' },
              ] as { key: VisMode; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setVisMode(key)}
                  className={`text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    visMode === key
                      ? 'bg-orange/10 text-orange border border-orange/30'
                      : 'text-muted hover:text-navy border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="border-t border-navy/10 pt-2 flex flex-col gap-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#f2b544]" />
                꼭짓점 ({data.V}개)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-1.5 rounded bg-navy" />
                모서리 ({data.E}개)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-1.5 rounded bg-orange" />
                면 ({data.F}개)
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed break-keep">
              드래그로 회전, 스크롤/핀치로 확대·축소. 자동 회전 중일 때 드래그하면 수동 조작으로 전환됩니다.
            </p>
          </div>
        </div>
      </div>

        <div className="bg-white rounded-xl border border-navy/10 p-5">
          <h2 className="text-sm font-semibold text-navy mb-3">정다면체란?</h2>
          <ul className="text-sm text-muted space-y-2 list-disc list-inside break-keep">
            <li>
              <strong className="text-navy">정다면체(Platonic solid)</strong> —
              모든 면이 합동인 정다각형이고, 각 꼭짓점에 모이는 면의 수가 같은 볼록 다면체입니다.
            </li>
            <li>
              <strong className="text-navy">오일러 공식</strong> —
              모든 볼록 다면체에서 꼭짓점(V), 모서리(E), 면(F)의 수 사이에 V − E + F = 2가 성립합니다.
            </li>
            <li>
              <strong className="text-navy">5종류만 존재</strong> —
              정사면체, 정육면체, 정팔면체, 정십이면체, 정이십면체. 수학적으로 이 다섯 가지뿐입니다.
            </li>
          </ul>
        </div>
      </div>

      {/* ─── 전개도 tab ─── */}
      {activeTab === 'net' && (
        <div className="flex flex-col md:flex-row gap-4 md:items-stretch">
          <div className="relative w-full md:flex-1 md:min-w-0 aspect-square md:aspect-auto md:h-[480px] bg-paper rounded-2xl border border-navy/10 overflow-hidden">
            <div className="absolute inset-0">
              {poly === 'cube' ? (
                <PolyhedraNet />
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-2">
                  <p className="text-sm font-medium text-navy">준비 중</p>
                  <p className="text-xs text-muted">현재 정육면체 전개도만 지원됩니다</p>
                </div>
              )}
            </div>
          </div>

          <div className="w-full md:w-64 md:flex-shrink-0 bg-white rounded-2xl border border-navy/10 p-5 flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold text-navy uppercase tracking-widest mb-1">{polyInfo.korean}</p>
              <p className="text-xs text-muted">전개도 · 내각 · 다면체 조건</p>
            </div>

            {/* 내각 */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-navy uppercase tracking-widest">내각</p>
              <div className="bg-paper rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs text-muted">{data.faceShape}</span>
                <span className="text-xl font-bold text-navy">{polyExtra.interiorAngle}°</span>
              </div>
            </div>

            {/* 플라톤의 다면체 */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-navy uppercase tracking-widest">플라톤의 다면체</p>
              <p className="text-[10px] text-muted leading-relaxed break-keep">
                한 꼭짓점에 모이는 면의 내각의 합 &lt; 360°
              </p>
              <div className="bg-paper rounded-xl p-3">
                <p className="text-[10px] text-muted mb-1.5">한 꼭짓점에서</p>
                <p className="text-sm font-bold text-navy">
                  {data.facesPerVertex}개 × {polyExtra.interiorAngle}° ={' '}
                  <span className="text-orange">{data.facesPerVertex * polyExtra.interiorAngle}°</span>
                </p>
                <p className="text-[10px] text-muted mt-1.5">
                  {data.facesPerVertex * polyExtra.interiorAngle}° &lt; 360° ✓
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 심화 tab ─── */}
      {activeTab === 'advanced' && (
        <div className="flex flex-col gap-4">
          {/* Dual interactive */}
          {poly === 'cube' ? (
            <PolyhedraDual />
          ) : (
            <div className="bg-white rounded-2xl border border-navy/10 min-h-[480px] flex flex-col items-center justify-center gap-2 text-center p-5">
              <p className="text-sm font-medium text-navy">쌍대 다면체 인터랙티브</p>
              <p className="text-xs text-muted break-keep">현재 도형의 쌍대 다면체를 3D로 비교하는 기능이 준비 중입니다</p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-navy/10 p-5 flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold text-navy uppercase tracking-widest mb-1">쌍대 관계</p>
              <p className="text-[10px] text-muted leading-relaxed break-keep">
                각 면의 중심을 꼭짓점으로 연결하면 나타나는 다면체
              </p>
            </div>

            <div className="bg-paper rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">현재 도형의 쌍대</span>
                <span className="text-sm font-bold text-navy">
                  {polyExtra.dual}{polyExtra.selfDual ? ' (자기 자신)' : ''}
                </span>
              </div>
              <div className="border-t border-navy/10 pt-3 grid grid-cols-3 gap-y-2 text-[10px] text-center">
                <div />
                <div className="text-muted">현재</div>
                <div className="text-muted">쌍대</div>
                <div className="text-left text-muted">꼭짓점 V</div>
                <div className="font-bold text-navy">{data.V}</div>
                <div className="font-bold text-orange">{data.F}</div>
                <div className="text-left text-muted">면 F</div>
                <div className="font-bold text-navy">{data.F}</div>
                <div className="font-bold text-orange">{data.V}</div>
              </div>
            </div>

            {/* All 5 dual pairs */}
            <div className="border-t border-navy/10 pt-4">
              <p className="text-xs font-semibold text-navy mb-3">5가지 정다면체의 쌍대 관계</p>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-muted border-b border-navy/10">
                    <th className="text-left py-1.5 pr-3 font-medium">도형</th>
                    <th className="py-1.5 px-2 font-medium">V</th>
                    <th className="py-1.5 px-2 font-medium">E</th>
                    <th className="py-1.5 px-2 font-medium">F</th>
                    <th className="text-left py-1.5 pl-3 font-medium">쌍대</th>
                  </tr>
                </thead>
                <tbody>
                  {POLY_LIST.map(({ key, korean }) => {
                    const d = getPolyData(key);
                    const extra = POLY_EXTRA[key];
                    const isActive = key === poly;
                    return (
                      <tr key={key} className={`border-b border-navy/5 ${isActive ? 'bg-orange/5' : ''}`}>
                        <td className={`py-2 pr-3 font-medium ${isActive ? 'text-orange' : 'text-navy'}`}>{korean}</td>
                        <td className="py-2 px-2 text-center text-navy">{d.V}</td>
                        <td className="py-2 px-2 text-center text-navy">{d.E}</td>
                        <td className="py-2 px-2 text-center text-navy">{d.F}</td>
                        <td className={`py-2 pl-3 ${isActive ? 'text-orange font-medium' : 'text-muted'}`}>
                          {extra.dual}{extra.selfDual ? ' ✦' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Scene builder ──────────────────────────────────────────────────────── */

function buildScene(
  scene: THREE.Scene,
  key: PolyType,
  data: PolyData,
  visMode: VisMode,
  isMobile: boolean,
) {
  const toRemove: THREE.Object3D[] = [];
  scene.traverse(obj => {
    if (obj instanceof THREE.Light) return;
    if (obj instanceof THREE.GridHelper) return;
    if (obj === scene) return;
    toRemove.push(obj);
  });
  toRemove.forEach(obj => scene.remove(obj));

  const edgeRadius = isMobile ? 0.045 : 0.03;
  const vertRadius = isMobile ? 0.09 : 0.065;

  const faceMesh = visMode === 'faces'
    ? buildFaceMeshHighlight(key)
    : buildFaceMeshFromGeometry(key);
  scene.add(faceMesh);

  const edgeColor = 0x8B97AC;
  data.edges.forEach(([i, j]) => {
    const mesh = makeEdgeCylinder(data.verts[i], data.verts[j], edgeRadius, edgeColor);
    scene.add(mesh);
  });

  const vertColor = 0x1B2A4A;
  const showLabels = data.V <= 20;
  const labelScale = data.V <= 8 ? 0.34 : data.V <= 12 ? 0.28 : 0.22;
  const labelFontSize = data.V <= 8 ? 38 : 32;

  data.verts.forEach((pt, i) => {
    const r = visMode === 'vertices' ? vertRadius * 1.3 : vertRadius;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(r, 14, 14),
      new THREE.MeshPhongMaterial({
        color: vertColor,
        shininess: 90,
      }),
    );
    sphere.position.copy(pt);
    scene.add(sphere);

    if (showLabels) {
      scene.add(makeLabel(VERTEX_LABELS[i], pt, labelFontSize, labelScale));
    }
  });
}
