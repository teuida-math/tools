'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* ─── Shape registry ─────────────────────────────────────────────────────── */

type ShapeType = 'cube' | 'rectbox' | 'triprism' | 'frustum' | 'stairs' | 'trapprism';

const SHAPE_LIST: { key: ShapeType; label: string }[] = [
  { key: 'cube',      label: '정육면체' },
  { key: 'rectbox',   label: '직육면체' },
  { key: 'triprism',  label: '삼각기둥' },
  { key: 'frustum',   label: '사각뿔대' },
  { key: 'stairs',    label: '계단형' },
  { key: 'trapprism', label: '사다리꼴기둥' },
];

/* ─── Geometry ───────────────────────────────────────────────────────────── */

const VERTEX_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// Cube — half-size 1, 8 vertices, 12 edges
const CUBE_VERTS: THREE.Vector3[] = (() => {
  const pts: THREE.Vector3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1])
    pts.push(new THREE.Vector3(x, y, z));
  return pts;
})();

const CUBE_EDGES: [number, number][] = (() => {
  const edges: [number, number][] = [];
  for (let i = 0; i < CUBE_VERTS.length; i++)
    for (let j = i + 1; j < CUBE_VERTS.length; j++)
      if (Math.abs(CUBE_VERTS[i].distanceTo(CUBE_VERTS[j]) - 2) < 0.01)
        edges.push([i, j]);
  return edges;
})();

// Rectangular box — 2 : 1.5 : 1 (half-sizes x=1, y=0.75, z=0.5), 8 vertices, 12 edges
const RECT_VERTS: THREE.Vector3[] = (() => {
  const pts: THREE.Vector3[] = [];
  for (const x of [-1, 1]) for (const y of [-0.75, 0.75]) for (const z of [-0.5, 0.5])
    pts.push(new THREE.Vector3(x, y, z));
  return pts;
})();

const RECT_EDGES: [number, number][] = (() => {
  const edges: [number, number][] = [];
  const differs = (a: number, b: number) => Math.abs(a - b) > 1e-6 ? 1 : 0;
  for (let i = 0; i < RECT_VERTS.length; i++)
    for (let j = i + 1; j < RECT_VERTS.length; j++) {
      const a = RECT_VERTS[i], b = RECT_VERTS[j];
      if (differs(a.x, b.x) + differs(a.y, b.y) + differs(a.z, b.z) === 1)
        edges.push([i, j]);
    }
  return edges;
})();

// Triangular prism — regular triangle base (circumradius 1), height 1.5
// Vertices A–F: bottom triangle (y=-0.75) then top triangle (y=0.75)
const R3 = Math.sqrt(3) / 2; // ≈ 0.866
const TRIPRISM_VERTS: THREE.Vector3[] = [
  new THREE.Vector3(0,    -0.75,  1),    // A bottom-front
  new THREE.Vector3(-R3,  -0.75, -0.5),  // B bottom-left
  new THREE.Vector3( R3,  -0.75, -0.5),  // C bottom-right
  new THREE.Vector3(0,     0.75,  1),    // D top-front
  new THREE.Vector3(-R3,   0.75, -0.5),  // E top-left
  new THREE.Vector3( R3,   0.75, -0.5),  // F top-right
];

const TRIPRISM_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 0], // bottom triangle
  [3, 4], [4, 5], [5, 3], // top triangle
  [0, 3], [1, 4], [2, 5], // vertical edges
];

// Frustum (사각뿔대) — bottom square + smaller top square, 8 vertices, 12 edges
const FRUSTUM_VERTS: THREE.Vector3[] = [
  new THREE.Vector3(-1,   -0.75, -1),    // A
  new THREE.Vector3( 1,   -0.75, -1),    // B
  new THREE.Vector3( 1,   -0.75,  1),    // C
  new THREE.Vector3(-1,   -0.75,  1),    // D
  new THREE.Vector3(-0.5,  0.75, -0.5),  // E
  new THREE.Vector3( 0.5,  0.75, -0.5),  // F
  new THREE.Vector3( 0.5,  0.75,  0.5),  // G
  new THREE.Vector3(-0.5,  0.75,  0.5),  // H
];

const FRUSTUM_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0], // bottom square
  [4, 5], [5, 6], [6, 7], [7, 4], // top square
  [0, 4], [1, 5], [2, 6], [3, 7], // lateral
];

// Stairs (계단형) — L-shape extrusion, 12 vertices, 18 edges
const STAIRS_VERTS: THREE.Vector3[] = [
  new THREE.Vector3(-1, -0.75,  0.75), // A
  new THREE.Vector3( 1, -0.75,  0.75), // B
  new THREE.Vector3( 1,  0,     0.75), // C
  new THREE.Vector3( 0,  0,     0.75), // D
  new THREE.Vector3( 0,  0.75,  0.75), // E
  new THREE.Vector3(-1,  0.75,  0.75), // F
  new THREE.Vector3(-1, -0.75, -0.75), // G
  new THREE.Vector3( 1, -0.75, -0.75), // H
  new THREE.Vector3( 1,  0,    -0.75), // I
  new THREE.Vector3( 0,  0,    -0.75), // J
  new THREE.Vector3( 0,  0.75, -0.75), // K
  new THREE.Vector3(-1,  0.75, -0.75), // L
];

const STAIRS_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],   // front L-face
  [6, 7], [7, 8], [8, 9], [9,10], [10,11], [11, 6],  // back L-face
  [0, 6], [1, 7], [2, 8], [3, 9], [4,10], [5,11],    // lateral
];

// Trapezoid prism (사다리꼴기둥) — trapezoidal top/bottom faces, 8 vertices, 12 edges
// Bottom trapezoid (y=-0.75): long side AB at z=-0.75, short side DC at z=0.5
// Top trapezoid (y=+0.75): congruent, directly above — right prism
const TRAPPRISM_VERTS: THREE.Vector3[] = [
  new THREE.Vector3(-1,   -0.75, -0.75), // A — bottom long-left
  new THREE.Vector3( 1,   -0.75, -0.75), // B — bottom long-right
  new THREE.Vector3( 0.5, -0.75,  0.5),  // C — bottom short-right
  new THREE.Vector3(-0.5, -0.75,  0.5),  // D — bottom short-left
  new THREE.Vector3(-1,    0.75, -0.75), // E — top long-left
  new THREE.Vector3( 1,    0.75, -0.75), // F — top long-right
  new THREE.Vector3( 0.5,  0.75,  0.5),  // G — top short-right
  new THREE.Vector3(-0.5,  0.75,  0.5),  // H — top short-left
];

const TRAPPRISM_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0], // bottom trapezoid
  [4, 5], [5, 6], [6, 7], [7, 4], // top trapezoid
  [0, 4], [1, 5], [2, 6], [3, 7], // lateral (vertical)
];

/* ─── Shape data accessor ────────────────────────────────────────────────── */

function getShapeData(shape: ShapeType) {
  if (shape === 'rectbox')   return { verts: RECT_VERTS,      edges: RECT_EDGES };
  if (shape === 'triprism')  return { verts: TRIPRISM_VERTS,  edges: TRIPRISM_EDGES };
  if (shape === 'frustum')   return { verts: FRUSTUM_VERTS,   edges: FRUSTUM_EDGES };
  if (shape === 'stairs')    return { verts: STAIRS_VERTS,    edges: STAIRS_EDGES };
  if (shape === 'trapprism') return { verts: TRAPPRISM_VERTS, edges: TRAPPRISM_EDGES };
  return { verts: CUBE_VERTS, edges: CUBE_EDGES };
}

function buildCustomMesh(verts: THREE.Vector3[], idx: number[]): THREE.Mesh {
  const positions = idx.flatMap(i => verts[i].toArray());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    color: 0x1b2a4a, transparent: true, opacity: 0.05, side: THREE.DoubleSide,
  }));
}

function buildFaceMesh(shape: ShapeType): THREE.Mesh {
  const mat = new THREE.MeshPhongMaterial({ color: 0x1b2a4a, transparent: true, opacity: 0.05 });
  if (shape === 'rectbox') return new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 1), mat);

  if (shape === 'triprism') {
    return buildCustomMesh(TRIPRISM_VERTS, [
      0, 1, 2,
      3, 5, 4,
      0, 3, 4,  0, 4, 1,
      1, 4, 5,  1, 5, 2,
      2, 5, 3,  2, 3, 0,
    ]);
  }

  if (shape === 'frustum') {
    return buildCustomMesh(FRUSTUM_VERTS, [
      0, 1, 2,  0, 2, 3,        // bottom
      4, 6, 5,  4, 7, 6,        // top (reversed winding)
      0, 1, 5,  0, 5, 4,        // side AB-EF
      1, 2, 6,  1, 6, 5,        // side BC-FG
      2, 3, 7,  2, 7, 6,        // side CD-GH
      3, 0, 4,  3, 4, 7,        // side DA-HE
    ]);
  }

  if (shape === 'stairs') {
    return buildCustomMesh(STAIRS_VERTS, [
      // front L-face (fan from vertex 0)
      0, 1, 2,  0, 2, 3,  0, 3, 4,  0, 4, 5,
      // back L-face (reversed)
      6, 8, 7,  6, 9, 8,  6, 10, 9,  6, 11, 10,
      // lateral rectangles
      0, 1, 7,  0, 7, 6,
      1, 2, 8,  1, 8, 7,
      2, 3, 9,  2, 9, 8,
      3, 4, 10, 3, 10, 9,
      4, 5, 11, 4, 11, 10,
      5, 0, 6,  5, 6, 11,
    ]);
  }

  if (shape === 'trapprism') {
    return buildCustomMesh(TRAPPRISM_VERTS, [
      0, 1, 2,  0, 2, 3,  // bottom trapezoid
      4, 6, 5,  4, 7, 6,  // top trapezoid (reversed winding)
      0, 1, 5,  0, 5, 4,  // back rect (long side AB-EF)
      3, 2, 6,  3, 6, 7,  // front rect (short side DC-HG)
      0, 3, 7,  0, 7, 4,  // left rect (leg AD-EH)
      1, 5, 6,  1, 6, 2,  // right rect (leg BF-GC)
    ]);
  }

  return new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
}

/* ─── Line relationship classifier ──────────────────────────────────────── */

type Relation = '한 점에서 만난다' | '평행' | '꼬인 위치' | '일치';

interface ClassifyResult {
  relation: Relation;
  description: string;
}

function classifyLines(
  verts: THREE.Vector3[],
  eA: [number, number],
  eB: [number, number],
): ClassifyResult {
  const dA = verts[eA[1]].clone().sub(verts[eA[0]]);
  const dB = verts[eB[1]].clone().sub(verts[eB[0]]);
  const w  = verts[eB[0]].clone().sub(verts[eA[0]]);

  const cross    = new THREE.Vector3().crossVectors(dA, dB);
  const crossLen = cross.length();

  if (crossLen < 1e-6) {
    if (new THREE.Vector3().crossVectors(w, dA).length() < 1e-6) {
      return { relation: '일치', description: '두 직선이 완전히 겹칩니다.' };
    }
    return {
      relation: '평행',
      description: '방향이 같고 아무리 연장해도 만나지 않습니다.',
    };
  }

  if (Math.abs(w.dot(cross)) / crossLen < 1e-4) {
    return {
      relation: '한 점에서 만난다',
      description: '같은 평면 위에 있고 연장하면 한 점에서 교차합니다.',
    };
  }

  return {
    relation: '꼬인 위치',
    description: '평행하지도 않고, 만나지도 않습니다. 어느 한 평면에도 함께 놓이지 않아요.',
  };
}

/* ─── Scene helpers ──────────────────────────────────────────────────────── */

function makeEdgeCylinder(
  v0: THREE.Vector3,
  v1: THREE.Vector3,
  radius: number,
  color: number,
): THREE.Mesh {
  const dir = v1.clone().sub(v0);
  const len = dir.length();
  const mid = v0.clone().add(v1).multiplyScalar(0.5);

  const geo = new THREE.CylinderGeometry(radius, radius, len, 8, 1);
  const mat = new THREE.MeshPhongMaterial({ color, shininess: 60 });
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

function makeVertexLabel(text: string, pos: THREE.Vector3): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = '#1B2A4A';
  ctx.font = 'bold 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(0.35, 0.35, 1);
  sprite.position.copy(pos).multiplyScalar(1.25);
  sprite.renderOrder = 10;
  return sprite;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function LineRelationsExplorer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [shape, setShape]       = useState<ShapeType>('cube');
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult]     = useState<ClassifyResult | null>(null);

  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef      = useRef<THREE.Scene | null>(null);
  const cameraRef     = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef   = useRef<OrbitControls | null>(null);
  const edgeMeshesRef = useRef<THREE.Mesh[]>([]);
  const frameIdRef    = useRef(0);
  const selectedRef   = useRef<number[]>([]);
  const shapeRef      = useRef<ShapeType>('cube');

  /* ── Sync shapeRef + reset selection when shape changes ── */
  useEffect(() => {
    shapeRef.current = shape;
    setSelected([]);
  }, [shape]);

  /* ── Scene setup — re-runs on shape change ── */
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const isMobile   = window.innerWidth < 768;
    const edgeRadius = isMobile ? 0.04 : 0.025;
    const { verts, edges } = getShapeData(shape);

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
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(4, 6, 4);
    scene.add(dirLight);

    const grid = new THREE.GridHelper(5, 10, 0x8b97ac, 0x8b97ac);
    (grid.material as THREE.Material).opacity = 0.15;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    scene.add(buildFaceMesh(shape));

    verts.forEach((pt, i) => {
      const r = isMobile ? 0.07 : 0.05;
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(r, 12, 12),
        new THREE.MeshPhongMaterial({ color: 0xf2b544, shininess: 80 }),
      );
      sphere.position.copy(pt);
      scene.add(sphere);
      scene.add(makeVertexLabel(VERTEX_LABELS[i], pt));
    });

    const edgeMeshes: THREE.Mesh[] = [];
    edges.forEach(([vi, vj], edgeIdx) => {
      const mesh = makeEdgeCylinder(verts[vi], verts[vj], edgeRadius, 0x8b97ac);
      mesh.userData.edgeIdx = edgeIdx;
      scene.add(mesh);
      edgeMeshes.push(mesh);
    });
    edgeMeshesRef.current = edgeMeshes;

    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);

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
      if (dx * dx + dy * dy > (isMobile ? 64 : 16)) dragged = true;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(edgeMeshes);
      renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'default';
    };

    const onPointerUp = (e: PointerEvent) => {
      if (dragged) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(edgeMeshes);
      if (hits.length === 0) return;

      const edgeIdx = hits[0].object.userData.edgeIdx as number;
      setSelected(prev => {
        let next: number[];
        if (prev.includes(edgeIdx)) {
          next = prev.filter(i => i !== edgeIdx);
        } else if (prev.length < 2) {
          next = [...prev, edgeIdx];
        } else {
          next = [prev[1], edgeIdx];
        }
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
  }, [shape]);

  /* ── Update edge colors + result when selection changes ── */
  useEffect(() => {
    selectedRef.current = selected;
    const { verts, edges } = getShapeData(shapeRef.current);

    edgeMeshesRef.current.forEach((mesh, i) => {
      const mat = mesh.material as THREE.MeshPhongMaterial;
      if (selected.includes(i)) {
        mat.color.set(0xe8650a);
        mat.emissive.set(0x3a1500);
      } else if (selected.length === 2) {
        mat.color.set(0xbdc7d4);
        mat.emissive.set(0x000000);
      } else {
        mat.color.set(0x8b97ac);
        mat.emissive.set(0x000000);
      }
    });

    if (selected.length === 2) {
      setResult(classifyLines(verts, edges[selected[0]], edges[selected[1]]));
    } else {
      setResult(null);
    }
  }, [selected]);

  const handleReset = () => setSelected([]);

  const edgeLabel = (idx: number) => {
    const { edges } = getShapeData(shapeRef.current);
    const [i, j] = edges[idx];
    return `모서리 ${VERTEX_LABELS[i]}${VERTEX_LABELS[j]}`;
  };

  const { edges } = getShapeData(shape);


  return (
    <div className="flex flex-col gap-4">
      {/* Shape selector */}
      <div className="grid grid-cols-3 gap-1 bg-white border border-navy/10 rounded-xl p-1 w-full">
        {SHAPE_LIST.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setShape(key)}
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

      {/* Main layout */}
      <div className="flex flex-col md:flex-row gap-4 md:items-stretch">
        <div
          ref={mountRef}
          className="w-full md:flex-1 md:min-w-0 aspect-square md:aspect-auto md:h-[440px] bg-white rounded-2xl border border-navy/10 overflow-hidden"
        />

        {/* Result panel */}
        <div className="w-full md:w-60 md:flex-shrink-0 bg-white rounded-2xl border border-navy/10 p-5 flex flex-col gap-4">
          <p className="text-xs font-semibold text-navy uppercase tracking-widest">위치 관계</p>

          <div className="flex flex-col gap-2">
            {[0, 1].map(slot => (
              <div
                key={slot}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-sm transition-colors ${
                  selected[slot] !== undefined
                    ? 'border-orange/40 bg-orange/5 text-navy font-semibold'
                    : 'border-navy/10 bg-paper text-muted'
                }`}
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                    selected[slot] !== undefined ? 'bg-orange' : 'bg-navy/20'
                  }`}
                />
                {selected[slot] !== undefined
                  ? edgeLabel(selected[slot])
                  : `직선 ${slot + 1} 선택 전`}
              </div>
            ))}
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-2">
            {result ? (
              <>
                <span className="inline-block px-4 py-1.5 rounded-full border text-sm font-bold bg-orange/10 text-orange border-orange/30">
                  {result.relation}
                </span>
                <p className="text-xs text-muted text-center leading-relaxed break-keep">
                  {result.description}
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2.5 text-center">
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-navy/15 flex items-center justify-center text-xl text-navy/20">
                  ↔
                </div>
                <p className="text-xs text-muted leading-relaxed break-keep">
                  {selected.length === 0
                    ? '모서리 두 개를\n클릭해 선택하세요'
                    : '모서리를 하나 더\n선택하세요'}
                </p>
              </div>
            )}
          </div>
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
            {selected.length === 1
              ? '1개 선택 — 하나 더 클릭하세요'
              : `${edgeLabel(selected[0])}  ↔  ${edgeLabel(selected[1])}`}
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-gold" />
          꼭짓점 A–H
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-1.5 rounded bg-navy" />
          모서리 ({edges.length}개)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-1.5 rounded bg-orange" />
          선택된 모서리
        </span>
      </div>

      <p className="text-xs text-muted leading-relaxed break-keep">
        모서리를 클릭해 두 개 선택하면 두 직선의 위치 관계를 자동으로 판별합니다. 세 번째 모서리를 클릭하면 첫 번째 선택이 교체됩니다. 드래그로 회전, 스크롤로 확대·축소.
      </p>
    </div>
  );
}
