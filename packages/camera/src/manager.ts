// Universal HTML5 Camera capturing and constraints management
import { CameraConfig, CameraCapabilities, CaptureOptions, BurstCaptureResult } from '@camkit/types';

export class CameraManager {
  private stream: MediaStream | null = null;
  private config: Required<CameraConfig>;
  public facingMode: 'user' | 'environment' = 'environment';
  public torchActive = false;
  public zoomLevel = 1.0;

  constructor(config: CameraConfig = {}) {
    this.config = {
      preferredFacingMode: config.preferredFacingMode ?? 'environment',
      idealResolution: config.idealResolution ?? { width: 1920, height: 1080 },
      aspectRatio: config.aspectRatio ?? 16 / 9,
      onPermissionStatusChange: config.onPermissionStatusChange ?? (() => {}),
      onStreamActive: config.onStreamActive ?? (() => {}),
      onStreamInactive: config.onStreamInactive ?? (() => {}),
      onError: config.onError ?? (() => {}),
    };
    this.facingMode = this.config.preferredFacingMode;
  }

  /**
   * Triggers media permission request and initiates video stream.
   */
  public async start(): Promise<MediaStream> {
    this.stop(); // Safe reset

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: this.facingMode },
        width: { ideal: this.config.idealResolution.width },
        height: { ideal: this.config.idealResolution.height },
        aspectRatio: { ideal: this.config.aspectRatio },
      },
      audio: false,
    };

    try {
      const activeStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.stream = activeStream;

      this.config.onStreamActive(activeStream);
      this.queryPermissionState();

      return activeStream;
    } catch (err: any) {
      this.config.onError(err);
      throw err;
    }
  }

  /**
   * Stops camera stream and frees all active hardware resource tracks.
   */
  public stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.config.onStreamInactive();
    }
    this.torchActive = false;
    this.zoomLevel = 1.0;
  }

  /**
   * Switches facing mode between User (front) and Environment (back) cameras.
   */
  public async toggleFacingMode(): Promise<MediaStream> {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    return this.start();
  }

  /**
   * Sets digital or optical zoom level if supported by current track.
   */
  public async setZoom(level: number): Promise<void> {
    const track = this.getVideoTrack();
    if (!track) return;

    const caps = this.getCapabilities();
    if (caps.zoom.supported) {
      const zoomVal = Math.max(caps.zoom.min, Math.min(caps.zoom.max, level));
      try {
        await track.applyConstraints({
          advanced: [{ zoom: zoomVal } as any],
        });
        this.zoomLevel = zoomVal;
      } catch (e) {
        console.warn('Failed to apply zoom level constraint', e);
      }
    }
  }

  /**
   * Sets focus settings or simulates tap-to-focus on absolute coords if supported.
   */
  public async setFocus(mode: 'continuous' | 'manual' | 'auto'): Promise<void> {
    const track = this.getVideoTrack();
    if (!track) return;

    try {
      await track.applyConstraints({
        advanced: [{ focusMode: mode } as any],
      });
    } catch (e) {
      console.warn('Focus mode constraint not supported on this device/browser', e);
    }
  }

  /**
   * Toggles the hardware camera flash / torch.
   */
  public async setTorch(active: boolean): Promise<void> {
    const track = this.getVideoTrack();
    if (!track) return;

    const caps = this.getCapabilities();
    if (caps.torch.supported) {
      try {
        await track.applyConstraints({
          advanced: [{ torch: active } as any],
        });
        this.torchActive = active;
      } catch (e) {
        console.warn('Failed to toggle camera torch constraint', e);
      }
    }
  }

  /**
   * Grabs a high-resolution frame from the video stream.
   * Employs the canvas grab technique to maximize mobile browser compatibility.
   */
  public async capture(options: CaptureOptions = {}): Promise<Blob> {
    if (!this.stream) {
      throw new Error('Camera is not active');
    }

    const video = document.createElement('video');
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => {
        video.play().then(() => resolve());
      };
    });

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;

    // Perform the snapshot draw
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Free resources
    video.srcObject = null;
    video.load();

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas frame encoding failed'));
        },
        options.format || 'image/jpeg',
        options.quality || 0.92
      );
    });
  }

  /**
   * Captures multiple frames sequentially for burst photography.
   */
  public async burstCapture(options: CaptureOptions = {}): Promise<BurstCaptureResult> {
    const count = options.burstCount ?? 5;
    const delay = options.burstDelayMs ?? 200;

    const frames: Blob[] = [];
    const timestamps: number[] = [];

    for (let i = 0; i < count; i++) {
      const frame = await this.capture(options);
      frames.push(frame);
      timestamps.push(Date.now());
      if (i < count - 1) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    return { frames, timestamps };
  }

  /**
   * Retrieves active MediaStreamTrack capabilities.
   */
  public getCapabilities(): CameraCapabilities {
    const track = this.getVideoTrack();
    const caps: CameraCapabilities = {
      facingMode: this.facingMode,
      zoom: { min: 1.0, max: 1.0, current: this.zoomLevel, supported: false },
      torch: { supported: false, active: this.torchActive },
      focusMode: { supported: false, mode: [] },
      supportedResolutions: [],
    };

    if (!track) return caps;

    try {
      const trackCaps = (track as any).getCapabilities?.() || {};

      if (trackCaps.zoom) {
        caps.zoom.supported = true;
        caps.zoom.min = trackCaps.zoom.min ?? 1.0;
        caps.zoom.max = trackCaps.zoom.max ?? 1.0;
      }

      if (trackCaps.torch) {
        caps.torch.supported = true;
      }

      if (trackCaps.focusMode) {
        caps.focusMode.supported = true;
        caps.focusMode.mode = trackCaps.focusMode;
      }
    } catch (e) {
      console.warn('Could not read track capabilities', e);
    }

    return caps;
  }

  private getVideoTrack(): MediaStreamTrack | null {
    if (!this.stream) return null;
    return this.stream.getVideoTracks()[0] || null;
  }

  private async queryPermissionState() {
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      try {
        const status = await navigator.permissions.query({ name: 'camera' as any });
        this.config.onPermissionStatusChange(status.state);
        status.onchange = () => {
          this.config.onPermissionStatusChange(status.state);
        };
      } catch (e) {
        // Ignored. Firefox throws exceptions for custom permission names query
      }
    }
  }
}
