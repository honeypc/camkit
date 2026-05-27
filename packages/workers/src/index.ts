// Workers Package Client Interface
import { INLINE_WORKER_CODE } from './worker-code';
import { inpaintTelea } from './telea';
export * from './telea';
export * from '@camkit/types';

export class CamKitWorkerClient {
  private worker: Worker | null = null;
  private currentResolver: ((value: Uint8ClampedArray) => void) | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return; // SSR or environment without Workers support
    }

    try {
      const blob = new Blob([INLINE_WORKER_CODE], { type: 'application/javascript' });
      const blobURL = URL.createObjectURL(blob);
      this.worker = new Worker(blobURL);

      this.worker.onmessage = (e) => {
        const { action, pixels } = e.data;
        if (action === 'inpaint_result' && this.currentResolver) {
          this.currentResolver(pixels);
          this.currentResolver = null;
        }
      };
    } catch (err) {
      console.warn('Failed to initialize inline Web Worker. Fallback to main thread processing will be used.', err);
    }
  }

  /**
   * Run the Telea Inpainting algorithm in a background Web Worker.
   * Leverages transferable array buffers for maximum performance.
   */
  public inpaint(
    width: number,
    height: number,
    pixels: Uint8ClampedArray,
    mask: Uint8ClampedArray,
    radius = 6
  ): Promise<Uint8ClampedArray> {
    // If Web Workers are not available, run directly in main thread as fallback
    if (!this.worker) {
      return Promise.resolve(inpaintTelea(width, height, pixels, mask, radius));
    }

    return new Promise((resolve) => {
      this.currentResolver = resolve;

      // Transferable array buffers
      // We pass copies of buffers so the main thread context doesn't lose control
      const pixelCopy = new Uint8ClampedArray(pixels);
      const maskCopy = new Uint8ClampedArray(mask);

      this.worker!.postMessage({
        action: 'inpaint',
        width,
        height,
        pixels: pixelCopy,
        mask: maskCopy,
        radius,
      }, [pixelCopy.buffer, maskCopy.buffer]);
    });
  }

  /**
   * Terminate the background thread worker.
   */
  public terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
