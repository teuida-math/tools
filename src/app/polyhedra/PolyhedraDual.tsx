'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const HALF = 1.4;

// BoxGeometry face materialIndex order: +x(0), -x(1), +y(2), -y(3), +z(4), -z(5)
const FACE_CENTERS = [
  new THREE.Vector3( HALF,    0,    0),
  new THREE.Vector3(-HALF,    0,    0),
  new THREE.Vector3(   0,  HALF,    0),
  new THREE.Vector3(   0, -HALF,    0),
  new THREE.Vector3(   0,    0,  HALF),
  new THREE.Vector3(   0,    0, -HALF),
];

// Opposite pairs: 0↔1, 2↔3, 4↔5 — all others are adjacent
function isAdjacent(a: number, b: number) {
  return a !== b && Math.floor(a / 2) !== Math.floor(b / 2);
}

// 8 triangular faces of the octahedron (vertices = cube face centers)
const OCTA_TRIS = [
  [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
  [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5],
];

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  cubeMesh: THREE.Mesh;
  cubeMat: THREE.MeshPhongMaterial;
  faceMeshes: THREE.Mesh[];
  spheres: (THREE.Mesh | null)[];
  edgeLines: THREE.Line[];
  octaMesh: THREE.Mesh | null;
  octaMat: THREE.MeshPhongMaterial | null;
  animating: boolean;
  animStart: number;
  frameId: number;
}

export default function PolyhedraDual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const clickedRef = useRef(new Set<number>());
  const downPos = useRef<{ x: number; y: number } | null>(null); // mousedown position

  const [phase, setPhase] = useState<'view' | 'pick' | 'done'>('view');
  const [count, setCount] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    const W = el.clientWidth  || rect.width  || 400;
    const H = el.clientHeight || rect.height || 400;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0xf0f4f8);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
    camera.position.set(5, 4, 6);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(5, 8, 6);
    scene.add(dir);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3;
    controls.maxDistance = 15;

    const cubeGeo = new THREE.BoxGeometry(HALF * 2, HALF * 2, HALF * 2);
    const cubeMat = new THREE.MeshPhongMaterial({ color: 0xC8D8E8, transparent: true, opacity: 0.7 });
    const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
    scene.add(cubeMesh);
    scene.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(cubeGeo),
      new THREE.LineBasicMaterial({ color: 0x1B2A4A, transparent: true, opacity: 0.4 }),
    ));

    // 6 invisible PlaneGeometry meshes — one per cube face — for reliable raycasting.
    // Each gets userData.faceIndex matching FACE_CENTERS order (0=+x … 5=-z).
    const facePlaneGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2);
    const facePlaneMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const faceMeshes: THREE.Mesh[] = FACE_CENTERS.map((center, i) => {
      const mesh = new THREE.Mesh(facePlaneGeo, facePlaneMat);
      mesh.position.copy(center);
      // Rotate plane normal (default +z) to match face normal (center direction)
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        center.clone().normalize(),
      );
      mesh.userData.faceIndex = i;
      scene.add(mesh);
      return mesh;
    });

    const refs: SceneRefs = {
      renderer, scene, camera, controls, cubeMesh, cubeMat,
      faceMeshes,
      spheres: Array(6).fill(null),
      edgeLines: [],
      octaMesh: null, octaMat: null,
      animating: false, animStart: 0, frameId: 0,
    };
    sceneRef.current = refs;

    function loop() {
      refs.frameId = requestAnimationFrame(loop);
      controls.update();
      if (refs.animating && refs.octaMat) {
        const t = Math.min((performance.now() - refs.animStart) / 800, 1);
        refs.octaMat.opacity = t * 0.4;
        refs.cubeMat.opacity = 0.7 - 0.55 * t;
        if (t >= 1) refs.animating = false;
      }
      renderer.render(scene, camera);
    }
    loop();

    const obs = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    obs.observe(el);

    // Mouse events bypass OrbitControls' setPointerCapture (pointer events only).
    const canvas = renderer.domElement;

    const handleMouseDown = (e: MouseEvent) => {
      downPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e: MouseEvent) => {
      const d = downPos.current;
      downPos.current = null;
      if (!d || phaseRef.current !== 'pick') return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;

      const canvasRect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
        -((e.clientY - canvasRect.top) / canvasRect.height) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, refs.camera);

      const hits = ray.intersectObjects(refs.faceMeshes, false);
      if (!hits.length) return;

      const fi = hits[0].object.userData.faceIndex as number;
      if (clickedRef.current.has(fi)) return;

      clickedRef.current.add(fi);
      const n = clickedRef.current.size;
      setCount(n);

      // Orange sphere at face center
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 16, 12),
        new THREE.MeshPhongMaterial({ color: 0xE8A090 }),
      );
      sphere.position.copy(FACE_CENTERS[fi]);
      refs.scene.add(sphere);
      refs.spheres[fi] = sphere;

      // Rebuild edges between all adjacent clicked face centers
      refs.edgeLines.forEach(l => {
        refs.scene.remove(l);
        (l.geometry as THREE.BufferGeometry).dispose();
      });
      refs.edgeLines.length = 0;
      const arr = [...clickedRef.current];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (!isAdjacent(arr[i], arr[j])) continue;
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([FACE_CENTERS[arr[i]], FACE_CENTERS[arr[j]]]),
            new THREE.LineBasicMaterial({ color: 0xE8A090 }),
          );
          refs.scene.add(line);
          refs.edgeLines.push(line);
        }
      }

      if (n === 6) {
        const positions: number[] = [];
        OCTA_TRIS.forEach(([a, b, c]) => {
          [a, b, c].forEach(i => positions.push(...FACE_CENTERS[i].toArray()));
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.computeVertexNormals();
        const mat = new THREE.MeshPhongMaterial({
          color: 0xA8D8C8, transparent: true, opacity: 0, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        refs.scene.add(mesh);
        refs.octaMesh = mesh;
        refs.octaMat = mat;
        refs.animating = true;
        refs.animStart = performance.now();
        setPhase('done');
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);

    return () => {
      cancelAnimationFrame(refs.frameId);
      obs.disconnect();
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      renderer.dispose();
      if (el.contains(canvas)) el.removeChild(canvas);
    };
  }, []);

  const handleStart = () => {
    setPhase('pick');
    setCount(0);
    clickedRef.current.clear();
  };

  const handleReset = useCallback(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.spheres.forEach(m => { if (m) s.scene.remove(m); });
    s.spheres.fill(null);
    s.edgeLines.forEach(l => {
      s.scene.remove(l);
      (l.geometry as THREE.BufferGeometry).dispose();
    });
    s.edgeLines.length = 0;
    if (s.octaMesh) {
      s.scene.remove(s.octaMesh);
      s.octaMesh.geometry.dispose();
      s.octaMesh = null;
    }
    s.octaMat = null;
    s.animating = false;
    s.cubeMat.opacity = 0.7;
    clickedRef.current.clear();
    setCount(0);
    setPhase('view');
  }, []);

  return (
    <div className="flex flex-col select-none">
      <div
        ref={containerRef}
        style={{ width: '100%', height: '400px' }}
      />
      <div className="flex flex-col items-center gap-2 py-5">
        {phase === 'view' && (
          <button
            onClick={handleStart}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 active:scale-95 transition-all"
          >
            쌍대 만들기
          </button>
        )}
        {phase === 'pick' && (
          <>
            <p className="text-sm text-gray-500">면을 클릭해 중심점을 찍으세요</p>
            <p className="text-base font-semibold text-gray-700">6개 중 {count}개</p>
          </>
        )}
        {phase === 'done' && (
          <>
            <p className="text-base font-semibold text-orange-500">정팔면체가 완성됐어요!</p>
            <p className="text-sm text-gray-500">6개 중 6개</p>
            <button
              onClick={handleReset}
              className="mt-1 px-5 py-2 bg-gray-500 text-white rounded-lg font-medium hover:bg-gray-600 active:scale-95 transition-all"
            >
              처음으로
            </button>
          </>
        )}
      </div>
    </div>
  );
}
