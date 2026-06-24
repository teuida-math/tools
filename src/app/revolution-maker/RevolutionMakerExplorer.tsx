'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

// ─── Constants ──────────────────────────────────────────────────────────────
const SVG_W = 280;
const SVG_H = 310;
const AXIS_X = 52;
const SH_TOP = 72;
const SH_H = 152;        // shape height in px (= diameter for semicircle/circle)
const SH_W = 112;        // shape width for most shapes
const TRAP_W_BOT = 130;
const TRAP_W_TOP = 68;
const SNAP = 14;
const MAX_OFFSET = 84;
const CIRCLE_MAX_OFFSET = 72;

const WORLD_H = 2.0;
const PX_TO_WORLD = WORLD_H / SH_H;
const SVG_SCALE = SH_H / WORLD_H; // 76 px per world unit
const SVG_CY = SH_TOP + SH_H / 2; // 148

// ─── Types ──────────────────────────────────────────────────────────────────
type ShapeType = 'rect' | 'rtriangle' | 'itriangle' | 'semicircle' | 'circle' | 'trapezoid' | 'pentagon';
type Rotation = 0 | 90 | 180 | 270;

const SHAPES: { key: ShapeType; label: string }[] = [
  { key: 'rect', label: '직사각형' },
  { key: 'rtriangle', label: '직각삼각형' },
  { key: 'itriangle', label: '이등변삼각형' },
  { key: 'semicircle', label: '반원' },
  { key: 'circle', label: '원' },
  { key: 'trapezoid', label: '사다리꼴' },
  { key: 'pentagon', label: '오각형' },
];

// Valid direction rotation values per shape (in cycling order). Absent = no direction button.
const SHAPE_DIRECTIONS: Partial<Record<ShapeType, Rotation[]>> = {
  rtriangle: [0, 180, 90, 270],
  trapezoid: [0, 180],
};

// ─── World points for LatheGeometry ─────────────────────────────────────────
//
// Rules for valid profiles:
//   - No two consecutive points with the same x (creates a cylinder wall)
//   - x >= 0 for all points
//   - Profile should not self-intersect when revolved
//
function getPoints(shape: ShapeType, rotation: Rotation, offsetPx: number): THREE.Vector2[] {
  const raw = offsetPx < SNAP ? 0 : offsetPx;
  const d = raw * PX_TO_WORLD;
  const w = SH_W * PX_TO_WORLD;     // ≈ 1.474
  const h = WORLD_H;                 // = 2.0
  const wBot = TRAP_W_BOT * PX_TO_WORLD; // ≈ 1.711
  const wTop = TRAP_W_TOP * PX_TO_WORLD; // ≈ 0.895
  const r = h / 2;                   // = 1.0

  if (shape === 'semicircle') {
    const N = 33;
    const arc = Array.from({ length: N }, (_, i) => {
      const theta = -Math.PI / 2 + (i / (N - 1)) * Math.PI;
      return new THREE.Vector2(d + r * Math.cos(theta), r * Math.sin(theta));
    });
    if (d > 0.001) return [...arc, new THREE.Vector2(arc[0].x, arc[0].y)];
    return arc;
  }

  if (shape === 'circle') {
    const cx = d + r;
    const N = 64;
    return Array.from({ length: N + 1 }, (_, i) => {
      const phi = (2 * Math.PI * i) / N;
      return new THREE.Vector2(cx + r * Math.cos(phi), r * Math.sin(phi));
    });
  }

  const makeOpen = (): THREE.Vector2[] => {
    if (shape === 'rect') {
      return [
        new THREE.Vector2(d, -r),
        new THREE.Vector2(d + w, -r),
        new THREE.Vector2(d + w, r),
        new THREE.Vector2(d, r),
      ];
    }

    if (shape === 'rtriangle') {
      if (rotation === 270) {
        // Dir 4: hypotenuse on axis → double cone
        const L = Math.sqrt(w * w + h * h);
        return [
          new THREE.Vector2(d, -L / 2),
          new THREE.Vector2(d + (w * h) / L, (h * h - w * w) / (2 * L)),
          new THREE.Vector2(d, L / 2),
        ];
      }
      if (rotation === 90) {
        // Dir 3: right angle top-left, apex at bottom
        return [new THREE.Vector2(d, -1), new THREE.Vector2(d + w, 1), new THREE.Vector2(d, 1)];
      }
      if (rotation === 180) {
        // Dir 2: right angle bottom-right, hypotenuse on axis side
        return [new THREE.Vector2(d, -1), new THREE.Vector2(d + w, -1), new THREE.Vector2(d + w, 1)];
      }
      // Dir 1: right angle bottom-left, apex at top
      return [new THREE.Vector2(d, -1), new THREE.Vector2(d + w, -1), new THREE.Vector2(d, 1)];
    }

    if (shape === 'itriangle') {
      // Only one valid orientation: left (long) edge on axis → double cone
      return [new THREE.Vector2(d, -1), new THREE.Vector2(d + w, 0), new THREE.Vector2(d, 1)];
    }

    if (shape === 'pentagon') {
      // Butterfly: wide at bottom and top, pinched waist at middle
      return [
        new THREE.Vector2(d, -1),
        new THREE.Vector2(d + w, -1),
        new THREE.Vector2(d + w * 0.1, 0),
        new THREE.Vector2(d + w, 1),
        new THREE.Vector2(d, 1),
      ];
    }

    // trapezoid — only 0° and 180° are valid; 90°/270° produce vertical edges (cylinder-wall bug)
    if (rotation === 180) {
      // Narrow side at bottom, wide side at top (inverted frustum)
      return [
        new THREE.Vector2(d, -1),
        new THREE.Vector2(d + wTop, -1),
        new THREE.Vector2(d + wBot, 1),
        new THREE.Vector2(d, 1),
      ];
    }
    // 0°: wide side at bottom, narrow side at top (standard frustum)
    return [
      new THREE.Vector2(d, -1),
      new THREE.Vector2(d + wBot, -1),
      new THREE.Vector2(d + wTop, 1),
      new THREE.Vector2(d, 1),
    ];
  };

  const open = makeOpen();
  if (d > 0.001) return [...open, new THREE.Vector2(open[0].x, open[0].y)];
  return open;
}

// ─── Shape name + description ────────────────────────────────────────────────
function getNameDesc(
  shape: ShapeType,
  rotation: Rotation,
  offsetPx: number,
  angle: number,
): { name: string; desc: string } {
  const snapped = offsetPx < SNAP;
  const full = angle >= 360;

  let base: string;
  let desc: string;

  if (shape === 'rect') {
    if (snapped) {
      base = '원기둥';
      desc = '직사각형을 회전축에 붙여 360° 회전하면 원기둥이 됩니다.';
    } else {
      base = '중공 원기둥';
      desc = '직사각형이 축에서 떨어져 있으면 관(중공 원기둥)이 됩니다.';
    }
  } else if (shape === 'rtriangle') {
    if (!snapped) {
      base = '원뿔 계열';
      desc = '도형을 회전축으로 드래그해 붙이면 회전체가 됩니다.';
    } else if (rotation === 270) {
      base = '이중 원뿔';
      desc = '직각삼각형의 빗변을 회전축에 맞추어 회전하면 이중 원뿔(쌍뿔)이 됩니다.';
    } else if (rotation === 180) {
      base = '원기둥';
      desc = '직각을 이룬 두 변이 축에 수직/평행하게 되어, 회전하면 원기둥이 됩니다.';
    } else {
      base = '원뿔';
      const dir = rotation === 0 ? '꼭짓점이 위' : '꼭짓점이 아래';
      desc = `직각삼각형을 회전축에 붙여 회전하면 원뿔이 됩니다. (${dir})`;
    }
  } else if (shape === 'itriangle') {
    if (snapped) {
      base = '이중 원뿔';
      desc = '이등변삼각형의 왼쪽 변을 회전축으로 360° 회전하면 이중 원뿔(쌍뿔)이 됩니다.';
    } else {
      base = '이중 원뿔 계열';
      desc = '도형을 회전축으로 드래그해 붙이면 이중 원뿔이 됩니다.';
    }
  } else if (shape === 'semicircle') {
    if (snapped) {
      base = '구';
      desc = '반원을 지름을 축으로 360° 회전하면 구가 됩니다.';
    } else {
      base = '반토러스';
      desc = '반원이 축에서 떨어져 있으면 반토러스(반도넛) 형태가 됩니다.';
    }
  } else if (shape === 'circle') {
    if (snapped) {
      base = '구';
      desc = '원이 축에 접해 회전하면 구 형태가 됩니다.';
    } else {
      base = '토러스';
      desc = '원이 축에서 떨어져 회전하면 토러스(도넛)가 됩니다.';
    }
  } else if (shape === 'pentagon') {
    if (snapped) {
      base = '모래시계';
      desc = '잘록한 오각형을 회전하면 모래시계 모양의 회전체가 됩니다.';
    } else {
      base = '모래시계 계열';
      desc = '도형을 회전축으로 드래그해 붙이면 모래시계가 됩니다.';
    }
  } else {
    // trapezoid — both 0° and 180° produce a frustum
    if (!snapped) {
      base = '원뿔대 계열';
      desc = '도형을 회전축으로 드래그해 붙이면 원뿔대가 됩니다.';
    } else {
      base = '원뿔대';
      desc = rotation === 0
        ? '사다리꼴을 회전축에 붙여 회전하면 원뿔대가 됩니다. (넓은 변이 아래)'
        : '사다리꼴을 뒤집어 회전하면 원뿔대가 됩니다. (좁은 변이 아래)';
    }
  }

  if (!full) {
    return {
      name: `${base}의 일부 (${Math.round(angle)}°)`,
      desc: '슬라이더를 360°로 설정하면 완전한 회전체가 됩니다.',
    };
  }
  return { name: base, desc };
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function RevolutionMakerExplorer() {
  const mountRef = useRef<HTMLDivElement>(null);

  const [shape, setShape] = useState<ShapeType>('rect');
  const [rotation, setRotation] = useState<Rotation>(0);
  const [offsetPx, setOffsetPx] = useState(0);
  const [angle, setAngle] = useState(360);
  const [wireframe, setWireframe] = useState(false);
  const [playing, setPlaying] = useState(false);

  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshPhongMaterial | null>(null);
  const solidEdgeRef = useRef<THREE.LineSegments | null>(null);
  const hiddenEdgeRef = useRef<THREE.LineSegments | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const frameIdRef = useRef(0);
  const playRafRef = useRef(0);
  const playAngleRef = useRef<number>(360);

  const dragState = useRef<{ startPx: number; startOffset: number } | null>(null);

  function handleShapeChange(s: ShapeType) {
    setShape(s);
    setRotation(0);
  }

  function handleAngleChange(v: number) {
    setAngle(v);
    playAngleRef.current = v;
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
    } else {
      const start = angle >= 360 ? 0 : angle;
      setAngle(start);
      playAngleRef.current = start;
      setPlaying(true);
    }
  }

  // ── Play animation ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(playRafRef.current);
      return;
    }

    let lastTime = 0;
    const SPEED = 120;

    const tick = (time: number) => {
      if (!lastTime) {
        lastTime = time;
        playRafRef.current = requestAnimationFrame(tick);
        return;
      }
      const delta = (time - lastTime) / 1000;
      lastTime = time;
      playAngleRef.current = Math.min(360, playAngleRef.current + delta * SPEED);
      setAngle(playAngleRef.current);
      if (playAngleRef.current >= 360) {
        setPlaying(false);
        return;
      }
      playRafRef.current = requestAnimationFrame(tick);
    };

    playRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(playRafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // ── Scene setup (once) ───────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setClearColor(0xffffff);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 100);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(4, 6, 5);
    scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0x8b97ac, 0.3);
    dl2.position.set(-3, -2, -3);
    scene.add(dl2);

    const axisLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -1.55, 0),
        new THREE.Vector3(0, 1.55, 0),
      ]),
      new THREE.LineDashedMaterial({
        color: 0x1b2a4a,
        dashSize: 0.08,
        gapSize: 0.06,
        transparent: true,
        opacity: 0.6,
      }),
    );
    axisLine.computeLineDistances();
    scene.add(axisLine);

    const material = new THREE.MeshPhongMaterial({
      color: 0xf4f2ee,
      emissive: 0xf4f2ee,
      emissiveIntensity: 0.3,
      shininess: 0,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    scene.add(mesh);
    meshRef.current = mesh;

    const cam = { theta: 0.65, phi: 1.1, radius: 5.5 };
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
        if (pinch) cam.radius = Math.max(2.5, Math.min(12, cam.radius * (pinch / d)));
        pinch = d;
        updateCamera();
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
      cam.radius = Math.max(2.5, Math.min(12, cam.radius * (1 + Math.sign(e.deltaY) * 0.08)));
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
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // ── Geometry + edges update ──────────────────────────────────────────────
  useEffect(() => {
    const mesh = meshRef.current;
    const scene = sceneRef.current;
    if (!mesh || !scene) return;

    const points = getPoints(shape, rotation, offsetPx);
    const phiLength = Math.max((angle * Math.PI) / 180, 0.001);
    const geo = new THREE.LatheGeometry(points, 64, 0, phiLength);

    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = geo;

    const prev = solidEdgeRef.current;
    const prevH = hiddenEdgeRef.current;
    if (prev) { scene.remove(prev); prev.geometry.dispose(); (prev.material as THREE.Material).dispose(); }
    if (prevH) { scene.remove(prevH); prevH.geometry.dispose(); (prevH.material as THREE.Material).dispose(); }

    const edgesGeo = new THREE.EdgesGeometry(geo, 15);

    const solidEdge = new THREE.LineSegments(
      edgesGeo,
      new THREE.LineBasicMaterial({ color: 0x1b2a4a, opacity: 0.9, transparent: true }),
    );
    scene.add(solidEdge);
    solidEdgeRef.current = solidEdge;

    const hiddenEdge = new THREE.LineSegments(
      edgesGeo.clone(),
      new THREE.LineDashedMaterial({
        color: 0x1b2a4a,
        dashSize: 0.08,
        gapSize: 0.06,
        opacity: 0.35,
        transparent: true,
        depthTest: false,
      }),
    );
    hiddenEdge.computeLineDistances();
    scene.add(hiddenEdge);
    hiddenEdgeRef.current = hiddenEdge;

    const wf = materialRef.current?.wireframe ?? false;
    solidEdge.visible = !wf;
    hiddenEdge.visible = !wf;
  }, [shape, rotation, offsetPx, angle]);

  // ── Wireframe update ─────────────────────────────────────────────────────
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    mat.wireframe = wireframe;
    mat.opacity = wireframe ? 0.9 : 0.55;
    mat.needsUpdate = true;
    if (solidEdgeRef.current) solidEdgeRef.current.visible = !wireframe;
    if (hiddenEdgeRef.current) hiddenEdgeRef.current.visible = !wireframe;
  }, [wireframe]);

  // ── SVG drag handlers ────────────────────────────────────────────────────
  function onSvgDown(e: React.PointerEvent<SVGSVGElement>) {
    e.preventDefault();
    dragState.current = { startPx: e.clientX, startOffset: offsetPx };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }

  function onSvgMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragState.current) return;
    const svgEl = e.currentTarget as SVGSVGElement;
    const rect = svgEl.getBoundingClientRect();
    const svgScale = SVG_W / rect.width;
    const dx = (e.clientX - dragState.current.startPx) * svgScale;
    const maxOff = shape === 'circle' ? CIRCLE_MAX_OFFSET : MAX_OFFSET;
    let next = Math.max(0, Math.min(maxOff, dragState.current.startOffset + dx));
    if (next < SNAP) next = 0;
    setOffsetPx(next);
  }

  function onSvgUp() {
    dragState.current = null;
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const snapped = offsetPx < SNAP;
  const shapeLeft = AXIS_X + offsetPx;
  const { name: shapeName, desc: shapeDesc } = getNameDesc(shape, rotation, offsetPx, angle);

  const scRadius = SH_H / 2; // 76px
  const d_svg = offsetPx * PX_TO_WORLD;

  const toSvgX = (xw: number) => shapeLeft + (xw - d_svg) * SVG_SCALE;
  const toSvgY = (yw: number) => SVG_CY - yw * SVG_SCALE;

  // Direction cycling
  const dirConfig = SHAPE_DIRECTIONS[shape] ?? [];
  const hasDir = dirConfig.length > 0;

  function cycleDirection() {
    if (!dirConfig.length) return;
    const idx = dirConfig.indexOf(rotation);
    setRotation(dirConfig[(idx + 1) % dirConfig.length]);
  }

  // Polygon points for SVG (world coords → SVG pixels)
  const polyPts = (() => {
    const w = SH_W * PX_TO_WORLD;
    const h = WORLD_H;
    const wBot = TRAP_W_BOT * PX_TO_WORLD;
    const wTop = TRAP_W_TOP * PX_TO_WORLD;
    const r = h / 2;
    const d = d_svg;

    let verts: [number, number][];

    if (shape === 'rect') {
      verts = [[d, -r], [d + w, -r], [d + w, r], [d, r]];
    } else if (shape === 'rtriangle') {
      if (rotation === 270) {
        const L = Math.sqrt(w * w + h * h);
        verts = [[d, -L / 2], [d + (w * h) / L, (h * h - w * w) / (2 * L)], [d, L / 2]];
      } else if (rotation === 90) {
        verts = [[d, -1], [d + w, 1], [d, 1]];
      } else if (rotation === 180) {
        verts = [[d, -1], [d + w, -1], [d + w, 1]];
      } else {
        verts = [[d, -1], [d + w, -1], [d, 1]];
      }
    } else if (shape === 'itriangle') {
      verts = [[d, -1], [d + w, 0], [d, 1]];
    } else if (shape === 'pentagon') {
      verts = [[d, -1], [d + w, -1], [d + w * 0.1, 0], [d + w, 1], [d, 1]];
    } else if (shape === 'trapezoid') {
      if (rotation === 180) {
        verts = [[d, -1], [d + wTop, -1], [d + wBot, 1], [d, 1]];
      } else {
        verts = [[d, -1], [d + wBot, -1], [d + wTop, 1], [d, 1]];
      }
    } else {
      return null; // semicircle, circle
    }

    return verts.map(([xw, yw]) => `${toSvgX(xw)},${toSvgY(yw)}`).join(' ');
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* Shape tabs */}
      <div className="flex flex-wrap gap-1 bg-white border border-navy/10 rounded-xl p-1 w-full">
        {SHAPES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleShapeChange(key)}
            className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              shape === key
                ? 'bg-navy text-white shadow-sm'
                : 'text-muted hover:text-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main area */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch">
        {/* 2D SVG view */}
        <div className="w-full md:w-2/5 bg-white rounded-2xl border border-navy/10 p-3 flex flex-col gap-2 min-h-[320px]">
          <div className="flex items-center justify-between min-h-[28px]">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">2D 편집 뷰</p>
            <div className="flex items-center gap-2">
              {snapped && (
                <span className="text-xs font-medium text-orange bg-orange/10 px-2 py-0.5 rounded-full">
                  • 붙음
                </span>
              )}
              {hasDir && (
                <button
                  onClick={cycleDirection}
                  className="px-2.5 py-1 rounded-full bg-navy/6 hover:bg-navy/12 text-navy text-sm transition-colors leading-none"
                >
                  ↻
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <svg
              width={SVG_W}
              height={SVG_H}
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="select-none max-w-full cursor-grab active:cursor-grabbing"
              onPointerDown={onSvgDown}
              onPointerMove={onSvgMove}
              onPointerUp={onSvgUp}
              onPointerCancel={onSvgUp}
            >
              {/* Rotation axis */}
              <line
                x1={AXIS_X} y1={22}
                x2={AXIS_X} y2={SVG_H - 18}
                stroke="#1B2A4A"
                strokeWidth="1.5"
                strokeDasharray="7 4"
                opacity="0.65"
              />
              <text
                x={AXIS_X} y={14}
                fontSize="9"
                fill="#1B2A4A"
                opacity="0.45"
                textAnchor="middle"
                style={{ fontFamily: 'inherit' }}
              >
                회전축
              </text>

              {/* Gap indicator when floating */}
              {!snapped && offsetPx > SNAP && (
                <>
                  <line
                    x1={AXIS_X + 2} y1={SVG_CY}
                    x2={shapeLeft - 2} y2={SVG_CY}
                    stroke="#8B97AC" strokeWidth="1" strokeDasharray="4 3" opacity="0.65"
                  />
                  <line
                    x1={AXIS_X + 2} y1={SVG_CY - 5}
                    x2={AXIS_X + 2} y2={SVG_CY + 5}
                    stroke="#8B97AC" strokeWidth="1" opacity="0.65"
                  />
                  <line
                    x1={shapeLeft - 2} y1={SVG_CY - 5}
                    x2={shapeLeft - 2} y2={SVG_CY + 5}
                    stroke="#8B97AC" strokeWidth="1" opacity="0.65"
                  />
                </>
              )}

              {/* Shape */}
              {shape === 'semicircle' && (
                <path
                  d={`M ${shapeLeft},${SH_TOP} A ${scRadius},${scRadius} 0 0 1 ${shapeLeft},${SH_TOP + SH_H} Z`}
                  fill="rgba(232,101,10,0.18)"
                  stroke="#E8650A"
                  strokeWidth="2"
                />
              )}
              {shape === 'circle' && (
                <circle
                  cx={shapeLeft + scRadius}
                  cy={SVG_CY}
                  r={scRadius}
                  fill="rgba(232,101,10,0.18)"
                  stroke="#E8650A"
                  strokeWidth="2"
                />
              )}
              {polyPts && (
                <polygon
                  points={polyPts}
                  fill="rgba(232,101,10,0.18)"
                  stroke="#E8650A"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              )}

              {/* Drag hint */}
              <text
                x={SVG_W / 2 + 16}
                y={SVG_H - 8}
                fontSize="9.5"
                fill="#8B97AC"
                textAnchor="middle"
                style={{ fontFamily: 'inherit' }}
              >
                ← 드래그해 이동
              </text>
            </svg>
          </div>
        </div>

        {/* 3D view + name */}
        <div className="w-full md:w-3/5 flex flex-col gap-3">
          <div className="relative flex-1">
            <div
              ref={mountRef}
              className="w-full aspect-[4/3] md:aspect-auto md:h-[340px] bg-white rounded-2xl border border-navy/10 overflow-hidden cursor-grab active:cursor-grabbing"
            />
            <button
              onClick={() => setWireframe(v => !v)}
              className={`absolute top-3 right-3 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                wireframe
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white/90 text-navy border-navy/20 hover:border-navy/40'
              }`}
            >
              와이어프레임
            </button>
          </div>

          {/* Shape name + desc */}
          <div className="bg-white rounded-2xl border border-navy/10 p-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">회전체</p>
            <p className="text-xl font-bold text-navy leading-snug mb-1.5">{shapeName}</p>
            <p className="text-sm text-muted break-keep">{shapeDesc}</p>
          </div>
        </div>
      </div>

      {/* Angle slider */}
      <div className="bg-white rounded-2xl border border-navy/10 p-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-navy">회전 각도</span>
            <button
              onClick={togglePlay}
              title={playing ? '일시정지' : '재생'}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs leading-none transition-colors ${
                playing
                  ? 'bg-orange text-white'
                  : 'bg-navy/8 text-navy hover:bg-navy/15'
              }`}
            >
              {playing ? '⏸' : '▶'}
            </button>
          </div>
          <span className="font-mono text-orange text-lg font-bold leading-none">
            {Math.round(angle)}°
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="360"
          value={angle}
          onChange={e => handleAngleChange(+e.target.value)}
          className="w-full accent-orange"
        />
        <div className="flex justify-between text-xs text-muted mt-1.5">
          <span>0°</span>
          <span>90°</span>
          <span>180°</span>
          <span>270°</span>
          <span>360°</span>
        </div>
      </div>

      <p className="text-xs text-muted break-keep">
        3D 뷰: 드래그로 회전, 스크롤/핀치로 확대·축소합니다.
      </p>
    </div>
  );
}
