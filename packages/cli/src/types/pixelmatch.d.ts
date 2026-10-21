declare module 'pixelmatch' {
  interface PixelmatchOptions {
    /** Per-pixel OKLab HyAB distance from 0 to 1. 1 is black versus white. Default: 0.1 */
    threshold?: number;
    /** When true, anti-aliased pixels count as differences. Default: false */
    includeAA?: boolean;
    /** Opacity of original image in diff output. Default: 0.1 */
    alpha?: number;
    /** Color of anti-aliased pixels in diff output. Default: [255, 255, 0] */
    aaColor?: [number, number, number];
    /** Color of different pixels in diff output. Default: [255, 0, 0] */
    diffColor?: [number, number, number];
    /** Alternative color for dark-on-light differences. */
    diffColorAlt?: [number, number, number];
    /** Draw diff mask with no alpha. Default: false */
    diffMask?: boolean;
    /**
     * When finite, return the largest number of differing pixels in any N×N
     * square instead of the total count.
     */
    windowSize?: number;
  }

  /**
   * Compare two images pixel by pixel.
   * @returns Mismatched pixel count, or the window max when windowSize is set.
   */
  function pixelmatch(
    img1: Uint8Array | Uint8ClampedArray,
    img2: Uint8Array | Uint8ClampedArray,
    output: Uint8Array | Uint8ClampedArray | null,
    width: number,
    height: number,
    options?: PixelmatchOptions,
  ): number;

  export default pixelmatch;
}
