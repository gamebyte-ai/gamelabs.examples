import * as THREE from "three";
import type { IPile } from "../models/IPile";
import type { SlotType } from "../constants/SlotType";

export interface SlotPalette {
  readonly fill: number;
  readonly outline: number;
}

export interface SlotObjectOptions {
  readonly pile: IPile;
  readonly width: number;
  readonly height: number;
  readonly palette: SlotPalette;
}

/**
 * Visual for a single board pile slot — a flat rectangle on the XZ
 * plane with a coloured fill, outline, and a text label naming the
 * pile's type. Holds no game logic; the fill mesh's userData carries
 * the pile reference so the view can identify drop targets by raycast.
 */
export class SlotObject extends THREE.Group {
  public readonly pile: IPile;

  private readonly _fillMesh: THREE.Mesh;
  private readonly _outline: THREE.LineSegments;
  private readonly _label: THREE.Sprite;
  private readonly _labelTexture: THREE.CanvasTexture;

  public constructor(options: SlotObjectOptions) {
    super();
    this.pile = options.pile;
    this.name = `Slot(${options.pile.type})`;

    const halfW = options.width / 2;
    const halfH = options.height / 2;

    const fillGeometry = new THREE.PlaneGeometry(options.width, options.height);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: options.palette.fill,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    this._fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
    this._fillMesh.rotation.x = -Math.PI / 2;
    this._fillMesh.userData = { pile: options.pile };
    this.add(this._fillMesh);

    const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfW, 0.001, -halfH),
      new THREE.Vector3(halfW, 0.001, -halfH),
      new THREE.Vector3(halfW, 0.001, -halfH),
      new THREE.Vector3(halfW, 0.001, halfH),
      new THREE.Vector3(halfW, 0.001, halfH),
      new THREE.Vector3(-halfW, 0.001, halfH),
      new THREE.Vector3(-halfW, 0.001, halfH),
      new THREE.Vector3(-halfW, 0.001, -halfH),
    ]);
    const outlineMaterial = new THREE.LineBasicMaterial({ color: options.palette.outline });
    this._outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
    this.add(this._outline);

    const { texture, aspect } = SlotObject.createLabelTexture(options.pile.type, options.palette.outline);
    this._labelTexture = texture;
    const labelMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    this._label = new THREE.Sprite(labelMaterial);
    const labelWidth = options.width * 0.7;
    this._label.scale.set(labelWidth, labelWidth / aspect, 1);
    this._label.position.set(0, 0.01, 0);
    this.add(this._label);
  }

  public get fillMesh(): THREE.Mesh {
    return this._fillMesh;
  }

  public dispose(): void {
    this._fillMesh.geometry.dispose();
    (this._fillMesh.material as THREE.Material).dispose();
    this._outline.geometry.dispose();
    (this._outline.material as THREE.Material).dispose();
    this._labelTexture.dispose();
    (this._label.material as THREE.Material).dispose();
  }

  private static createLabelTexture(type: SlotType, colorHex: number): { texture: THREE.CanvasTexture; aspect: number } {
    const text = type.toUpperCase();
    const fontSize = 64;
    const padding = 16;

    const measureCanvas = document.createElement("canvas");
    const measureCtx = measureCanvas.getContext("2d");
    if (!measureCtx) throw new Error("SlotObject: could not get 2d canvas context");
    measureCtx.font = `bold ${fontSize}px sans-serif`;
    const metrics = measureCtx.measureText(text);
    const textWidth = Math.ceil(metrics.width);

    const canvas = document.createElement("canvas");
    canvas.width = textWidth + padding * 2;
    canvas.height = fontSize + padding * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("SlotObject: could not get 2d canvas context");

    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `#${colorHex.toString(16).padStart(6, "0")}`;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return { texture, aspect: canvas.width / canvas.height };
  }
}
