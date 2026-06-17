/**
 * Ignore-region masks (Task 15.5).
 *
 * A saved rectangle, scoped to a user + route + viewport, that visual diff
 * comparisons should ignore. Painted in the diff viewer; persists across runs.
 *
 * @module db/masks
 */

/** A saved ignore-region rectangle. Coordinates are in image pixels. */
export interface IgnoreMask {
  id: string;
  userId: string;
  route: string;
  viewport: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional human label (e.g. "live timestamp"). */
  label?: string;
  createdAt: string;
}

/** Storage operations for masks (implemented by both stores). */
export interface MaskStore {
  createMask(m: IgnoreMask): Promise<void>;
  listMasks(userId: string): Promise<IgnoreMask[]>;
  /** Lists masks matching a specific route+viewport for the user. */
  listMasksForTarget(userId: string, route: string, viewport: number): Promise<IgnoreMask[]>;
  deleteMask(id: string, userId: string): Promise<boolean>;
}
