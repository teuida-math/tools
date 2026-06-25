'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Play, Pause } from 'lucide-react';

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
const MIN_SHAPE_W = 32;
const MIN_SHAPE_H = 48;
const MAX_SHAPE_H = 240;
const MIN_TRAP_W = 20;
const MAX_TRAP_W = 180;

// ─── Types ──────────────────────────────────────────────────────────────────
type ShapeType = 'rect' | 'rtriangle' | 'itriangle' | 'semicircle' | 'circle' | 'trapezoid' | 'pentagon';
type Rotation = 0 | 1 | 90 | 180 | 270;

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
  rtriangle: [0, 180, 90, 270, 1],
  trapezoid: [0, 180, 90],
};

// ─── World points for LatheGeometry ─────────────────────────────────────────
//
// Rules for valid profiles:
//   - No two consecutive points with the same x (creates a cylinder wall)
//   - x >= 0 for all points
//   - Profile should not self-intersect when revolved
//
function getPoints(
  shape: ShapeType,
  rotation: Rotation,
  offsetPx: number,
  shapeWPx = SH_W,
  shapeHPx = SH_H,
  trapBotWPx = TRAP_W_BOT,
  trapTopWPx = TRAP_W_TOP,
  trapHPx = SH_H,
  pentWPx = SH_W,
  pentHPx = SH_H,
  pentIndentXPx = SH_W * 0.1,
): THREE.Vector2[] {
  const raw = offsetPx < SNAP ? 0 : offsetPx;
  const d = raw * PX_TO_WORLD;
  const w = shapeWPx * PX_TO_WORLD;
  const h = shapeHPx * PX_TO_WORLD;
  const r = h / 2;

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
        return [new THREE.Vector2(d, -r), new THREE.Vector2(d + w, r), new THREE.Vector2(d, r)];
      }
      if (rotation === 180) {
        // Dir 2: revolve around short leg (w) → wider, flatter cone (different proportions)
        return [new THREE.Vector2(d, -w / 2), new THREE.Vector2(d + h, -w / 2), new THREE.Vector2(d, w / 2)];
      }
      if (rotation === 1) {
        // Dir 5: 빗변(hyp) → 오른쪽 수직변 → 외부 원기둥 + 내부 원뿔
        return [new THREE.Vector2(d, -r), new THREE.Vector2(d + w, r), new THREE.Vector2(d + w, -r)];
      }
      // Dir 1: right angle bottom-left, apex at top
      return [new THREE.Vector2(d, -r), new THREE.Vector2(d + w, -r), new THREE.Vector2(d, r)];
    }

    if (shape === 'itriangle') {
      // Only one valid orientation: left (long) edge on axis → double cone
      return [new THREE.Vector2(d, -r), new THREE.Vector2(d + w, 0), new THREE.Vector2(d, r)];
    }

    if (shape === 'pentagon') {
      const rP = pentHPx * PX_TO_WORLD / 2;
      const wP = pentWPx * PX_TO_WORLD;
      const indentX = pentIndentXPx * PX_TO_WORLD;
      return [
        new THREE.Vector2(d, -rP),
        new THREE.Vector2(d + wP, -rP),
        new THREE.Vector2(d + indentX, 0),
        new THREE.Vector2(d + wP, rP),
        new THREE.Vector2(d, rP),
      ];
    }

    // trapezoid
    const rT = trapHPx * PX_TO_WORLD / 2;
    const wBotT = trapBotWPx * PX_TO_WORLD;
    const wTopT = trapTopWPx * PX_TO_WORLD;
    if (rotation === 90) {
      // 아래 직사각형 + 위 삼각형 → 원기둥+원뿔 합성체
      return [
        new THREE.Vector2(d, -rT),
        new THREE.Vector2(d + wBotT, -rT),
        new THREE.Vector2(d + wBotT, 0),
        new THREE.Vector2(d, rT),
      ];
    }
    if (rotation === 180) {
      // Narrow side at bottom, wide side at top (inverted frustum)
      return [
        new THREE.Vector2(d, -rT),
        new THREE.Vector2(d + wTopT, -rT),
        new THREE.Vector2(d + wBotT, rT),
        new THREE.Vector2(d, rT),
      ];
    }
    // 0°: wide side at bottom, narrow side at top (standard frustum)
    return [
      new THREE.Vector2(d, -rT),
      new THREE.Vector2(d + wBotT, -rT),
      new THREE.Vector2(d + wTopT, rT),
      new THREE.Vector2(d, rT),
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
      base = rotation === 1 ? '원기둥 계열' : '원뿔 계열';
      desc = '도형을 회전축으로 드래그해 붙이면 회전체가 됩니다.';
    } else if (rotation === 270) {
      base = '이중 원뿔';
      desc = '직각삼각형의 빗변을 회전축에 맞추어 회전하면 이중 원뿔(쌍뿔)이 됩니다.';
    } else if (rotation === 180) {
      base = '원뿔';
      desc = '직각삼각형의 짧은 변을 회전축으로 삼아 회전하면 더 납작하고 넓은 원뿔이 됩니다.';
    } else if (rotation === 1) {
      base = '원기둥 (내부 원뿔)';
      desc = '직각삼각형을 이 방향으로 회전하면 원기둥 내부에 원뿔 모양이 파인 형태가 됩니다.';
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
    base = '토러스(원환체)';
    desc = '원이 축 주위를 회전하면 토러스(도넛 모양)가 됩니다.';
  } else if (shape === 'pentagon') {
    if (snapped) {
      base = '모래시계';
      desc = '잘록한 오각형을 회전하면 모래시계 모양의 회전체가 됩니다.';
    } else {
      base = '모래시계 계열';
      desc = '도형을 회전축으로 드래그해 붙이면 모래시계가 됩니다.';
    }
  } else {
    // trapezoid
    if (!snapped) {
      if (rotation === 90) {
        base = '원기둥+원뿔 계열';
        desc = '도형을 회전축으로 드래그해 붙이면 합성 회전체가 됩니다.';
      } else {
        base = '원뿔대 계열';
        desc = '도형을 회전축으로 드래그해 붙이면 원뿔대가 됩니다.';
      }
    } else if (rotation === 90) {
      base = '원기둥+원뿔';
      desc = '아래는 원기둥, 위는 원뿔이 결합된 합성 회전체가 됩니다.';
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
  const [shapeWPx, setShapeWPx] = useState(SH_W);
  const [shapeHPx, setShapeHPx] = useState(SH_H);
  const [trapBotWPx, setTrapBotWPx] = useState(TRAP_W_BOT);
  const [trapTopWPx, setTrapTopWPx] = useState(TRAP_W_TOP);
  const [trapHPx, setTrapHPx] = useState(SH_H);
  const [pentWPx, setPentWPx] = useState(SH_W);
  const [pentHPx, setPentHPx] = useState(SH_H);
  const [pentIndentXPx, setPentIndentXPx] = useState(Math.round(SH_W * 0.1));

  const meshRef = useRef<THREE.Mesh | null>(null);
  const meshInteriorRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshPhongMaterial | null>(null);
  const materialInteriorRef = useRef<THREE.MeshPhongMaterial | null>(null);
  const capMeshesRef = useRef<THREE.Mesh[]>([]);
  const capMaterialRef = useRef<THREE.MeshPhongMaterial | null>(null);
  const solidEdgeRef = useRef<THREE.LineSegments | null>(null);
  const hiddenEdgeRef = useRef<THREE.LineSegments | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const frameIdRef = useRef(0);
  const playRafRef = useRef(0);
  const playAngleRef = useRef<number>(360);

  const svgRef = useRef<SVGSVGElement>(null);
  const autoRotateRef = useRef<(() => void) | null>(null);
  // Refs for values read inside native event handlers (avoids stale closures)
  const offsetPxRef = useRef<number>(0);
  const shapeWPxRef = useRef(SH_W);
  const shapeHPxRef = useRef(SH_H);
  const trapBotWPxRef = useRef(TRAP_W_BOT);
  const trapTopWPxRef = useRef(TRAP_W_TOP);
  const trapHPxRef = useRef(SH_H);
  const pentWPxRef = useRef(SH_W);
  const pentHPxRef = useRef(SH_H);
  const pentIndentXPxRef = useRef(Math.round(SH_W * 0.1));
  const resizeDragState = useRef<{
    axis: 'x' | 'y';
    startClient: number;
    startSize: number;
    yInv: boolean;
    maxW: number;
    target: 'shapeW' | 'shapeH' | 'trapBotW' | 'trapTopW' | 'trapH' | 'pentW' | 'pentH' | 'pentIndent';
  } | null>(null);

  function handleShapeChange(s: ShapeType) {
    setShape(s);
    setRotation(0);
    setShapeWPx(SH_W);
    setShapeHPx(SH_H);
    setTrapBotWPx(TRAP_W_BOT);
    setTrapTopWPx(TRAP_W_TOP);
    setTrapHPx(SH_H);
    setPentWPx(SH_W);
    setPentHPx(SH_H);
    setPentIndentXPx(Math.round(SH_W * 0.1));
  }

  function handleAngleChange(v: number) {
    setAngle(v);
    playAngleRef.current = v;
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
    } else {
      playAngleRef.current = 0;
      setAngle(0);
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
    renderer.domElement.style.touchAction = 'pan-y';
    renderer.domElement.style.pointerEvents = 'auto';
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

    // Cap material (DoubleSide) — 위아래 원형 캡을 안팎 모두에서 표시
    const materialCap = new THREE.MeshPhongMaterial({
      color: 0xf4f2ee,
      emissive: 0xf4f2ee,
      emissiveIntensity: 0.25,
      shininess: 20,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    capMaterialRef.current = materialCap;

    // Interior mesh (BackSide) — 내부 벽면·캡을 안쪽에서 렌더링
    const materialInterior = new THREE.MeshPhongMaterial({
      color: 0xf4f2ee,
      emissive: 0xf4f2ee,
      emissiveIntensity: 0.2,
      shininess: 0,
      transparent: true,
      opacity: 0.5,
      side: THREE.BackSide,
      depthWrite: false, // 깊이 버퍼 미기록 → 외면에 가려지지 않음
    });
    materialInteriorRef.current = materialInterior;

    const meshInterior = new THREE.Mesh(new THREE.BufferGeometry(), materialInterior);
    meshInterior.renderOrder = 0;
    scene.add(meshInterior);
    meshInteriorRef.current = meshInterior;

    // Exterior mesh (FrontSide) — 반투명 외면
    const material = new THREE.MeshPhongMaterial({
      color: 0xf4f2ee,
      emissive: 0xf4f2ee,
      emissiveIntensity: 0.3,
      shininess: 0,
      transparent: true,
      opacity: 0.3,
      side: THREE.FrontSide,
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.renderOrder = 1;
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

    // Auto-rotation state
    let autoRotating = true;
    let autoRotStartTime = performance.now();
    const AUTO_ROT_SPEED = (2 * Math.PI) / 3; // 360° in 3s

    let autoRotStartTheta = cam.theta;

    // Exposed so shape-change effect can trigger a new spin
    autoRotateRef.current = () => {
      autoRotating = true;
      autoRotStartTime = performance.now();
      autoRotStartTheta = cam.theta;
    };

    const ptrs = new Map<number, { x: number; y: number }>();
    let lastX = 0, lastY = 0, pinch = 0;

    const onDown = (e: PointerEvent) => {
      if (ptrs.size >= 1) e.preventDefault();
      autoRotating = false;
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
      autoRotating = false;
      cam.radius = Math.max(2.5, Math.min(12, cam.radius * (1 + Math.sign(e.deltaY) * 0.08)));
      updateCamera();
    };

    renderer.domElement.addEventListener('pointerdown', onDown, { passive: false });
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
      if (autoRotating) {
        const elapsed = (performance.now() - autoRotStartTime) / 1000;
        if (elapsed < (2 * Math.PI) / AUTO_ROT_SPEED) {
          cam.theta = autoRotStartTheta + elapsed * AUTO_ROT_SPEED;
          updateCamera();
        } else {
          cam.theta = autoRotStartTheta + 2 * Math.PI;
          autoRotating = false;
        }
      }
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
    const meshInterior = meshInteriorRef.current;
    const scene = sceneRef.current;
    if (!mesh || !meshInterior || !scene) return;

    const rawPoints = getPoints(shape, rotation, offsetPx, shapeWPx, shapeHPx, trapBotWPx, trapTopWPx, trapHPx, pentWPx, pentHPx, pentIndentXPx);

    // Remove the last horizontal closing segment to open the top.
    // This lets you look inside from above — the BackSide interior mesh then
    // reveals the bottom cap (floor) and inner walls through the open top.
    const points = (() => {
      const n = rawPoints.length;
      if (n < 2) return rawPoints;
      const last = rawPoints[n - 1], prev = rawPoints[n - 2];
      return Math.abs(last.y - prev.y) < 0.001 ? rawPoints.slice(0, n - 1) : rawPoints;
    })();

    const phiLength = Math.max((angle * Math.PI) / 180, 0.001);
    const geo = new THREE.LatheGeometry(points, 64, 0, phiLength);

    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = geo;
    meshInterior.geometry = geo; // 동일 geometry 공유 (별도 dispose 불필요)

    const prev = solidEdgeRef.current;
    const prevH = hiddenEdgeRef.current;
    if (prev) { scene.remove(prev); prev.geometry.dispose(); (prev.material as THREE.Material).dispose(); }
    if (prevH) { scene.remove(prevH); prevH.geometry.dispose(); (prevH.material as THREE.Material).dispose(); }

    const edgesGeo = new THREE.EdgesGeometry(geo, 15);

    const solidEdge = new THREE.LineSegments(
      edgesGeo,
      new THREE.LineBasicMaterial({ color: 0x1b2a4a, opacity: 0.9, transparent: true }),
    );
    solidEdge.renderOrder = 2; // 메시 위에 렌더링
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
    hiddenEdge.renderOrder = 3; // 항상 최상위
    scene.add(hiddenEdge);
    hiddenEdgeRef.current = hiddenEdge;

    // Remove old cap meshes
    const oldCaps = capMeshesRef.current;
    oldCaps.forEach(m => { scene.remove(m); m.geometry.dispose(); });
    capMeshesRef.current = [];

    // Add DoubleSide circular caps for full revolution only
    const capMat = capMaterialRef.current;
    if (capMat && angle >= 360) {
      const capDefs: { y: number; innerR: number; outerR: number }[] = [];

      // Horizontal profile segments → disc or ring caps
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i], p2 = points[i + 1];
        if (Math.abs(p1.y - p2.y) < 0.001) {
          const innerR = Math.min(p1.x, p2.x);
          const outerR = Math.max(p1.x, p2.x);
          if (outerR > 0.001) capDefs.push({ y: p1.y, innerR, outerR });
        }
      }

      // Terminal open ring at the START (bottom) only — top is intentionally open
      const p0 = points[0], p1x = points[1];
      if (p0.x > 0.005 && Math.abs(p0.y - p1x.y) > 0.001) {
        capDefs.push({ y: p0.y, innerR: 0, outerR: p0.x });
      }

      const wfNow = materialRef.current?.wireframe ?? false;
      capDefs.forEach(({ y, innerR, outerR }) => {
        const capGeo = innerR < 0.005
          ? new THREE.CircleGeometry(outerR, 64)
          : new THREE.RingGeometry(innerR, outerR, 64);
        const capMesh = new THREE.Mesh(capGeo, capMat);
        capMesh.rotation.x = -Math.PI / 2;
        capMesh.position.y = y;
        capMesh.renderOrder = 1;
        capMesh.visible = !wfNow;
        scene.add(capMesh);
        capMeshesRef.current.push(capMesh);
      });
    }

    const wf = materialRef.current?.wireframe ?? false;
    solidEdge.visible = !wf;
    hiddenEdge.visible = !wf;
  }, [shape, rotation, offsetPx, angle, shapeWPx, shapeHPx, trapBotWPx, trapTopWPx, trapHPx, pentWPx, pentHPx, pentIndentXPx]);

  // ── Auto-rotate on shape change ──────────────────────────────────────────
  useEffect(() => {
    autoRotateRef.current?.();
  }, [shape]);

  // ── Wireframe update ─────────────────────────────────────────────────────
  useEffect(() => {
    const mat = materialRef.current;
    const matInterior = materialInteriorRef.current;
    if (!mat || !matInterior) return;
    mat.wireframe = wireframe;
    mat.opacity = wireframe ? 0.9 : 0.3;
    mat.needsUpdate = true;
    matInterior.visible = !wireframe; // 와이어프레임 모드에서 내부 메시 숨김
    capMeshesRef.current.forEach(m => { m.visible = !wireframe; });
    if (solidEdgeRef.current) solidEdgeRef.current.visible = !wireframe;
    if (hiddenEdgeRef.current) hiddenEdgeRef.current.visible = !wireframe;
  }, [wireframe]);

  // ── SVG drag — circle-level Pointer Events ───────────────────────────────
  const handleCirclePointerDown = useCallback((e: React.PointerEvent<SVGCircleElement>) => {
    const resizeAttr = e.currentTarget.getAttribute('data-resize');
    if (!resizeAttr) return;
    e.preventDefault();
    type Target = 'shapeW' | 'shapeH' | 'trapBotW' | 'trapTopW' | 'trapH' | 'pentW' | 'pentH' | 'pentIndent';
    const maxW = SVG_W - 12 - AXIS_X - offsetPxRef.current;
    let axis: 'x' | 'y' = 'x';
    let startClient = e.clientX;
    let startSize = 0;
    let yInv = false;
    let target: Target = 'shapeW';
    switch (resizeAttr) {
      case 'w': startSize = shapeWPxRef.current; target = 'shapeW'; break;
      case 'h': axis = 'y'; startClient = e.clientY; startSize = shapeHPxRef.current; yInv = true; target = 'shapeH'; break;
      case 'h-inv': axis = 'y'; startClient = e.clientY; startSize = shapeHPxRef.current; target = 'shapeH'; break;
      case 'trap-bot-w': startSize = trapBotWPxRef.current; target = 'trapBotW'; break;
      case 'trap-top-w': startSize = trapTopWPxRef.current; target = 'trapTopW'; break;
      case 'pent-w': startSize = pentWPxRef.current; target = 'pentW'; break;
      case 'pent-h': axis = 'y'; startClient = e.clientY; startSize = pentHPxRef.current; yInv = true; target = 'pentH'; break;
      case 'pent-h-inv': axis = 'y'; startClient = e.clientY; startSize = pentHPxRef.current; target = 'pentH'; break;
      case 'pent-indent': startSize = pentIndentXPxRef.current; target = 'pentIndent'; break;
    }
    resizeDragState.current = { axis, startClient, startSize, yInv, maxW, target };

    const onMove = (ev: PointerEvent) => {
      const rd = resizeDragState.current;
      if (!rd) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const svgScale = SVG_W / rect.width;
      const rawDelta = rd.axis === 'x'
        ? (ev.clientX - rd.startClient) * svgScale
        : (ev.clientY - rd.startClient) * svgScale;
      const delta = rd.axis === 'y' && rd.yInv ? -rawDelta : rawDelta;
      switch (rd.target) {
        case 'shapeW': setShapeWPx(Math.max(MIN_SHAPE_W, Math.min(rd.maxW, rd.startSize + delta))); break;
        case 'shapeH': setShapeHPx(Math.max(MIN_SHAPE_H, Math.min(MAX_SHAPE_H, rd.startSize + delta))); break;
        case 'trapBotW': setTrapBotWPx(Math.max(MIN_TRAP_W, Math.min(MAX_TRAP_W, rd.startSize + delta))); break;
        case 'trapTopW': setTrapTopWPx(Math.max(MIN_TRAP_W, Math.min(MAX_TRAP_W, rd.startSize + delta))); break;
        case 'trapH': setTrapHPx(Math.max(MIN_SHAPE_H, Math.min(MAX_SHAPE_H, rd.startSize + delta))); break;
        case 'pentW': setPentWPx(Math.max(MIN_SHAPE_W, Math.min(rd.maxW, rd.startSize + delta))); break;
        case 'pentH': setPentHPx(Math.max(MIN_SHAPE_H, Math.min(MAX_SHAPE_H, rd.startSize + delta))); break;
        case 'pentIndent': setPentIndentXPx(Math.max(0, Math.min(pentWPxRef.current - MIN_TRAP_W, rd.startSize + delta))); break;
      }
    };

    const onUp = () => {
      resizeDragState.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────
  // Keep refs in sync so native event handlers always see the latest values
  offsetPxRef.current = offsetPx;
  shapeWPxRef.current = shapeWPx;
  shapeHPxRef.current = shapeHPx;
  trapBotWPxRef.current = trapBotWPx;
  trapTopWPxRef.current = trapTopWPx;
  trapHPxRef.current = trapHPx;
  pentWPxRef.current = pentWPx;
  pentHPxRef.current = pentHPx;
  pentIndentXPxRef.current = pentIndentXPx;
  const isResizable = shape === 'rect' || shape === 'rtriangle' || shape === 'itriangle';
  const wW = isResizable ? shapeWPx / SVG_SCALE : SH_W / SVG_SCALE;
  const rW = isResizable ? shapeHPx / 2 / SVG_SCALE : SH_H / 2 / SVG_SCALE;
  const trapBotWW = trapBotWPx / SVG_SCALE;
  const trapTopWW = trapTopWPx / SVG_SCALE;
  const trapRW = trapHPx / 2 / SVG_SCALE;
  const pentWW = pentWPx / SVG_SCALE;
  const pentRW = pentHPx / 2 / SVG_SCALE;
  const pentIndentXW = pentIndentXPx / SVG_SCALE;
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
    const hW = rW * 2;
    const d = d_svg;

    let verts: [number, number][];

    if (shape === 'rect') {
      verts = [[d, -rW], [d + wW, -rW], [d + wW, rW], [d, rW]];
    } else if (shape === 'rtriangle') {
      if (rotation === 270) {
        const L = Math.sqrt(wW * wW + hW * hW);
        verts = [[d, -L / 2], [d + (wW * hW) / L, (hW * hW - wW * wW) / (2 * L)], [d, L / 2]];
      } else if (rotation === 90) {
        verts = [[d, -rW], [d + wW, rW], [d, rW]];
      } else if (rotation === 180) {
        verts = [[d, -wW / 2], [d + hW, -wW / 2], [d, wW / 2]];
      } else if (rotation === 1) {
        verts = [[d, -rW], [d + wW, rW], [d + wW, -rW]];
      } else {
        verts = [[d, -rW], [d + wW, -rW], [d, rW]];
      }
    } else if (shape === 'itriangle') {
      verts = [[d, -rW], [d + wW, 0], [d, rW]];
    } else if (shape === 'pentagon') {
      verts = [[d, -pentRW], [d + pentWW, -pentRW], [d + pentIndentXW, 0], [d + pentWW, pentRW], [d, pentRW]];
    } else if (shape === 'trapezoid') {
      if (rotation === 90) {
        verts = [[d, trapRW], [d + trapBotWW, 0], [d + trapBotWW, -trapRW], [d, -trapRW]];
      } else if (rotation === 180) {
        verts = [[d, -trapRW], [d + trapTopWW, -trapRW], [d + trapBotWW, trapRW], [d, trapRW]];
      } else {
        verts = [[d, -trapRW], [d + trapBotWW, -trapRW], [d + trapTopWW, trapRW], [d, trapRW]];
      }
    } else {
      return null; // semicircle, circle
    }

    return verts.map(([xw, yw]) => `${toSvgX(xw)},${toSvgY(yw)}`).join(' ');
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* Shape tabs */}
      <div className="grid grid-cols-4 gap-1 bg-white border border-navy/10 rounded-xl p-1 w-full">
        {SHAPES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleShapeChange(key)}
            className={`text-center px-1 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
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
        <div className="w-full md:w-2/5 bg-white rounded-2xl border border-navy/10 p-3 flex flex-col gap-2 min-h-[320px] select-none">
          <div className="flex items-center justify-between min-h-[28px]">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">2D 편집 뷰</p>
            {hasDir && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-navy/50">방향 전환</span>
                <button
                  onClick={cycleDirection}
                  className="px-2.5 py-1 rounded-full bg-navy/6 hover:bg-navy/12 text-navy text-sm transition-colors leading-none"
                >
                  ↻
                </button>
              </div>
            )}
          </div>

          {/* Offset slider */}
          <div className="flex flex-col items-center">
            <input
              type="range"
              min={0}
              max={shape === 'circle' ? CIRCLE_MAX_OFFSET : MAX_OFFSET}
              value={offsetPx}
              onChange={e => setOffsetPx(+e.target.value)}
              className="w-[40%] accent-orange"
            />
            <p className="text-xs text-navy/55 mt-0.5">슬라이더로 도형을 축에 붙이거나 띄워보세요</p>
          </div>

          <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ pointerEvents: 'none' }}>
            <svg
              ref={svgRef}
              width={SVG_W}
              height={SVG_H}
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="select-none touch-pan-y max-w-full"
              style={{ pointerEvents: 'none' }}
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

              {/* Resize handles */}
              {shape === 'rect' && (
                <>
                  <circle cx={shapeLeft + shapeWPx} cy={SVG_CY} r={5} fill="#1B2A4A" data-resize="w" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                  <circle cx={shapeLeft + shapeWPx / 2} cy={SVG_CY - shapeHPx / 2} r={5} fill="#1B2A4A" data-resize="h" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                </>
              )}
              {shape === 'rtriangle' && rotation === 0 && (
                <>
                  <circle cx={shapeLeft + shapeWPx} cy={SVG_CY + shapeHPx / 2} r={5} fill="#1B2A4A" data-resize="w" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                  <circle cx={shapeLeft} cy={SVG_CY - shapeHPx / 2} r={5} fill="#1B2A4A" data-resize="h" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                </>
              )}
              {shape === 'rtriangle' && rotation === 90 && (
                <>
                  <circle cx={shapeLeft + shapeWPx} cy={SVG_CY - shapeHPx / 2} r={5} fill="#1B2A4A" data-resize="w" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                  <circle cx={shapeLeft} cy={SVG_CY + shapeHPx / 2} r={5} fill="#1B2A4A" data-resize="h-inv" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                </>
              )}
              {shape === 'rtriangle' && rotation === 1 && (
                <>
                  <circle cx={shapeLeft + shapeWPx} cy={SVG_CY - shapeHPx / 2} r={5} fill="#1B2A4A" data-resize="w" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                  <circle cx={shapeLeft} cy={SVG_CY + shapeHPx / 2} r={5} fill="#1B2A4A" data-resize="h-inv" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                </>
              )}
              {shape === 'itriangle' && (
                <>
                  <circle cx={shapeLeft + shapeWPx} cy={SVG_CY} r={5} fill="#1B2A4A" data-resize="w" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                  <circle cx={shapeLeft} cy={SVG_CY - shapeHPx / 2} r={5} fill="#1B2A4A" data-resize="h" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                </>
              )}
              {shape === 'trapezoid' && rotation === 0 && (
                <>
                  <circle cx={shapeLeft + trapBotWPx} cy={SVG_CY + trapHPx / 2} r={5} fill="#1B2A4A" data-resize="trap-bot-w" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                  <circle cx={shapeLeft + trapTopWPx} cy={SVG_CY - trapHPx / 2} r={5} fill="#1B2A4A" data-resize="trap-top-w" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                </>
              )}
              {shape === 'trapezoid' && rotation === 180 && (
                <>
                  <circle cx={shapeLeft + trapTopWPx} cy={SVG_CY + trapHPx / 2} r={5} fill="#1B2A4A" data-resize="trap-top-w" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                  <circle cx={shapeLeft + trapBotWPx} cy={SVG_CY - trapHPx / 2} r={5} fill="#1B2A4A" data-resize="trap-bot-w" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                </>
              )}
              {shape === 'trapezoid' && rotation === 90 && (
                <circle cx={shapeLeft + trapBotWPx} cy={SVG_CY + trapHPx / 2} r={5} fill="#1B2A4A" data-resize="trap-bot-w" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
              )}
              {shape === 'pentagon' && (
                <>
                  <circle cx={shapeLeft} cy={SVG_CY - pentHPx / 2} r={5} fill="#1B2A4A" data-resize="pent-h" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                  <circle cx={shapeLeft} cy={SVG_CY + pentHPx / 2} r={5} fill="#1B2A4A" data-resize="pent-h-inv" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                  <circle cx={shapeLeft + pentWPx} cy={SVG_CY - pentHPx / 2} r={5} fill="#1B2A4A" data-resize="pent-w" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                  <circle cx={shapeLeft + pentIndentXPx} cy={SVG_CY} r={5} fill="#1B2A4A" data-resize="pent-indent" className="touch-none" style={{ pointerEvents: 'auto', touchAction: 'none' }} onPointerDown={handleCirclePointerDown} />
                </>
              )}

              {/* Drag hint */}
            </svg>
          </div>
        </div>

        {/* 3D view + name */}
        <div className="w-full md:w-3/5 flex flex-col gap-3">
          <p className="text-xs text-muted break-keep">
            3D 뷰: 드래그로 회전, 스크롤/핀치로 확대·축소합니다.
          </p>
          <div className="relative flex-1" style={{ pointerEvents: 'none' }}>
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
              {playing ? <Pause size={16} /> : <Play size={16} />}
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

    </div>
  );
}
