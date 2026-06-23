'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* ─── Cube geometry (half-size = 1) ─────────────────────────────────── */

const S = 1;

const CUBE_VERTS: THREE.Vector3[] = (() => {
  const pts: THREE.Vector3[] = [];
  for (const x of [-S, S]) for (const y of [-S, S]) for (const z of [-S, S])
    pts.push(new THREE.Vector3(x, y, z));
  return pts;
})();

// 12 edges: pairs of vertices at distance 2
const CUBE_EDGES: [number, number][] = (() => {
  const edges: [number, number][] = [];
  for (let i = 0; i < CUBE_VERTS.length; i++)
    for (let j = i + 1; j < CUBE_VERTS.length; j++)
      if (Math.abs(CUBE_VERTS[i].distanceTo(CUBE_VERTS[j]) - 2) < 0.01)
        edges.push([i, j]);
  return edges;
})();

// 12 edge midpoints
const EDGE_MIDS: THREE.Vector3[] = CUBE_EDGES.map(([i, j]) =>
  CUBE_VERTS[i].clone().add(CUBE_VERTS[j]).multiplyScalar(0.5)
);

// indices 0–7 = vertices, 8–19 = edge midpoints
const ALL_PTS: THREE.Vector3[] = [...CUBE_VERTS, ...EDGE_MIDS];

/* ─── Math helpers ───────────────────────────────────────────────────── */

function dedup(pts: THREE.Vector3[], eps = 1e-4): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const p of pts)
    if (!out.some(q => q.distanceTo(p) < eps)) out.push(p);
  return out;
}

function fitPlane(
  selPts: THREE.Vector3[],
): { normal: THREE.Vector3; d: number } | null {
  if (selPts.length < 3) return null;
  const a = selPts[0];

  let bIdx = -1;
  for (let i = 1; i < selPts.length; i++) {
    if (selPts[i].distanceTo(a) > 0.01) { bIdx = i; break; }
  }
  if (bIdx === -1) return null;

  const ab = selPts[bIdx].clone().sub(a);
  let cIdx = -1;
  for (let i = 1; i < selPts.length; i++) {
    if (i === bIdx) continue;
    const cross = new THREE.Vector3().crossVectors(ab, selPts[i].clone().sub(a));
    if (cross.length() > 0.001) { cIdx = i; break; }
  }
  if (cIdx === -1) return null;

  const normal = new THREE.Vector3()
    .crossVectors(selPts[bIdx].clone().sub(a), selPts[cIdx].clone().sub(a))
    .normalize();
  return { normal, d: normal.dot(a) };
}

function planeLocalFrame(normal: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const n = normal.clone().normalize();
  let u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(n.dot(u)) > 0.9) u.set(0, 1, 0);
  u.sub(n.clone().multiplyScalar(n.dot(u))).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  return [u, v];
}

function computeCubeSection(normal: THREE.Vector3, d: number): THREE.Vector3[] {
  const n = normal.clone().normalize();
  const pts: THREE.Vector3[] = [];

  for (const [i, j] of CUBE_EDGES) {
    const a = CUBE_VERTS[i], b = CUBE_VERTS[j];
    const da = n.dot(a) - d, db = n.dot(b) - d;
    const ea = Math.abs(da) < 1e-6, eb = Math.abs(db) < 1e-6;
    if (ea) pts.push(a.clone());
    if (eb) pts.push(b.clone());
    if (!ea && !eb && da * db < 0)
      pts.push(a.clone().lerp(b, da / (da - db)));
  }

  const unique = dedup(pts);
  if (unique.length < 3) return [];

  const centroid = unique
    .reduce((acc, p) => acc.add(p.clone()), new THREE.Vector3())
    .divideScalar(unique.length);
  const [u, v] = planeLocalFrame(n);

  unique.sort((a, b) => {
    const ra = a.clone().sub(centroid), rb = b.clone().sub(centroid);
    return Math.atan2(ra.dot(v), ra.dot(u)) - Math.atan2(rb.dot(v), rb.dot(u));
  });
  return unique;
}

function classifyShape(pts: THREE.Vector3[]): string {
  const n = pts.length;
  if (n < 3) return '';

  if (n === 3) {
    const s = pts.map((p, i) => p.distanceTo(pts[(i + 1) % 3]));
    if (Math.max(...s) - Math.min(...s) < 0.06) return '정삼각형';
    return '삼각형';
  }

  if (n === 4) {
    const s = pts.map((p, i) => p.distanceTo(pts[(i + 1) % 4]));
    const diag = [pts[0].distanceTo(pts[2]), pts[1].distanceTo(pts[3])];
    const eqS = Math.max(...s) - Math.min(...s) < 0.06;
    const eqD = Math.abs(diag[0] - diag[1]) < 0.06;
    const oppEq = Math.abs(s[0] - s[2]) < 0.06 && Math.abs(s[1] - s[3]) < 0.06;
    if (eqS && eqD) return '정사각형';
    if (eqD && oppEq) return '직사각형';
    if (eqS) return '마름모';
    if (oppEq) return '평행사변형';
    return '사다리꼴';
  }

  if (n === 5) return '오각형';

  if (n === 6) {
    const s = pts.map((p, i) => p.distanceTo(pts[(i + 1) % 6]));
    if (Math.max(...s) - Math.min(...s) < 0.06) return '정육각형';
    return '육각형';
  }

  return `${n}각형`;
}

/* ─── Three.js section mesh builder ─────────────────────────────────── */

function buildSectionGroup(pts: THREE.Vector3[]): THREE.Group {
  const group = new THREE.Group();

  // Fan-triangulate (always valid for convex polygons)
  const positions: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    positions.push(...pts[0].toArray(), ...pts[i].toArray(), ...pts[i + 1].toArray());
  }
  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  fillGeo.computeVertexNormals();

  // polygonOffset pushes depth toward camera to beat z-fighting
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xe8650a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.renderOrder = 2;
  group.add(fill);

  // Outline
  const loop = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xe8650a, linewidth: 2 }),
  );
  loop.renderOrder = 3;
  group.add(loop);

  return group;
}

/* ─── 2D SVG preview ─────────────────────────────────────────────────── */

function SectionSVG({ pts }: { pts: THREE.Vector3[] }) {
  if (pts.length < 3) return null;

  const centroid = pts
    .reduce((acc, p) => acc.add(p.clone()), new THREE.Vector3())
    .divideScalar(pts.length);

  // Reconstruct normal from polygon edges
  let normal = new THREE.Vector3();
  const ab = pts[1].clone().sub(pts[0]);
  for (let i = 2; i < pts.length; i++) {
    normal = new THREE.Vector3().crossVectors(ab, pts[i].clone().sub(pts[0]));
    if (normal.length() > 0.001) break;
  }
  normal.normalize();

  const [u, v] = planeLocalFrame(normal);

  const pts2D = pts.map(p => {
    const r = p.clone().sub(centroid);
    return [r.dot(u), r.dot(v)] as [number, number];
  });

  const xs = pts2D.map(p => p[0]);
  const ys = pts2D.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const range = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;

  const SIZE = 120, PAD = 18;
  const scale = (SIZE - 2 * PAD) / range;
  const toSVG = ([x, y]: [number, number]) => ({
    x: SIZE / 2 + (x - cx) * scale,
    y: SIZE / 2 - (y - cy) * scale,
  });

  const svgPts = pts2D.map(toSVG);
  const polyStr = svgPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="overflow-visible">
      <polygon
        points={polyStr}
        fill="#E8650A"
        fillOpacity={0.18}
        stroke="#E8650A"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {svgPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#E8650A" />
      ))}
    </svg>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

export default function PolyhedronExplorer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [sectionPts, setSectionPts] = useState<THREE.Vector3[]>([]);
  const [shapeName, setShapeName] = useState('');
  const [collinear, setCollinear] = useState(false);

  // Three.js objects (imperative)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const spheresRef = useRef<THREE.Mesh[]>([]);
  const sectionGrpRef = useRef<THREE.Group | null>(null);
  const frameIdRef = useRef(0);

  // Mirror selected into a ref so event handlers see current value
  const selectedRef = useRef<number[]>([]);

  /* ── Scene setup (runs once) ── */
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 100);
    camera.position.set(2.8, 2.2, 3.8);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(4, 6, 4);
    scene.add(dir);

    // Grid
    const grid = new THREE.GridHelper(5, 10, 0x8b97ac, 0x8b97ac);
    (grid.material as THREE.Material).opacity = 0.15;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Cube: transparent faces + edges
    const boxGeo = new THREE.BoxGeometry(2, 2, 2);
    scene.add(
      new THREE.Mesh(
        boxGeo,
        new THREE.MeshPhongMaterial({ color: 0x1b2a4a, transparent: true, opacity: 0.07 }),
      ),
    );
    scene.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({ color: 0x1b2a4a }),
      ),
    );

    // Selectable point spheres
    const spheres: THREE.Mesh[] = [];
    ALL_PTS.forEach((pt, i) => {
      const isVertex = i < 8;
      const geo = new THREE.SphereGeometry(isVertex ? 0.1 : 0.075, 16, 16);
      const mat = new THREE.MeshPhongMaterial({
        color: isVertex ? 0xf2b544 : 0x8b97ac,
        emissive: 0x000000,
        shininess: 80,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pt);
      mesh.userData.idx = i;
      scene.add(mesh);
      spheres.push(mesh);
    });
    spheresRef.current = spheres;

    // Animate
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // Click detection: distinguish drag from click
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downAt = { x: 0, y: 0 };
    let dragged = false;

    const onPointerDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
      dragged = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - downAt.x, dy = e.clientY - downAt.y;
      if (dx * dx + dy * dy > 16) dragged = true;

      // Cursor hint
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(spheres);
      renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'default';
    };
    const onPointerUp = (e: PointerEvent) => {
      if (dragged) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(spheres);
      if (hits.length === 0) return;
      const idx = hits[0].object.userData.idx as number;
      setSelected(prev => {
        const next = prev.includes(idx)
          ? prev.filter(i => i !== idx)
          : [...prev, idx];
        selectedRef.current = next;
        return next;
      });
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    return () => {
      cancelAnimationFrame(frameIdRef.current);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  /* ── Update scene when selection changes ── */
  useEffect(() => {
    selectedRef.current = selected;
    const scene = sceneRef.current;
    if (!scene) return;

    // Update sphere appearance
    spheresRef.current.forEach((mesh, i) => {
      const mat = mesh.material as THREE.MeshPhongMaterial;
      const isVertex = i < 8;
      if (selected.includes(i)) {
        mat.color.set(0xe8650a);
        mat.emissive.set(0x3a1500);
        mesh.scale.setScalar(1.45);
      } else {
        mat.color.set(isVertex ? 0xf2b544 : 0x8b97ac);
        mat.emissive.set(0x000000);
        mesh.scale.setScalar(1.0);
      }
    });

    // Remove previous section
    if (sectionGrpRef.current) {
      scene.remove(sectionGrpRef.current);
      sectionGrpRef.current = null;
    }

    if (selected.length < 3) {
      setSectionPts([]);
      setShapeName('');
      setCollinear(false);
      return;
    }

    const pts = selected.map(i => ALL_PTS[i]);
    const plane = fitPlane(pts);

    if (!plane) {
      setCollinear(true);
      setSectionPts([]);
      setShapeName('');
      return;
    }
    setCollinear(false);

    const section = computeCubeSection(plane.normal, plane.d);
    setSectionPts(section);
    setShapeName(classifyShape(section));

    if (section.length >= 3) {
      const grp = buildSectionGroup(section);
      scene.add(grp);
      sectionGrpRef.current = grp;
    }
  }, [selected]);

  const handleReset = () => setSelected([]);

  return (
    <div className="flex flex-col gap-4">
      {/* Viewport + 2D preview side by side */}
      <div className="flex gap-4 items-stretch">
        <div
          ref={mountRef}
          className="flex-1 min-w-0 bg-white rounded-2xl border border-navy/10 overflow-hidden"
          style={{ height: 420 }}
        />

        {/* 2D preview panel */}
        <div className="w-44 flex-shrink-0 bg-white rounded-2xl border border-navy/10 p-4 flex flex-col items-center justify-center gap-2">
          <p className="text-xs font-semibold text-navy self-start">단면 미리보기</p>
          {sectionPts.length >= 3 ? (
            <>
              <div className="flex-1 flex items-center justify-center">
                <SectionSVG pts={sectionPts} />
              </div>
              <p className="text-sm font-bold text-orange">{shapeName}</p>
              <p className="text-xs text-muted">{sectionPts.length}각형</p>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 pb-2">
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-navy/15 flex items-center justify-center text-2xl text-navy/15">
                ✂
              </div>
              <p className="text-xs text-muted leading-relaxed">
                점 3개 이상<br />선택하면<br />단면이 표시됩니다
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleReset}
          className="px-4 py-1.5 rounded-full text-sm font-medium bg-white border border-navy/20 text-navy hover:border-navy/50 transition-colors"
        >
          선택 초기화
        </button>
        {selected.length > 0 && (
          <span className="text-xs text-muted">
            {selected.length}개 선택됨
            {collinear && (
              <span className="text-orange ml-1">— 선택한 점이 모두 일직선입니다</span>
            )}
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-5 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-gold" />
          꼭짓점 (8개)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-muted" />
          모서리 중점 (12개)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange" />
          선택됨
        </span>
      </div>

      <p className="text-xs text-muted leading-relaxed">
        점을 클릭해 선택하세요. 3개 이상 선택하면 그 점들을 지나는 평면으로 단면을 자릅니다.
        드래그로 도형을 회전하고, 스크롤로 확대·축소할 수 있습니다.
      </p>
    </div>
  );
}
