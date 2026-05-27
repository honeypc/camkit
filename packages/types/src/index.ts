// CamKit Shared Types & Interfaces

export interface CamKitConfig {
  camera?: CameraConfig;
  uploader?: UploaderConfig;
  editor?: EditorConfig;
  plugins?: CamKitPlugin[];
}

// Camera Package Types
export interface CameraConfig {
  preferredFacingMode?: 'user' | 'environment';
  idealResolution?: { width: number; height: number };
  aspectRatio?: number;
  onPermissionStatusChange?: (status: PermissionState) => void;
  onStreamActive?: (stream: MediaStream) => void;
  onStreamInactive?: () => void;
  onError?: (error: Error) => void;
}

export interface CaptureOptions {
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
  quality?: number;
  burstCount?: number;
  burstDelayMs?: number;
  skipMetadataCleanup?: boolean;
  enableSmartAssist?: boolean;
  autoEnhance?: boolean;
  smartAssistOptions?: SmartPhotoAssistConfig;
  onSmartAssistResult?: (result: SmartPhotoAssistResult) => void;
}

export interface SmartPhotoAssistConfig {
  maxDimension?: number;
  jpegQuality?: number;
  blurVarianceThreshold?: number;
  darkLuminanceThreshold?: number;
  brightPixelThreshold?: number;
  brightPixelRatioThreshold?: number;
  contrastStdDevThreshold?: number;
  minShortDimension?: number;
}

export interface SmartPhotoAssistResult {
  isHealthy: boolean;
  score: number;
  checks: {
    blur: { isHealthy: boolean; value: number; threshold: number };
    tooDark: { isHealthy: boolean; value: number; threshold: number };
    overexposed: { isHealthy: boolean; value: number; threshold: number };
    lowContrast: { isHealthy: boolean; value: number; threshold: number };
    minResolution: { isHealthy: boolean; value: number; threshold: number };
  };
  enhancedBlob?: Blob;
}

export interface BurstCaptureResult {
  frames: Blob[];
  timestamps: number[];
}

export interface CameraCapabilities {
  facingMode: 'user' | 'environment' | 'unknown';
  zoom: { min: number; max: number; current: number; supported: boolean };
  torch: { supported: boolean; active: boolean };
  focusMode: { supported: boolean; mode: string[] };
  supportedResolutions: Array<{ width: number; height: number }>;
}

// Uploader Package Types
export type UploadStatus = 'idle' | 'queue' | 'uploading' | 'completed' | 'failed' | 'aborted';

export interface UploadMetadata {
  id: string;
  filename: string;
  createdAt: number;
  size: number;
  mimeType: string;
  customData?: Record<string, any>;
  gps?: { latitude: number; longitude: number; altitude?: number };
}

export interface UploadTask {
  id: string;
  file: Blob | File;
  metadata: UploadMetadata;
  status: UploadStatus;
  progress: number;
  retries: number;
  error?: string;
}

export type UploadAdapter = (
  task: UploadTask,
  onProgress: (percent: number) => void,
  abortSignal: AbortSignal
) => Promise<any>;

export interface UploaderConfig {
  uploadAdapter: UploadAdapter;
  concurrentLimit?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  offlineQueueEnabled?: boolean;
  allowedMimeTypes?: string[];
  maxFileSize?: number; // In bytes
  maxQueueSize?: number; // Maximum concurrent queue size
  onQueueChange?: (tasks: UploadTask[]) => void;
  onTaskProgress?: (taskId: string, progress: number) => void;
  onTaskSuccess?: (taskId: string, response: any) => void;
  onTaskFailed?: (taskId: string, error: Error) => void;
}

// WebGL Engine & Image Tools Types
export interface AdjustmentParams {
  brightness?: number; // -100 to 100
  contrast?: number;   // -100 to 100
  exposure?: number;   // -100 to 100
  saturation?: number; // -100 to 100
  vibrance?: number;   // -100 to 100
  temperature?: number;// -100 to 100
  tint?: number;       // -100 to 100
  highlights?: number; // -100 to 100
  shadows?: number;    // -100 to 100
  whites?: number;     // -100 to 100
  blacks?: number;     // -100 to 100
  vignette?: number;   // 0 to 100
  clarity?: number;    // 0 to 100
  sharpening?: number; // 0 to 100
  noiseReduction?: number; // 0 to 100
}

export interface CurvePoint {
  x: number; // 0 to 255
  y: number; // 0 to 255
}

export interface ColorCurves {
  rgb?: CurvePoint[];
  red?: CurvePoint[];
  green?: CurvePoint[];
  blue?: CurvePoint[];
}

export interface HSLAdjustments {
  // Hue, Saturation, Lightness per-color band: [hue, saturation, lightness]
  red?: [number, number, number];
  orange?: [number, number, number];
  yellow?: [number, number, number];
  green?: [number, number, number];
  aqua?: [number, number, number];
  blue?: [number, number, number];
  purple?: [number, number, number];
  magenta?: [number, number, number];
}

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'screen'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'linear-burn';

export type BlurType = 'gaussian' | 'lens' | 'bokeh' | 'tilt-shift' | 'motion';

export interface BlurParams {
  type: BlurType;
  radius: number;
  angle?: number; // for motion blur
  // for tilt shift:
  center?: number; // normalized center Y (0 to 1)
  focusWidth?: number; // normalized focus range Y (0 to 1)
}

export interface CropRegion {
  x: number;      // normalized 0..1
  y: number;      // normalized 0..1
  width: number;  // normalized 0..1
  height: number; // normalized 0..1
}

export interface PerspectivePoints {
  topLeft: { x: number; y: number }; // normalized or pixel
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

export interface EditorConfig {
  preferWebGL?: boolean;
  canvas2D?: boolean;
}

// Annotation & Inspection Features
export interface AnnotationItem {
  id: string;
  type: 'arrow' | 'label' | 'marker' | 'freehand';
  color: string;
  strokeWidth: number;
  points: Array<{ x: number; y: number }>;
  text?: string;
  labelType?: 'damage' | 'info' | 'critical';
}

// Metadata Extraction Types
export interface ExifData {
  make?: string;
  model?: string;
  software?: string;
  dateTime?: string;
  orientation?: number;
  fNumber?: number;
  exposureTime?: number;
  isoSpeedRatings?: number;
  focalLength?: number;
  gps?: {
    latitude: number;
    longitude: number;
    altitude?: number;
    timestamp?: number;
  };
  rawTiffData?: Record<string, any>;
}

// Plugin Architecture Types
export interface PluginLifecycleHooks {
  onCapture?: (blob: Blob) => Promise<Blob> | Blob;
  beforeProcess?: (canvas: HTMLCanvasElement | OffscreenCanvas) => Promise<void> | void;
  afterProcess?: (canvas: HTMLCanvasElement | OffscreenCanvas) => Promise<void> | void;
  beforeUpload?: (task: UploadTask) => Promise<UploadTask> | UploadTask;
}

export interface CamKitPlugin {
  name: string;
  version: string;
  setup?: (camkit: any) => void;
  hooks?: PluginLifecycleHooks;
}
