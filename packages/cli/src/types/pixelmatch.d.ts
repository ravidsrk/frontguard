declare module 'pixelmatch' {
  interface PixelmatchOptions {
    /** Matching threshold (0 to 1); smaller is more sensitive. Default: 0.1 */
    threshold?: number;
    /** Whether to skip anti-aliasing detection. Default: false */
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
  }

  /**
   * Compare two images pixel by pixel.
   * @returns Number of mismatched pixels.
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
