import { CamKitConfig, CamKitPlugin, UploadTask, CaptureOptions } from '@camkit/types';
import { CameraManager } from '@camkit/camera';
import { UploadQueue } from '@camkit/uploader';
import { EditorChain } from './editor-chain';
import { PluginManager } from './plugin-manager';
import { parseExif, stripMetadata, SmartPhotoAssist } from '@camkit/utils';

export * from './editor-chain';
export * from './plugin-manager';
export * from '@camkit/types';
export * from '@camkit/utils';
export * from '@camkit/camera';
export * from '@camkit/uploader';

export class CamKit {
  public camera: CameraManager;
  public uploader!: UploadQueue;
  public plugins: PluginManager;

  constructor(config: CamKitConfig = {}) {
    this.plugins = new PluginManager();
    this.camera = new CameraManager(config.camera);

    if (config.uploader) {
      this.uploader = new UploadQueue(config.uploader);
    }

    // Register initial plugins
    if (config.plugins) {
      config.plugins.forEach((p) => this.use(p));
    }
  }

  /**
   * Returns a fresh, fluent EditorChain instance.
   */
  public get editor(): EditorChain {
    return new EditorChain(this.plugins);
  }

  /**
   * Registers a new custom CamKit plugin.
   */
  public use(plugin: CamKitPlugin): this {
    this.plugins.register(plugin);
    return this;
  }

  /**
   * High-level capture wrapper that orchestrates camera sensor snapshot,
   * runs quality auto-checks (SmartPhotoAssist), auto-enhances if requested,
   * runs plugin hooks, and returns the final frame.
   */
  public async capture(options: CaptureOptions = {}): Promise<Blob> {
    let blob = await this.camera.capture(options);

    // If SmartPhotoAssist is enabled, run quality checks
    if (options.enableSmartAssist) {
      const result = await SmartPhotoAssist.analyze(blob, options.smartAssistOptions);

      // Auto-enhance if requested
      if (options.autoEnhance) {
        const canvas = document.createElement('canvas');
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image for auto-enhance'));
          img.src = URL.createObjectURL(blob);
        });
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        URL.revokeObjectURL(img.src);

        const enhancedCanvas = SmartPhotoAssist.autoEnhance(canvas);
        const format = options.format || 'image/jpeg';
        const quality = options.quality || 0.92;
        blob = await new Promise<Blob>((resolve, reject) => {
          enhancedCanvas.toBlob(
            (b) => {
              if (b) resolve(b);
              else reject(new Error('Auto-enhance export failed'));
            },
            format,
            quality
          );
        });

        result.enhancedBlob = blob;
      }

      if (options.onSmartAssistResult) {
        options.onSmartAssistResult(result);
      }
    }

    // Run plugin hooks
    blob = await this.plugins.runOnCapture(blob);

    return blob;
  }

  /**
   * Direct high-level upload workflow wrapper.
   * Runs `beforeUpload` lifecycle hooks on plugins.
   */
  public async upload(file: Blob | File, customMetadata?: Record<string, any>): Promise<string> {
    if (!this.uploader) {
      throw new Error('Upload system not configured. Provide uploader options in CamKit config.');
    }

    // Wrap into a temporary task for plugin hooks interception
    const id = `upload-${Math.random().toString(36).substring(2, 11)}`;
    let task: UploadTask = {
      id,
      file,
      metadata: {
        id,
        filename: (file as File).name || `${id}.jpg`,
        createdAt: Date.now(),
        size: file.size,
        mimeType: file.type || 'image/jpeg',
        customData: customMetadata,
      },
      status: 'queue' as const,
      progress: 0,
      retries: 0,
    };

    // Run plugin hooks
    task = await this.plugins.runBeforeUpload(task);

    // Enqueue
    return this.uploader.add(task.file, task.metadata.customData);
  }

  /**
   * High-level EXIF reader.
   */
  public async getMetadata(file: Blob): Promise<any> {
    return parseExif(file);
  }

  /**
   * High-level metadata cleaner.
   */
  public async cleanMetadata(file: Blob): Promise<Blob> {
    return stripMetadata(file);
  }
}
