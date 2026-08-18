import { ShapeKind, SHAPE_KINDS, codeToKind } from "../constants/Shapes";

/** A placed item: its shape `kind` + which colour `variant` (0..variants-1). Two
 * items match only if BOTH kind and variant are equal, so each shape's colours are
 * distinct matchable items. */
export interface ItemSpec {
  kind: ShapeKind;
  variant: number;
}

/** One slot on a layer: an item, or null for an empty gap. */
export type Slot = ItemSpec | null;
/** A layer = a fixed row of `slotsPerLayer` slots (some may be empty gaps). */
export type Layer = Slot[];

/**
 * One cabinet compartment: a STACK of layers along depth. `layers[0]` is the
 * FRONT (interactive) layer; deeper layers are hidden behind it and only slide
 * forward once the layer in front of them is cleared.
 */
export interface BoardCell {
  readonly col: number;
  readonly row: number;
  /** Front → back. Front is index 0. */
  layers: Layer[];
}

export interface BoardOptions {
  cols: number;
  rows: number;
  layersPerCell: number;
  slotsPerLayer: number;
  /** Random object count placed on each layer (the rest are gaps). */
  minPerLayer: number;
  maxPerLayer: number;
  /** Which object kinds to draw from when generating (defaults to all). */
  kinds?: readonly ShapeKind[];
  /** How many colour variants each kind has (each is a distinct matchable item).
   * Default 2. */
  variants?: number;
  /** How many complete sets (each `slotsPerLayer` items) of EACH kind to scatter
   * across the board when generating. Total per kind = setsPerKind × slotsPerLayer.
   * When > 0, generation distributes exactly these instead of the per-layer
   * `min/maxPerLayer` random fill. */
  setsPerKind?: number;
  /** FIXED level: one entry per cell (row-major), each a list of layer code
   * strings front→back (e.g. `["CCY", "S.S"]`). When present (non-empty), the
   * board is built from it verbatim instead of generated. */
  level?: readonly (readonly string[])[];
}

/**
 * The board's logical state: a `cols × rows` grid of {@link BoardCell}s, each a
 * stack of randomly-filled layers. Rendering + interaction read this; matching
 * and layer-advance mutate it.
 */
export class BoardModel {
  public readonly cols: number;
  public readonly rows: number;
  public readonly slotsPerLayer: number;
  public readonly cells: BoardCell[] = [];

  public constructor(opts: BoardOptions) {
    this.cols = Math.max(1, Math.floor(opts.cols));
    this.rows = Math.max(1, Math.floor(opts.rows));
    this.slotsPerLayer = Math.max(1, Math.floor(opts.slotsPerLayer));
    const kinds = opts.kinds ?? SHAPE_KINDS;
    const layersPerCell = Math.max(1, Math.floor(opts.layersPerCell));
    const min = Math.max(0, Math.min(this.slotsPerLayer, Math.floor(opts.minPerLayer)));
    const max = Math.max(min, Math.min(this.slotsPerLayer, Math.floor(opts.maxPerLayer)));
    const fixed = opts.level && opts.level.length > 0 ? opts.level : null;
    const setsPerKind = Math.max(0, Math.floor(opts.setsPerKind ?? 0));
    const variants = Math.max(1, Math.floor(opts.variants ?? 2));

    if (fixed) {
      // Fixed level: parse each cell's layer code strings (row-major index).
      for (let row = 0; row < this.rows; row++) {
        for (let col = 0; col < this.cols; col++) {
          const spec = fixed[row * this.cols + col] ?? [];
          this.cells.push({ col, row, layers: spec.map((s) => this._parseLayer(s)) });
        }
      }
      return;
    }

    if (setsPerKind > 0) {
      // Scatter `setsPerKind` complete sets of each (kind, variant) across the board.
      this._generateBySets(kinds, variants, setsPerKind, min, max, layersPerCell);
    } else {
      // Fallback: per-layer random fill.
      for (let row = 0; row < this.rows; row++) {
        for (let col = 0; col < this.cols; col++) {
          const layers: Layer[] = [];
          for (let l = 0; l < layersPerCell; l++) layers.push(this._randomLayer(min, max, kinds, variants));
          this.cells.push({ col, row, layers });
        }
      }
    }

    // Settle generated items FORWARD per column so none sit behind an empty front
    // slot (fixed levels are authored verbatim above and returned before this).
    this._compactColumnsForward();
    // Compaction can accidentally fill a layer with 3-of-a-kind (a pre-made match);
    // break any such layer so the board never starts with a free match.
    this._breakPremadeMatches();
  }

  /** True when `layer` is FULL and every slot is the same (kind, variant) — a
   * complete 3-of-a-kind (would pop as a match). */
  private _isCompleteMatch(layer: Layer): boolean {
    if (layer.length !== this.slotsPerLayer) return false;
    const first = layer[0];
    if (!first) return false;
    return layer.every((s) => s !== null && s.kind === first.kind && s.variant === first.variant);
  }

  /** Would placing `item` at `layer[si]` make the whole layer a complete match? */
  private _wouldComplete(layer: Layer, si: number, item: ItemSpec): boolean {
    if (layer.length !== this.slotsPerLayer) return false;
    for (let i = 0; i < layer.length; i++) {
      const s = i === si ? item : layer[i];
      if (!s || s.kind !== item.kind || s.variant !== item.variant) return false;
    }
    return true;
  }

  /**
   * Break any layer that generated as a complete 3-of-a-kind: swap one of its
   * items with a DIFFERENT item elsewhere on the board whose swap won't create a
   * new match there. Swaps only ever exchange two FILLED slots, so per-kind counts
   * (solvability) and the forward-compaction invariant are both preserved.
   */
  private _breakPremadeMatches(): void {
    const filled: { layer: Layer; si: number }[] = [];
    for (const cell of this.cells)
      for (const layer of cell.layers)
        for (let si = 0; si < layer.length; si++) if (layer[si]) filled.push({ layer, si });

    const cap = filled.length * 2 + 16; // convergence backstop
    for (let pass = 0; pass < cap; pass++) {
      let changed = false;
      for (const cell of this.cells) {
        for (const layer of cell.layers) {
          if (!this._isCompleteMatch(layer)) continue;
          const m = layer[0]!;
          const donor = filled.find(({ layer: dl, si }) => {
            if (dl === layer) return false;
            const it = dl[si]!;
            if (it.kind === m.kind && it.variant === m.variant) return false; // same item is useless
            return !this._wouldComplete(dl, si, m); // moving m here must not make a new match
          });
          if (!donor) continue;
          const tmp = donor.layer[donor.si];
          donor.layer[donor.si] = layer[0];
          layer[0] = tmp;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  /**
   * Per slot-COLUMN in each cell, pull items toward the FRONT layer so no item
   * sits behind an empty front slot in the same column (visual gravity toward the
   * cabinet opening). Trailing layers left entirely empty are dropped.
   */
  private _compactColumnsForward(): void {
    for (const cell of this.cells) {
      const depth = cell.layers.length;
      if (depth === 0) continue;
      for (let si = 0; si < this.slotsPerLayer; si++) {
        const column: ItemSpec[] = [];
        for (let li = 0; li < depth; li++) {
          const item = cell.layers[li][si];
          if (item) column.push(item);
        }
        for (let li = 0; li < depth; li++) cell.layers[li][si] = li < column.length ? column[li] : null;
      }
      while (cell.layers.length > 0 && cell.layers[cell.layers.length - 1].every((s) => s === null)) {
        cell.layers.pop();
      }
    }
  }

  /**
   * Generate a solvable board by SCATTERING items: build a bag of `setsPerKind`
   * complete sets (`slotsPerLayer` each) per kind, shuffle it, and drop the items
   * into random layer-slots across every cell. Each layer is capped at a random
   * `min..max` (< slotsPerLayer) so no layer is a pre-made full set and every one
   * keeps a gap for dragging. Layers left empty are dropped; a cell's remaining
   * layers keep their front→back order (first filled = front).
   */
  private _generateBySets(
    kinds: readonly ShapeKind[],
    variants: number,
    setsPerKind: number,
    min: number,
    max: number,
    layersPerCell: number,
  ): void {
    // 1. Item bag: setsPerKind × slotsPerLayer of each (kind, variant).
    const bag: ItemSpec[] = [];
    for (const k of kinds)
      for (let v = 0; v < variants; v++)
        for (let i = 0; i < setsPerKind * this.slotsPerLayer; i++) bag.push({ kind: k, variant: v });
    this._shuffle(bag);

    // 2. One bucket per (cell, layer): a slot row + a random fill cap.
    interface Bucket {
      cellIdx: number;
      slots: Slot[];
      cap: number;
      count: number;
    }
    const cellCount = this.cols * this.rows;
    const buckets: Bucket[] = [];
    for (let c = 0; c < cellCount; c++) {
      for (let l = 0; l < layersPerCell; l++) {
        const cap = min + Math.floor(Math.random() * (max - min + 1));
        buckets.push({ cellIdx: c, slots: new Array(this.slotsPerLayer).fill(null), cap, count: 0 });
      }
    }

    // 3. Drop each item into a random bucket that still has room + an empty slot.
    let dropped = 0;
    for (const spec of bag) {
      // Prefer buckets still under their random cap (keeps a drag gap per layer);
      // but if none are open, FALL BACK to any bucket with a free slot rather than
      // dropping the item — dropping would leave a kind with a non-multiple-of-3
      // count → an unclearable leftover. Items only ever drop if the WHOLE board
      // is full (every slot taken), which needs total > cols·rows·layers·slots.
      let open = buckets.filter((b) => b.count < b.cap && b.slots.includes(null));
      if (open.length === 0) open = buckets.filter((b) => b.slots.includes(null));
      if (open.length === 0) {
        dropped++;
        continue; // board completely full (raise cols/rows/layers)
      }
      const b = open[Math.floor(Math.random() * open.length)];
      const empties: number[] = [];
      for (let i = 0; i < b.slots.length; i++) if (b.slots[i] === null) empties.push(i);
      b.slots[empties[Math.floor(Math.random() * empties.length)]] = spec;
      b.count++;
    }
    if (dropped > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[BoardModel] ${dropped} items didn't fit — board too small for setsPerKind.`);
    }

    // 4. Assemble cells: keep only non-empty layers, front→back in bucket order.
    for (let c = 0; c < cellCount; c++) {
      const col = c % this.cols;
      const row = Math.floor(c / this.cols);
      const layers = buckets.filter((b) => b.cellIdx === c && b.count > 0).map((b) => b.slots);
      this.cells.push({ col, row, layers });
    }
  }

  /** In-place Fisher–Yates shuffle. */
  private _shuffle<T>(bag: T[]): void {
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }

  /** Parse a layer code string ("CCY", "S.S", …) into slots (`.`/short = gap).
   * Fixed-level codes carry only the kind → colour variant 0. */
  private _parseLayer(spec: string): Layer {
    const layer: Slot[] = new Array(this.slotsPerLayer).fill(null);
    for (let i = 0; i < this.slotsPerLayer; i++) {
      const kind = codeToKind(spec[i] ?? ".");
      layer[i] = kind ? { kind, variant: 0 } : null;
    }
    return layer;
  }

  /** A layer with a random 1..max count of random items (kind + variant) in random
   * slots (gaps left in the unused slots, so there's always room to drag). */
  private _randomLayer(min: number, max: number, kinds: readonly ShapeKind[], variants: number): Layer {
    const layer: Slot[] = new Array(this.slotsPerLayer).fill(null);
    const count = min + Math.floor(Math.random() * (max - min + 1));
    const indices = Array.from({ length: this.slotsPerLayer }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    for (let k = 0; k < count; k++) {
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      layer[indices[k]] = { kind, variant: Math.floor(Math.random() * variants) };
    }
    return layer;
  }

  public frontLayer(cell: BoardCell): Layer | null {
    return cell.layers[0] ?? null;
  }

  /** True when the front layer is full AND all its slots are the same kind — the
   * pop condition (3-of-a-kind on a shelf). */
  public isFrontComplete(cell: BoardCell): boolean {
    const l = cell.layers[0];
    if (!l || l.length !== this.slotsPerLayer) return false;
    const first = l[0];
    return first !== null && l.every((s) => s !== null && s.kind === first.kind && s.variant === first.variant);
  }

  /** Remove the (cleared) front layer so the one behind slides forward. */
  public advance(cell: BoardCell): void {
    cell.layers.shift();
  }

  /** No layers left anywhere → the board is solved. */
  public isSolved(): boolean {
    return this.cells.every((c) => c.layers.length === 0);
  }
}
