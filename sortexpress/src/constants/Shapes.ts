import * as THREE from "three";

/**
 * The distinct object types the player sorts. Each is a simple 3D primitive
 * with its own silhouette; the per-kind color lives in the config so it can be
 * tuned without touching geometry.
 */
export enum ShapeKind {
  Cube = "cube",
  Cylinder = "cylinder",
  Sphere = "sphere",
  Cone = "cone",
  Pyramid = "pyramid", // square pyramid
  TriPrism = "triPrism", // triangular prism
  HexPrism = "hexPrism", // hexagonal prism
  Octahedron = "octahedron", // diamond
  Torus = "torus", // donut ring
  Capsule = "capsule", // pill
}

/** Stable order (index ↔ kind) — used to cycle kinds + index the color list. */
export const SHAPE_KINDS: readonly ShapeKind[] = [
  ShapeKind.Cube,
  ShapeKind.Cylinder,
  ShapeKind.Sphere,
  ShapeKind.Cone,
  ShapeKind.Torus,
  ShapeKind.Capsule,
];

/** One-character code per kind — for authoring fixed levels compactly (a layer
 * is a string like "CCY", `.` = empty gap). */
export const SHAPE_CODE: Record<ShapeKind, string> = {
  [ShapeKind.Cube]: "C",
  [ShapeKind.Cylinder]: "Y",
  [ShapeKind.Sphere]: "S",
  [ShapeKind.Cone]: "O",
  [ShapeKind.Pyramid]: "P",
  [ShapeKind.TriPrism]: "T",
  [ShapeKind.HexPrism]: "H",
  [ShapeKind.Octahedron]: "D",
  [ShapeKind.Torus]: "R",
  [ShapeKind.Capsule]: "A",
};

const CODE_TO_KIND: Record<string, ShapeKind> = Object.fromEntries(
  SHAPE_KINDS.map((k) => [SHAPE_CODE[k], k]),
) as Record<string, ShapeKind>;

/** Map a level code char to a kind; `.`/space/unknown → null (empty gap). */
export function codeToKind(ch: string): ShapeKind | null {
  return CODE_TO_KIND[ch] ?? null;
}

/**
 * Build the geometry for a kind, normalized to a COMMON height (Y = 1) and
 * centered on the origin. Different primitives have different intrinsic sizes
 * (a sphere ≈ 1.2, an octahedron ≈ 1.44 tall, …); scaling each so its height is
 * exactly 1 means that — seated base-on-floor — every shape lines up at the same
 * base + top level, so the front row reads evenly regardless of kind.
 */
export function createShapeGeometry(kind: ShapeKind): THREE.BufferGeometry {
  const geo = rawShapeGeometry(kind);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const height = bb.max.y - bb.min.y || 1;
  geo.scale(1 / height, 1 / height, 1 / height); // uniform → normalize height to 1
  geo.center(); // centre the bbox on the origin (bottomExtent = 0.5 for every kind)
  return geo;
}

/** Raw (un-normalized) primitive per kind — sizes differ; createShapeGeometry
 * normalizes them to a common height. */
function rawShapeGeometry(kind: ShapeKind): THREE.BufferGeometry {
  switch (kind) {
    case ShapeKind.Cube:
      return new THREE.BoxGeometry(1, 1, 1);
    case ShapeKind.Cylinder:
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    case ShapeKind.Sphere:
      return new THREE.SphereGeometry(0.6, 32, 20);
    case ShapeKind.Cone:
      return new THREE.ConeGeometry(0.6, 1.1, 32);
    case ShapeKind.Pyramid:
      // 4-sided cone = square pyramid; nudge rotation so a flat face reads front.
      return new THREE.ConeGeometry(0.72, 1.1, 4).rotateY(Math.PI / 4);
    case ShapeKind.TriPrism:
      // 3 radial segments = triangular prism laid on its side (rotate to stand).
      return new THREE.CylinderGeometry(0.66, 0.66, 1, 3).rotateY(Math.PI / 6);
    case ShapeKind.HexPrism:
      return new THREE.CylinderGeometry(0.58, 0.58, 1, 6);
    case ShapeKind.Octahedron:
      return new THREE.OctahedronGeometry(0.72);
    case ShapeKind.Torus:
      return new THREE.TorusGeometry(0.42, 0.2, 20, 36);
    case ShapeKind.Capsule:
      return new THREE.CapsuleGeometry(0.34, 0.55, 12, 20);
  }
}
