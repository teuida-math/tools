'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Play, Pause } from 'lucide-react';

// ─── Cube geometry constants ──────────────────────────────────────────────────
const S = 1.2;  // face side length
const H = S / 2; // half-side

// ─── Easing ──────────────────────────────────────────────────────────────────
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ─── Face definitions ─────────────────────────────────────────────────────────
// Each face: cube position/euler (for t=0) → net position/euler (for t=1)
// A PlaneGeometry in default pose lies in XY-plane facing +z.
// Phase [start, end] controls when (in 0–1 progress) the face transitions.
// Layer structure: 위(1) / 옆면(4) / 아래(1), top → sides → bottom
//
// Net layout (cross / 교과서 전개도):
//        [Top]
//  [L] [Front] [R] [Back]
//        [Bot]
const FACE_DEFS = [
  // Front: anchor face — stays at origin throughout (phaseStart=phaseEnd=0)
  {
    id: 'front',
    cube: { p: [0, 0, 0] as [number, number, number],  e: [0, 0, 0] as [number, number, number] },
    net:  { p: [0, 0, 0] as [number, number, number],  e: [0, 0, 0] as [number, number, number] },
    phase: [0, 0] as [number, number],
    color: 0xd6e3f5,
  },
  // Top (위): first to unfold, phase 0 → 1/3
  {
    id: 'top',
    cube: { p: [0, H, -H] as [number, number, number],   e: [-Math.PI / 2, 0, 0] as [number, number, number] },
    net:  { p: [0, S, 0] as [number, number, number],    e: [0, 0, 0] as [number, number, number] },
    phase: [0, 1 / 3] as [number, number],
    color: 0xfde8cc,
  },
  // Left (옆면): phase 1/3 → 2/3
  {
    id: 'left',
    cube: { p: [-H, 0, -H] as [number, number, number],  e: [0, -Math.PI / 2, 0] as [number, number, number] },
    net:  { p: [-S, 0, 0] as [number, number, number],   e: [0, 0, 0] as [number, number, number] },
    phase: [1 / 3, 2 / 3] as [number, number],
    color: 0xd5f0e0,
  },
  // Right (옆면): phase 1/3 → 2/3
  {
    id: 'right',
    cube: { p: [H, 0, -H] as [number, number, number],   e: [0, Math.PI / 2, 0] as [number, number, number] },
    net:  { p: [S, 0, 0] as [number, number, number],    e: [0, 0, 0] as [number, number, number] },
    phase: [1 / 3, 2 / 3] as [number, number],
    color: 0xd5f0e0,
  },
  // Back (옆면): phase 1/3 → 2/3
  {
    id: 'back',
    cube: { p: [0, 0, -S] as [number, number, number],   e: [0, Math.PI, 0] as [number, number, number] },
    net:  { p: [S * 2, 0, 0] as [number, number, number], e: [0, 0, 0] as [number, number, number] },
    phase: [1 / 3, 2 / 3] as [number, number],
    color: 0xeadaf5,
  },
  // Bottom (아래): last to unfold, phase 2/3 → 1
  {
    id: 'bottom',
    cube: { p: [0, -H, -H] as [number, number, number],  e: [Math.PI / 2, 0, 0] as [number, number, number] },
    net:  { p: [0, -S, 0] as [number, number, number],   e: [0, 0, 0] as [number, number, number] },
    phase: [2 / 3, 1] as [number, number],
    color: 0xfde8cc,
  },
] as const;

// ─── Pre-baked quaternion + position cache (avoids per-frame allocations) ─────
interface FaceCache {
  cubePos: THREE.Vector3;
  netPos:  THREE.Vector3;
  cubeQ:   THREE.Quaternion;
  netQ:    THREE.Quaternion;
  ps: number;
  pe: number;
}

// ─── Camera positions ─────────────────────────────────────────────────────────
// t=0 (cube): angled 3D view   t=1 (net): orthogonal front view
const CAM_CUBE  = new THREE.Vector3(4, 3, 5);
const CAM_NET   = new THREE.Vector3(0, 0, 10);
const LOOK_CUBE = new THREE.Vector3(0, 0, 0);   // front-face center
const LOOK_NET  = new THREE.Vector3(0.6, 0, 0); // net bounding-box center
const FOV_CUBE  = 25;
const NET_W = 4.8; // net bounding width  (x: -1.8 to 3.0)
const NET_H = 3.6; // net bounding height (y: -1.8 to 1.8)

// Compute vertical FOV so the flat net fits with ~10% padding at t=1 (cam z=10).
function getNetFov(w: number, h: number): number {
  const camZ = CAM_NET.z;
  const aspect = w / h;
  if (aspect >= NET_W / NET_H) {
    return 2 * Math.atan((NET_H * 0.55) / camZ) * (180 / Math.PI);
  }
  return 2 * Math.atan((NET_W * 0.55) / (camZ * aspect)) * (180 / Math.PI);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PolyhedraNet() {
  const mountRef    = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);   // 0 = cube, 100 = flat net
  const [playing, setPlaying]   = useState(false);

  const groupsRef    = useRef<THREE.Group[]>([]);
  const cacheRef     = useRef<FaceCache[]>([]);
  const frameIdRef   = useRef(0);
  const playRafRef   = useRef(0);
  const progressRef  = useRef(0);

  // ── Update face transforms for a given t ∈ [0, 1] ─────────────────────────
  const updateFaces = (t: number) => {
    cacheRef.current.forEach((fc, i) => {
      const g = groupsRef.current[i];
      if (!g) return;
      const { cubePos, netPos, cubeQ, netQ, ps, pe } = fc;
      const raw = ps === pe ? 0 : (t - ps) / (pe - ps);
      const p   = easeInOut(Math.max(0, Math.min(1, raw)));
      g.position.lerpVectors(cubePos, netPos, p);
      g.quaternion.slerpQuaternions(cubeQ, netQ, p);
    });
  };

  // ── Scene setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV_CUBE, 1, 0.1, 100);
    camera.position.copy(CAM_CUBE);
    camera.lookAt(LOOK_CUBE);

    let initRafId = requestAnimationFrame(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w && h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    });

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dl = new THREE.DirectionalLight(0xffffff, 0.35);
    dl.position.set(3, 5, 5);
    scene.add(dl);

    // Build six face groups
    groupsRef.current = [];
    cacheRef.current  = [];

    FACE_DEFS.forEach(def => {
      const group = new THREE.Group();

      // Filled face (slightly inset so gaps are visible between faces in net)
      const fillGeo = new THREE.PlaneGeometry(S * 0.96, S * 0.96);
      const fillMat = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      group.add(new THREE.Mesh(fillGeo, fillMat));

      // Edge outline at full face size
      const edgesGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(S, S));
      const edgeMat  = new THREE.LineBasicMaterial({ color: 0x1b2a4a, transparent: true, opacity: 0.85 });
      group.add(new THREE.LineSegments(edgesGeo, edgeMat));

      scene.add(group);
      groupsRef.current.push(group);

      const [ps, pe] = def.phase;
      cacheRef.current.push({
        cubePos: new THREE.Vector3(...def.cube.p),
        netPos:  new THREE.Vector3(...def.net.p),
        cubeQ:   new THREE.Quaternion().setFromEuler(new THREE.Euler(...def.cube.e)),
        netQ:    new THREE.Quaternion().setFromEuler(new THREE.Euler(...def.net.e)),
        ps,
        pe,
      });
    });

    updateFaces(0);

    // ResizeObserver keeps renderer/camera in sync whenever the container changes.
    // This also fires on initial observation, correcting any stale initW/initH.
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    });
    ro.observe(el);

    // Reuse vectors to avoid per-frame allocations
    const _camPos  = new THREE.Vector3();
    const _lookPos = new THREE.Vector3();

    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);

      // Lerp camera position, lookAt and FOV based on current progress
      const t = progressRef.current / 100;
      _camPos.lerpVectors(CAM_CUBE, CAM_NET, t);
      camera.position.copy(_camPos);
      _lookPos.lerpVectors(LOOK_CUBE, LOOK_NET, t);
      camera.lookAt(_lookPos);
      camera.fov = FOV_CUBE + (getNetFov(el.clientWidth, el.clientHeight) - FOV_CUBE) * t;
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(initRafId);
      cancelAnimationFrame(frameIdRef.current);
      ro.disconnect();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync faces when progress changes (via slider) ──────────────────────────
  useEffect(() => {
    updateFaces(progress / 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  // ── Play animation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(playRafRef.current);
      return;
    }

    progressRef.current = 0;
    setProgress(0);
    let lastTime = 0;
    const SPEED = 33; // units/s in 0–100 range → full animation ≈ 3 s

    const tick = (time: number) => {
      if (!lastTime) { lastTime = time; playRafRef.current = requestAnimationFrame(tick); return; }
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      progressRef.current = Math.min(100, progressRef.current + dt * SPEED);
      const p = progressRef.current;
      setProgress(p);
      updateFaces(p / 100);
      if (p >= 100) { setPlaying(false); return; }
      playRafRef.current = requestAnimationFrame(tick);
    };

    playRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(playRafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // ── Phase label ────────────────────────────────────────────────────────────
  const phaseLabel = (() => {
    const t = progress / 100;
    if (t <= 0)         return '정육면체';
    if (t < 1 / 3)      return '1단계 · 위면 펼치는 중';
    if (t < 2 / 3)      return '2단계 · 옆면(4개) 펼치는 중';
    if (t < 1)          return '3단계 · 아래면 펼치는 중';
    return '전개도 완성';
  })();

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {/* Three.js canvas — takes all remaining height above slider */}
      <div className="relative flex-1 min-h-0">
        <div ref={mountRef} className="absolute inset-0" style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Slider section — fixed 80px below canvas */}
      <div className="flex-shrink-0 bg-white border-t border-navy/10 px-4 py-2">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-navy">전개도 펼치기</span>
            <button
              onClick={() => {
                if (playing) {
                  setPlaying(false);
                } else {
                  progressRef.current = 0;
                  setProgress(0);
                  setPlaying(true);
                }
              }}
              title={playing ? '일시정지' : '재생'}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                playing
                  ? 'bg-orange text-white'
                  : 'bg-navy/8 text-navy hover:bg-navy/15'
              }`}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
          </div>
          <span className="font-mono text-orange text-lg font-bold leading-none">
            {Math.round(progress)}%
          </span>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={e => {
            setPlaying(false);
            const v = +e.target.value;
            progressRef.current = v;
            setProgress(v);
            updateFaces(v / 100);
          }}
          className="w-full accent-orange"
        />

        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-muted">0% 접힘</span>
          <span className="text-xs font-medium text-navy">{phaseLabel}</span>
          <span className="text-xs text-muted">100% 전개도</span>
        </div>
      </div>
    </div>
  );
}
