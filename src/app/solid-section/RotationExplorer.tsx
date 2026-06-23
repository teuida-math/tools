'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/* ─── Types ──────────────────────────────────────────────────────────── */
type SolidKey = 'cylinder' | 'cone' | 'sphere' | 'frustum';
type Triangle = [THREE.Vector3, THREE.Vector3, THREE.Vector3];

interface SectionResult {
  poly: THREE.Vector3[];
  normal: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  center: THREE.Vector3;
  point: THREE.Vector3;
}

/* ─── Module-level helpers (ported directly from HTML) ───────────────── */

function trianglesFromGeo(geo: THREE.BufferGeometry): Triangle[] {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position.array;
  const out: Triangle[] = [];
  for (let i = 0; i < p.length; i += 9) {
    out.push([
      new THREE.Vector3(p[i], p[i + 1], p[i + 2]),
      new THREE.Vector3(p[i + 3], p[i + 4], p[i + 5]),
      new THREE.Vector3(p[i + 6], p[i + 7], p[i + 8]),
    ]);
  }
  return out;
}

function makeRing(r: number, y: number): THREE.Line {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x1b2a4a, transparent: true, opacity: 0.85 }),
  );
}

function makeMeridian(): THREE.Line {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x1b2a4a, transparent: true, opacity: 0.35 }),
  );
}

function planeFromState(tilt: number, pos: number) {
  const a = (tilt * Math.PI) / 180;
  const normal = new THREE.Vector3(Math.sin(a), Math.cos(a), 0).normalize();
  const point = new THREE.Vector3(0, pos, 0);
  return { point, normal };
}

function getSection(tris: Triangle[], tilt: number, pos: number): SectionResult | null {
  const { point, normal } = planeFromState(tilt, pos);
  const sd = (p: THREE.Vector3) => p.clone().sub(point).dot(normal);
  const eps = 1e-5;
  const raw: THREE.Vector3[] = [];

  for (const t of tris) {
    for (let e = 0; e < 3; e++) {
      const A = t[e], B = t[(e + 1) % 3];
      const dA = sd(A), dB = sd(B);
      if ((dA < -eps && dB > eps) || (dA > eps && dB < -eps)) {
        raw.push(A.clone().lerp(B, dA / (dA - dB)));
      }
    }
  }

  const pts: THREE.Vector3[] = [];
  raw.forEach(p => { if (!pts.some(q => q.distanceTo(p) < 2e-3)) pts.push(p); });
  if (pts.length < 3) return null;

  const c = new THREE.Vector3();
  pts.forEach(p => c.add(p));
  c.multiplyScalar(1 / pts.length);

  let u = pts[0].clone().sub(c);
  if (u.length() < 1e-6) u = pts[1].clone().sub(c);
  u.normalize();
  const vv = normal.clone().cross(u).normalize();

  pts.sort(
    (p, q) =>
      Math.atan2(p.clone().sub(c).dot(vv), p.clone().sub(c).dot(u)) -
      Math.atan2(q.clone().sub(c).dot(vv), q.clone().sub(c).dot(u)),
  );

  return { poly: pts, normal, u, v: vv, center: c, point };
}

// ── Analytical section for tilt ≈ 90° (축을 포함) ─────────────────────
// When tilt → 90° the cutting plane normal → (1,0,0), making it nearly
// parallel to the cylinder/cone side faces, so mesh intersection misses them.
// We compute the exact YZ-plane (x = 0) cross-section analytically.
function getAxisSection(solidKey: SolidKey, pos: number): SectionResult {
  const normal = new THREE.Vector3(1, 0, 0);
  const point = new THREE.Vector3(0, pos, 0);
  // Local 2D frame: u = z-axis (horizontal in preview), v = y-axis (vertical)
  const u = new THREE.Vector3(0, 0, 1);
  const v = new THREE.Vector3(0, 1, 0);

  let poly: THREE.Vector3[];
  switch (solidKey) {
    case 'cone':
      poly = [
        new THREE.Vector3(0, -1, -1),
        new THREE.Vector3(0, -1,  1),
        new THREE.Vector3(0,  1,  0),
      ];
      break;
    case 'frustum':
      poly = [
        new THREE.Vector3(0, -1, -1),
        new THREE.Vector3(0, -1,  1),
        new THREE.Vector3(0,  1,  0.5),
        new THREE.Vector3(0,  1, -0.5),
      ];
      break;
    case 'sphere': {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        pts.push(new THREE.Vector3(0, Math.sin(a), Math.cos(a)));
      }
      poly = pts;
      break;
    }
    default: // cylinder
      poly = [
        new THREE.Vector3(0, -1, -1),
        new THREE.Vector3(0, -1,  1),
        new THREE.Vector3(0,  1,  1),
        new THREE.Vector3(0,  1, -1),
      ];
  }

  const center = poly
    .reduce((acc, p) => acc.add(p.clone()), new THREE.Vector3())
    .divideScalar(poly.length);

  return { poly, normal, u, v, center, point };
}

function shapeName(sec: SectionResult | null, solidKey: SolidKey, tilt: number): string {
  if (!sec) return '단면 없음';
  if (solidKey === 'sphere') {
    const d = Math.abs(sec.point.clone().dot(sec.normal));
    return d < 0.06 ? '원 (가장 큰 원)' : '원';
  }
  if (tilt < 12) return '원';
  if (tilt > 78) {
    return ({ cylinder: '직사각형', cone: '이등변삼각형', frustum: '사다리꼴' } as Record<string, string>)[solidKey] ?? '직사각형';
  }
  const capY: Record<string, number[]> = { cylinder: [1, -1], cone: [-1], frustum: [1, -1] };
  const touched = sec.poly.some(p => (capY[solidKey] ?? []).some(cy => Math.abs(p.y - cy) < 0.03));
  return touched ? '비스듬한 단면' : '타원';
}

const SOLID_MAX_SPAN: Record<string, number> = { cylinder: 2, cone: 2, frustum: 2, sphere: 2 };

function drawFlat(canvas: HTMLCanvasElement, sec: SectionResult | null, solidKey: SolidKey) {
  const W = canvas.width, H = canvas.height, pad = 22;
  const fx = canvas.getContext('2d')!;
  fx.clearRect(0, 0, W, H);
  fx.fillStyle = '#f4f2ee';
  fx.fillRect(0, 0, W, H);
  if (!sec) return;

  const p2 = sec.poly.map(p => {
    const d = p.clone().sub(sec.center);
    return { x: d.dot(sec.u), y: d.dot(sec.v) };
  });

  const maxSpan = SOLID_MAX_SPAN[solidKey] ?? 2;
  const s = (Math.min(W, H) - pad * 2) / maxSpan;
  const cx2 = p2.reduce((a, p) => a + p.x, 0) / p2.length;
  const cy2 = p2.reduce((a, p) => a + p.y, 0) / p2.length;
  const ox = W / 2 - cx2 * s;
  const oy = H / 2 + cy2 * s;
  const px = (p: { x: number; y: number }) => ({ x: ox + p.x * s, y: oy - p.y * s });

  // Section fill + outline
  fx.beginPath();
  p2.forEach((p, i) => { const q = px(p); i ? fx.lineTo(q.x, q.y) : fx.moveTo(q.x, q.y); });
  fx.closePath();
  fx.fillStyle = 'rgba(232,101,10,.20)';
  fx.fill();
  fx.strokeStyle = '#E8650A';
  fx.lineWidth = 2.2;
  fx.stroke();

  // Dashed reference circle (max cross-section of solid)
  fx.beginPath();
  fx.arc(W / 2, H / 2, (maxSpan / 2) * s, 0, Math.PI * 2);
  fx.strokeStyle = 'rgba(139,151,172,.25)';
  fx.lineWidth = 1.2;
  fx.setLineDash([4, 4]);
  fx.stroke();
  fx.setLineDash([]);
}

/* ─── Disposal helper ────────────────────────────────────────────────── */

function disposeGroup(grp: THREE.Group) {
  const ch = [...grp.children];
  for (const c of ch) {
    grp.remove(c);
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material;
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x: THREE.Material) => x.dispose());
  }
}

/* ─── Component ──────────────────────────────────────────────────────── */

const SOLID_LABELS: Record<SolidKey, string> = {
  cylinder: '원기둥', cone: '원뿔', sphere: '구', frustum: '원뿔대',
};

export default function RotationExplorer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const flatRef = useRef<HTMLCanvasElement>(null);

  const [solidKey, setSolidKey] = useState<SolidKey>('cylinder');
  const [tilt, setTilt] = useState(0);       // 0–90°
  const [pos, setPos] = useState(0);         // –0.95 … 0.95
  const [showPlane, setShowPlane] = useState(true);
  const [shapeLabel, setShapeLabel] = useState('원');
  const [subLabel, setSubLabel] = useState('축에 수직');

  const solidGroupRef = useRef<THREE.Group | null>(null);
  const sectionGroupRef = useRef<THREE.Group | null>(null);
  const planeDiskRef = useRef<THREE.Mesh | null>(null);
  const trisRef = useRef<Triangle[]>([]);
  const frameIdRef = useRef(0);

  /* ── Scene setup (once) ───────────────────────────────────────────── */
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 100);

    scene.add(new THREE.AmbientLight(0xffffff, 0.88));
    const dl = new THREE.DirectionalLight(0xffffff, 0.42);
    dl.position.set(4, 6, 5);
    scene.add(dl);

    const world = new THREE.Group();
    scene.add(world);

    const solidGroup = new THREE.Group();
    world.add(solidGroup);
    solidGroupRef.current = solidGroup;

    const sectionGroup = new THREE.Group();
    world.add(sectionGroup);
    sectionGroupRef.current = sectionGroup;

    // Rotation axis (dashed)
    const axisLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -1.4, 0),
        new THREE.Vector3(0, 1.4, 0),
      ]),
      new THREE.LineDashedMaterial({
        color: 0x1b2a4a, dashSize: 0.09, gapSize: 0.07,
        transparent: true, opacity: 0.55,
      }),
    );
    axisLine.computeLineDistances();
    world.add(axisLine);

    // Cutting plane disk
    const planeDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1.75, 56),
      new THREE.MeshBasicMaterial({
        color: 0xf2b544, transparent: true, opacity: 0.16,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    world.add(planeDisk);
    planeDiskRef.current = planeDisk;

    // Camera orbit (pointer + wheel, matching HTML exactly)
    const cam = { theta: 0.7, phi: 1.12, radius: 5.0 };
    const updateCamera = () => {
      camera.position.set(
        cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta),
        cam.radius * Math.cos(cam.phi),
        cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta),
      );
      camera.lookAt(0, 0, 0);
    };
    updateCamera();

    const ptrs = new Map<number, { x: number; y: number }>();
    let lastX = 0, lastY = 0, pinch = 0;

    const onDown = (e: PointerEvent) => {
      renderer.domElement.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { lastX = e.clientX; lastY = e.clientY; }
      else if (ptrs.size === 2) {
        const p = [...ptrs.values()];
        pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) {
        const p = [...ptrs.values()];
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (pinch) {
          cam.radius = Math.max(2.8, Math.min(11, cam.radius * (pinch / d)));
          updateCamera();
        }
        pinch = d;
        return;
      }
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      cam.theta -= dx * 0.008;
      cam.phi = Math.max(0.12, Math.min(Math.PI - 0.12, cam.phi - dy * 0.008));
      updateCamera();
    };
    const onEnd = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.radius = Math.max(2.8, Math.min(11, cam.radius * (1 + Math.sign(e.deltaY) * 0.08)));
      updateCamera();
    };

    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onEnd);
    renderer.domElement.addEventListener('pointercancel', onEnd);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);

    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameIdRef.current);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onEnd);
      renderer.domElement.removeEventListener('pointercancel', onEnd);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  /* ── Solid rebuild ────────────────────────────────────────────────── */
  useEffect(() => {
    const sg = solidGroupRef.current;
    if (!sg) return;
    disposeGroup(sg);

    let geo: THREE.BufferGeometry;
    let rings: THREE.Line[];

    switch (solidKey) {
      case 'cone':
        geo = new THREE.ConeGeometry(1, 2, 56);
        rings = [makeRing(1, -1)];
        break;
      case 'frustum':
        geo = new THREE.CylinderGeometry(0.5, 1, 2, 56);
        rings = [makeRing(0.5, 1), makeRing(1, -1)];
        break;
      case 'sphere':
        geo = new THREE.SphereGeometry(1, 56, 40);
        rings = [makeRing(1, 0), makeMeridian()];
        break;
      default: // cylinder
        geo = new THREE.CylinderGeometry(1, 1, 2, 56);
        rings = [makeRing(1, 1), makeRing(1, -1)];
    }

    sg.add(
      new THREE.Mesh(
        geo,
        new THREE.MeshPhongMaterial({
          color: 0x3a4a6a, transparent: true, opacity: 0.16,
          side: THREE.DoubleSide, depthWrite: false, shininess: 4,
        }),
      ),
    );
    rings.forEach(r => sg.add(r));
    trisRef.current = trianglesFromGeo(geo);
  }, [solidKey]);

  /* ── Section + plane update (runs after solid rebuild due to order) ── */
  useEffect(() => {
    const secGrp = sectionGroupRef.current;
    const planeDisk = planeDiskRef.current;
    if (!secGrp || !planeDisk) return;

    // Update cutting plane disk
    planeDisk.visible = showPlane;
    const { point, normal } = planeFromState(tilt, pos);
    planeDisk.position.copy(point);
    planeDisk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

    // Clear section
    disposeGroup(secGrp);

    // tilt ≥ 88° → plane nearly parallel to side faces → use analytical section
    const sec = tilt >= 88
      ? getAxisSection(solidKey, pos)
      : getSection(trisRef.current, tilt, pos);
    setShapeLabel(shapeName(sec, solidKey, tilt));
    setSubLabel(
      tilt < 12 ? '축에 수직' : tilt > 78 ? '축을 포함' : `비스듬히 · ${Math.round(tilt)}°`,
    );

    if (sec) {
      const { poly, center: c } = sec;

      // Fan triangulation from centroid (exact port from HTML)
      const verts: number[] = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        verts.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.computeVertexNormals();
      secGrp.add(
        new THREE.Mesh(
          g,
          new THREE.MeshBasicMaterial({
            color: 0xe8650a, transparent: true, opacity: 0.34,
            side: THREE.DoubleSide, depthWrite: false,
          }),
        ),
      );

      const loopPts = [...poly.map(p => p.clone()), poly[0].clone()];
      secGrp.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(loopPts),
          new THREE.LineBasicMaterial({ color: 0xe8650a }),
        ),
      );
    }

    if (flatRef.current) drawFlat(flatRef.current, sec, solidKey);
  }, [solidKey, tilt, pos, showPlane]);

  const mode = tilt < 12 ? 'perp' : tilt > 78 ? 'contain' : 'oblique';

  return (
    <div className="flex flex-col gap-4">
      {/* Top controls */}
      <div className="flex gap-x-8 gap-y-3 flex-wrap">
        {/* Solid selector */}
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">회전체</p>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(SOLID_LABELS) as SolidKey[]).map(key => (
              <button
                key={key}
                onClick={() => setSolidKey(key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  solidKey === key
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white text-navy border-navy/20 hover:border-navy/50'
                }`}
              >
                {SOLID_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        {/* Cut direction */}
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">자르는 방향</p>
          <div className="flex gap-2">
            {[
              { key: 'perp', label: '축에 수직', val: 0 },
              { key: 'contain', label: '축을 포함', val: 90 },
              { key: 'oblique', label: '비스듬히', val: 42 },
            ].map(({ key, label, val }) => (
              <button
                key={key}
                onClick={() => setTilt(val)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  mode === key
                    ? 'bg-orange text-white border-orange'
                    : 'bg-white text-navy border-navy/20 hover:border-navy/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Viewport + right panel */}
      <div className="flex gap-4 items-stretch">
        <div
          ref={mountRef}
          className="flex-1 min-w-0 bg-white rounded-2xl border border-navy/10 overflow-hidden cursor-grab active:cursor-grabbing"
          style={{ height: 420 }}
        />

        {/* Right panel: shape name + 2D preview */}
        <div className="w-44 flex-shrink-0 flex flex-col gap-3">
          <div className="bg-white rounded-2xl border border-navy/10 p-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">단면 모양</p>
            <p className="text-xl font-bold text-navy leading-snug">{shapeLabel}</p>
            <p className="text-xs font-mono text-orange mt-1">{subLabel}</p>
          </div>

          <div className="bg-white rounded-2xl border border-navy/10 p-3 flex flex-col flex-1">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">실제 단면</p>
            <div className="flex-1 flex items-center justify-center">
              <canvas
                ref={flatRef}
                width={148}
                height={148}
                className="rounded-lg block"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sliders + toggle */}
      <div className="bg-white rounded-2xl border border-navy/10 p-4 flex flex-col gap-3">
        {/* Tilt slider */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="font-medium text-navy">기울기</span>
            <span className="font-mono text-orange">{Math.round(tilt)}°</span>
          </div>
          <input
            type="range" min="0" max="90" value={tilt}
            onChange={e => setTilt(+e.target.value)}
            className="w-full accent-orange"
          />
        </div>

        {/* Height slider */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="font-medium text-navy">높이</span>
            <span className="font-mono text-orange">{pos.toFixed(2)}</span>
          </div>
          <input
            type="range" min="-95" max="95" value={Math.round(pos * 100)}
            onChange={e => setPos(+e.target.value / 100)}
            className="w-full accent-orange"
          />
        </div>

        {/* Plane toggle */}
        <button
          onClick={() => setShowPlane(v => !v)}
          className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
            showPlane ? 'border-orange/30 bg-orange/5 text-navy' : 'border-navy/15 text-muted hover:border-navy/30'
          }`}
        >
          <span>자르는 면 보기</span>
          <span
            className={`relative inline-block w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
              showPlane ? 'bg-orange' : 'bg-navy/15'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                showPlane ? 'left-4' : 'left-0.5'
              }`}
            />
          </span>
        </button>
      </div>

      <p className="text-xs text-muted">
        드래그로 회전, 스크롤/핀치로 확대·축소합니다.
      </p>
    </div>
  );
}
