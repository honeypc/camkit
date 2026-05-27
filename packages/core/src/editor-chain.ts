// Fluent Method-Chaining Image Editor Chain
import {
  AdjustmentParams,
  CropRegion,
  PerspectivePoints,
  BlurParams
} from '@camkit/types';
import { rotateCanvas, flipCanvas, cropCanvas, perspectiveCorrect, resizeCanvas } from '@camkit/image-tools';
import { WebGLRenderer, Canvas2DFallback } from '@camkit/webgl-engine';
import { getPresetAdjustments } from '@camkit/filters';
import { PluginManager } from './plugin-manager';

export class EditorChain {
  private canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer | null = null;
  private pluginManager: PluginManager;

  constructor(pluginManager: PluginManager) {
    this.canvas = document.createElement('canvas');
    this.pluginManager = pluginManager;
    try {
      this.renderer = new WebGLRenderer();
    } catch (e) {
      console.warn('WebGL2 not available. Falling back to CPU Canvas2D pipeline.', e);
    }
  }

  /**
   * Loads an image source into the editor pipeline.
   */
  public load(source: HTMLImageElement | HTMLCanvasElement | Blob | File): Promise<EditorChain> {
    return new Promise((resolve, reject) => {
      if (source instanceof HTMLImageElement) {
        this.loadImageToCanvas(source);
        resolve(this);
      } else if (source instanceof HTMLCanvasElement) {
        this.canvas.width = source.width;
        this.canvas.height = source.height;
        this.canvas.getContext('2d')!.drawImage(source, 0, 0);
        resolve(this);
      } else {
        // Blob / File
        const img = new Image();
        img.onload = () => {
          this.loadImageToCanvas(img);
          resolve(this);
        };
        img.onerror = () => reject(new Error('Failed to load image file source'));
        img.src = URL.createObjectURL(source);
      }
    });
  }

  private loadImageToCanvas(img: HTMLImageElement) {
    this.canvas.width = img.naturalWidth || img.width;
    this.canvas.height = img.naturalHeight || img.height;
    const ctx = this.canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
  }

  /**
   * Applies a cropped region (normalized coordinates).
   */
  public crop(region: CropRegion): this {
    const cropped = cropCanvas(this.canvas, region);
    this.updateCanvas(cropped);
    return this;
  }

  /**
   * Rotates image by specified angle.
   */
  public rotate(degrees: 90 | 180 | 270): this {
    const rotated = rotateCanvas(this.canvas, degrees);
    this.updateCanvas(rotated);
    return this;
  }

  /**
   * Flips image vertically/horizontally.
   */
  public flip(horizontal: boolean, vertical: boolean): this {
    const flipped = flipCanvas(this.canvas, horizontal, vertical);
    this.updateCanvas(flipped);
    return this;
  }

  /**
   * Corrects perspectives warping.
   */
  public perspectiveCorrect(corners: PerspectivePoints, targetWidth: number, targetHeight: number): this {
    const warped = perspectiveCorrect(this.canvas, corners, targetWidth, targetHeight);
    this.updateCanvas(warped);
    return this;
  }

  /**
   * Resizes image to new dimensions.
   */
  public resize(width: number, height: number, highQuality = true): this {
    const resized = resizeCanvas(this.canvas, width, height, highQuality);
    this.updateCanvas(resized);
    return this;
  }

  /**
   * Applies adjustment factors using high performance WebGL shaders.
   */
  public adjust(adjustments: AdjustmentParams, blur?: BlurParams): this {
    if (this.renderer) {
      this.pluginManager.runBeforeProcess(this.canvas);
      // Process on GPU
      const output = this.renderer.render(this.canvas, adjustments, blur);
      this.updateCanvas(output);
      this.pluginManager.runAfterProcess(this.canvas);
    } else {
      // CPU Fallback (Canvas2D)
      const output = Canvas2DFallback.process(this.canvas, adjustments);
      this.updateCanvas(output);
    }
    return this;
  }

  /**
   * Applies Instagram-style preset filter adjustments.
   */
  public filter(presetName: string): this {
    const adjustments = getPresetAdjustments(presetName);
    return this.adjust(adjustments);
  }

  /**
   * Helper: Sharpens details on the image.
   */
  public sharpen(intensity = 30): this {
    return this.adjust({ sharpening: intensity });
  }

  /**
   * Returns current modified canvas instance.
   */
  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Exports current canvas to Blob.
   */
  public async export(format = 'image/jpeg', quality = 0.92): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas export failed'));
        },
        format,
        quality
      );
    });
  }

  private updateCanvas(newCanvas: HTMLCanvasElement) {
    this.canvas.width = newCanvas.width;
    this.canvas.height = newCanvas.height;
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(newCanvas, 0, 0);
  }

  public destroy() {
    if (this.renderer) {
      this.renderer.destroy();
    }
  }
}
