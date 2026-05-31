// Generates one .glb per brick shape used by Color Block Jam so that the
// in-game bricks are loaded as real assets instead of being built from
// THREE primitives at runtime. Run via `npm run build:models` inside the
// example. Exports are baked with a neutral-white material that the view
// tints per block color via MeshStandardMaterial.color.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// GLTFExporter(binary: true) internally constructs a Blob and reads it
// back with FileReader. Node 18+ has Blob; FileReader is missing, so
// shim it with Blob.arrayBuffer().
if (typeof globalThis.self === "undefined") globalThis.self = globalThis;
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class NodeFileReader {
    constructor() {
      this.result = null;
      this.onloadend = null;
    }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (typeof this.onloadend === "function") this.onloadend({ target: this });
      });
    }
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, "..", "assets");

// Must mirror the tuning values in ColorBlockJamConfig so the model
// matches what BoardView expects when placing it in the world.
const CELL_SIZE = 1.0;
const BLOCK_HEIGHT = 0.2;
const BLOCK_MARGIN = 0.04;
const STUD_RADIUS = CELL_SIZE * 0.2;
const STUD_HEIGHT = BLOCK_HEIGHT * 0.55;

// Mirror of SHAPES from src/constants/LevelSchema.ts.
const SHAPES = {
  square1x1: [{ col: 0, row: 0 }],
  rect1x2: [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
  ],
  rect1x3: [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 2, row: 0 },
  ],
  square2x2: [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 0, row: 1 },
    { col: 1, row: 1 },
  ],
  lShape: [
    { col: 0, row: 0 },
    { col: 0, row: 1 },
    { col: 1, row: 1 },
  ],
};

function cellKey(c, r) {
  return `${c},${r}`;
}

/**
 * Walks the boundary of a cell-set and returns the CCW-wound outer
 * polygon. Mirrors `BoardView._computeShapeOutline`.
 */
function computeShapeOutline(shape) {
  const occupied = new Set();
  for (const c of shape) occupied.add(cellKey(c.col, c.row));
  const has = (c, r) => occupied.has(cellKey(c, r));

  const edges = [];
  for (const { col, row } of shape) {
    if (!has(col, row - 1)) edges.push({ fromC: col, fromR: row, toC: col + 1, toR: row });
    if (!has(col + 1, row)) edges.push({ fromC: col + 1, fromR: row, toC: col + 1, toR: row + 1 });
    if (!has(col, row + 1)) edges.push({ fromC: col + 1, fromR: row + 1, toC: col, toR: row + 1 });
    if (!has(col - 1, row)) edges.push({ fromC: col, fromR: row + 1, toC: col, toR: row });
  }
  if (edges.length === 0) return [];
  const byFrom = new Map();
  for (const e of edges) byFrom.set(cellKey(e.fromC, e.fromR), e);

  const result = [];
  const start = edges[0];
  let current = start;
  let guard = 4 * shape.length + 1;
  while (current && guard-- > 0) {
    result.push({ col: current.fromC, row: current.fromR });
    const next = byFrom.get(cellKey(current.toC, current.toR));
    if (!next || next === start) break;
    current = next;
  }
  return result;
}

/**
 * Insets the outline polygon by `margin` cell units. Mirrors
 * `BoardView._insetOutline`.
 */
function insetOutline(shape, margin) {
  const outline = computeShapeOutline(shape);
  const n = outline.length;
  if (n === 0 || margin <= 0) return outline;
  const edgeShifts = [];
  for (let i = 0; i < n; i++) {
    const p = outline[i];
    const q = outline[(i + 1) % n];
    const ndx = Math.sign(q.col - p.col);
    const ndy = Math.sign(q.row - p.row);
    edgeShifts.push({ dx: -ndy * margin, dy: ndx * margin });
  }
  const result = [];
  for (let i = 0; i < n; i++) {
    const prev = edgeShifts[(i - 1 + n) % n];
    const curr = edgeShifts[i];
    const sameDirection = prev.dx === curr.dx && prev.dy === curr.dy;
    const dx = sameDirection ? curr.dx : prev.dx + curr.dx;
    const dy = sameDirection ? curr.dy : prev.dy + curr.dy;
    const v = outline[i];
    result.push({ col: v.col + dx, row: v.row + dy });
  }
  return result;
}

function createBrickBodyGeometry(shape) {
  const outline = insetOutline(shape, BLOCK_MARGIN);
  const points = outline.map((p) => new THREE.Vector2(p.col * CELL_SIZE, p.row * CELL_SIZE));
  const threeShape = new THREE.Shape(points);
  const bevelThickness = Math.min(BLOCK_HEIGHT * 0.45, 0.14);
  const bevelSize = Math.min(CELL_SIZE * 0.11, BLOCK_HEIGHT * 0.6);
  const geometry = new THREE.ExtrudeGeometry(threeShape, {
    depth: BLOCK_HEIGHT,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelOffset: -bevelSize,
    bevelSegments: 6,
    curveSegments: 6,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(-CELL_SIZE * 0.5, BLOCK_HEIGHT, -CELL_SIZE * 0.5);
  return geometry;
}

function createStudGeometry() {
  return new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 32);
}

function buildBrickModel(cells) {
  const root = new THREE.Group();
  root.name = "Brick";

  const material = new THREE.MeshStandardMaterial({
    name: "BrickSurface",
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.5,
  });

  const body = new THREE.Mesh(createBrickBodyGeometry(cells), material);
  body.name = "Body";
  root.add(body);

  const studGeometry = createStudGeometry();
  const studY = BLOCK_HEIGHT + STUD_HEIGHT * 0.5;
  for (const offset of cells) {
    const stud = new THREE.Mesh(studGeometry, material);
    stud.name = `Stud_${offset.col}_${offset.row}`;
    stud.position.set(offset.col * CELL_SIZE, studY, offset.row * CELL_SIZE);
    root.add(stud);
  }

  return root;
}

function exportBinary(object3D) {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      object3D,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error("Expected ArrayBuffer from GLTFExporter binary mode"));
      },
      (error) => reject(error),
      { binary: true },
    );
  });
}

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
  for (const [name, cells] of Object.entries(SHAPES)) {
    const root = buildBrickModel(cells);
    const buffer = await exportBinary(root);
    const filePath = path.join(ASSETS_DIR, `brick-${name}.glb`);
    fs.writeFileSync(filePath, Buffer.from(buffer));
    console.log(`✓ wrote ${path.relative(process.cwd(), filePath)} (${buffer.byteLength} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
