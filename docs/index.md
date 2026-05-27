# CamKit SDK Documentation

Welcome to the official developer documentation for **CamKit** — the framework-agnostic camera capture, GPU-accelerated image processing, and resilient upload SDK for modern web applications.

---

## 1. Architecture Overview

CamKit is structured as a **highly tree-shakable monorepo** containing modular packages that can be imported independently or orchestrated together via the main `@camkit/core` entry point.

```mermaid
graph TD
    CamKit[CamKit Orchestrator] --> Camera[@camkit/camera]
    CamKit --> Editor[Editor Pipeline]
    CamKit --> Uploader[@camkit/uploader]
    
    Editor --> GPU[@camkit/webgl-engine]
    Editor --> CPU[@camkit/image-tools]
    Editor --> Workers[@camkit/workers]
    
    Camera --> MediaStream[HTML5 getUserMedia]
    Uploader --> IndexedDB[(IndexedDB Queue)]
```

### Module Boundaries

1. **`@camkit/core`**: Main orchestrator providing fluent, chainable developer APIs and registering custom lifecycle plugins.
2. **`@camkit/camera`**: Interface for camera sensors, controlling facing modes, digital zoom, autofocus, and burst canvas snapshots.
3. **`@camkit/webgl-engine`**: High-performance GPU shader pipeline (adjustments, vignettes, blur convolution passes) with a direct Canvas2D CPU fallback.
4. **`@camkit/image-tools`**: Structural geometry math (crops, rotations, perspective correction homography solver).
5. **`@camkit/uploader`**: Resilient concurrency uploader containing presigned S3/HTTP chunking adapters and offline IndexedDB persistence.
6. **`@camkit/workers`**: Telea boundary-marching image inpainting algorithm running in background Web Workers.
7. **`@camkit/utils`**: Binary EXIF/TIFF parsers, GPS tag extraction, and Display-P3 color gamuts conversion.

---

## 2. Public API Design & Chaining Guides

### Standard Capture-to-Upload Chaining
```ts
import { CamKit, createHttpAdapter } from '@camkit/core';

// 1. Initialize CamKit
const camkit = new CamKit({
  uploader: {
    uploadAdapter: createHttpAdapter({ url: 'https://api.yourdomain.com/uploads' }),
    concurrentLimit: 2,
    offlineQueueEnabled: true
  }
});

// 2. Start Camera Feed
await camkit.camera.start();

// 3. Take Photo Snapshot
const imageBlob = await camkit.camera.capture({ quality: 0.95 });

// 4. Fluent Image Editor Processing
const editedBlob = await camkit.editor
  .load(imageBlob)
  .crop({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })
  .adjust({
    exposure: 10,
    contrast: 15,
    highlights: -5,
    vignette: 20
  })
  .filter("cinematic")
  .sharpen(25)
  .export();

// 5. resilient Offline-aware Upload
const uploadId = await camkit.upload(editedBlob, {
  label: "Inspection Damage Report"
});
```

### Upload Constraints & Validation
CamKit supports advanced file validation constraints directly in the uploader queue. Set allowed file types, file size limits, and queue capacity controls in the config:

```ts
const camkit = new CamKit({
  uploader: {
    uploadAdapter: myAdapter,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSize: 15 * 1024 * 1024, // 15MB limit in bytes
    maxQueueSize: 20 // Max files allowed in queue
  }
});
```
If a file violates these bounds, calling `camkit.upload()` or `camkit.uploader.add()` will throw an explicit validation error, preventing corrupt or bloated payloads from consuming memory.

---

## 3. Extensible Plugin Blueprint

Plugins allow developers to intercept core pipelines at key lifecycle events (e.g. inject AI object detection, OCR scanning, watermarks, or customized upload providers).

```ts
import { CamKitPlugin, UploadTask } from '@camkit/types';

// Concrete Plugin for adding a timestamp watermark
export const TimestampWatermarkPlugin: CamKitPlugin = {
  name: 'timestamp-watermark',
  version: '1.0.0',
  hooks: {
    // Intercept image stream BEFORE GPU adjustment passes
    beforeProcess: async (canvas) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(new Date().toLocaleString(), 30, canvas.height - 30);
    },
    // Intercept uploads to enrich metadata prior to transmission
    beforeUpload: async (task: UploadTask) => {
      task.metadata.customData = {
        ...task.metadata.customData,
        processedByWatermarkPlugin: true
      };
      return task;
    }
  }
};

// Consumption
camkit.use(TimestampWatermarkPlugin);
```

---

## 4. Performance Guide & Memory Optimizations

When deploying camera systems on mobile viewports (e.g. low-tier iOS/Android browsers), memory leaking represents the highest risk of browser crash. CamKit enforces strict memory guards:

* **WebGL Texture Disposals**: The `WebGLRenderer` implements a dedicated `.destroy()` method that explicitly releases GPU buffers, quad indices, and program caches. Always invoke `.destroy()` on tab transitions.
* **Transferable Workers**: Heavy computations (Telea inpainting) utilize transferable typed arrays (`pixels.buffer`), passing memory pointers directly to background threads without duplicate heap cloning.
* **Stepped Canvas Resizing**: Slicing large canvases down in iterations ($50\%$ size drops) prevents browser anti-aliasing aliasing and minimizes immediate heap spikes.
* **Binary Streams Stripping**: High-resolution EXIF blocks represent up to $15\%$ of image files. Use `camkit.cleanMetadata(blob)` to strip binary JPEG headers before uploading to save network bandwidth.

---

## 5. Browser Compatibility Checklists

| Feature | Chrome / Edge | Safari (macOS/iOS) | Firefox |
| :--- | :--- | :--- | :--- |
| **`getUserMedia` Stream** | ✅ Supported | ✅ Supported | ✅ Supported |
| **Torch / Zoom Constraints**| ✅ Supported | ❌ Handled via OS | ✅ Supported |
| **WebGL2 Shader Passes** | ✅ Supported | ✅ Supported | ✅ Supported |
| **IndexedDB Blobs** | ✅ Supported | ✅ Supported | ✅ Supported |
| **Web Workers** | ✅ Supported | ✅ Supported | ✅ Supported |
| **Display-P3 ICC Gamuts** | ✅ Supported | ✅ Supported | ⚠️ Color mapped |

---

## 6. Complete Configuration & Settings Reference

This section details all available options, interfaces, callbacks, and parameters in the CamKit SDK.

### 6.1. Root Config Options (`CamKitConfig`)
Passed when initializing the main `new CamKit(config)` orchestrator:
* `camera?: CameraConfig` — Video hardware and facing options.
* `uploader?: UploaderConfig` — Concurrency, adaptors, and queue storage limits.
* `editor?: EditorConfig` — Image processing configurations.
* `plugins?: CamKitPlugin[]` — Customized hooks modules.

---

### 6.2. Camera Config (`CameraConfig`)
Settings governing device media device streams:
* `preferredFacingMode?: 'user' | 'environment'` — Initial sensor selection. Defaults to `'environment'` (back camera).
* `idealResolution?: { width: number; height: number }` — Preferred resolution dimensions. Defaults to `1920x1080`.
* `aspectRatio?: number` — Shape ratio multiplier. Defaults to `16/9` ($1.777$).
* `onPermissionStatusChange?: (status: PermissionState) => void` — Fired when camera sensor permissions update (e.g. `'granted'`, `'prompt'`, `'denied'`).
* `onStreamActive?: (stream: MediaStream) => void` Fired when stream tracks load successfully.
* `onStreamInactive?: () => void` — Fired when camera stream turns off.
* `onError?: (error: Error) => void` — Triggered on initialization or constraints exceptions.

#### Snapshot Capture Options (`CaptureOptions`)
Passed to `camkit.camera.capture(options)` or `burstCapture(options)`:
* `format?: 'image/jpeg' | 'image/png' | 'image/webp'` — Export file encoding. Defaults to `'image/jpeg'`.
* `quality?: number` — Ratio between $0.0$ and $1.0$ (highest quality). Defaults to `0.92`.
* `burstCount?: number` — Total snapshot iterations for burst photography. Defaults to `5`.
* `burstDelayMs?: number` — Wait delay interval between burst snapshots. Defaults to `200`.
* `skipMetadataCleanup?: boolean` — Skips binary header EXIF stripping when enqueuing.

---

### 6.3. Uploader Config (`UploaderConfig`)
Configurations mapping resilient files synchronization rules:
* `uploadAdapter: UploadAdapter` — Callback function dispatching requests.
* `concurrentLimit?: number` — Total simultaneous HTTP files uploads. Defaults to `2`.
* `maxRetries?: number` — Retry count limits on failed uploads. Defaults to `3`.
* `retryDelayMs?: number` — Delay multiplier for exponential backoff retries. Defaults to `1000`.
* `offlineQueueEnabled?: boolean` — Saves tasks to IndexedDB when network drops. Defaults to `true`.
* `allowedMimeTypes?: string[]` — MIME type filter list (e.g., `['image/jpeg', 'image/png']`).
* `maxFileSize?: number` — Max file size in bytes (e.g., `5 * 1024 * 1024` for 5MB).
* `maxQueueSize?: number` — Maximum concurrent tasks enqueued in active queue.
* `onQueueChange?: (tasks: UploadTask[]) => void` — Event listener tracking queue mutations.
* `onTaskProgress?: (taskId: string, progress: number) => void` — Dynamic tracking of file upload progress (0..100%).
* `onTaskSuccess?: (taskId: string, response: any) => void` — Fired on HTTP adapter success.
* `onTaskFailed?: (taskId: string, error: Error) => void` — Fired when max retries are exceeded.

---

### 6.4. GPU WebGL adjustments (`AdjustmentParams`)
Adjustments parameters passed to `editor.adjust(adjustments)` or enqueued in chain processors:
* `brightness?: number` — Value between `-100` and `100`.
* `contrast?: number` — Value between `-100` and `100`.
* `exposure?: number` — Value between `-100` and `100`.
* `saturation?: number` — Value between `-100` and `100`.
* `vibrance?: number` — Value between `-100` and `100`.
* `temperature?: number` — Warmth shift between `-100` (cool) and `100` (warm).
* `tint?: number` — Color shift between `-100` (green) and `100` (magenta).
* `highlights?: number` — High luma correction between `-100` and `100`.
* `shadows?: number` — Shadow luma correction between `-100` and `100`.
* `vignette?: number` — Corner falloff opacity from `0` to `100` (heaviest vignette).
* `clarity?: number` — Local contrast enhancement boost between `0` and `100`.
* `sharpening?: number` — Detail Laplacian sharpening intensity from `0` to `100`.
* `noiseReduction?: number` — Bilateral smoothing filter scaling between `0` and `100`.

---

## 7. Running the Examples & Playground

Each example in this repository is designed as a standalone Vite development server inside our pnpm monorepo. 

### 7.1. Running the Vanilla JS/TS Example
To run the Vanilla JS/TS sandbox locally:
```bash
pnpm --filter camkit-example-vanilla dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 7.2. Running the React Example
To run the React hooks & components workspace:
```bash
pnpm --filter camkit-example-react dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 7.3. Running the Vue 3 Example
To run the Vue 3 composables workspace:
```bash
pnpm --filter camkit-example-vue dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 7.4. Running the Creative Studio Playground App
To run our flagship Lightroom/Figma-like visual editor app:
```bash
pnpm --filter camkit-playground dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 8. Multi-Step Capture with Frame Guides

CamKit provides a configurable **multi-step capture session API** that walks users through sequential photo captures, each with an optional visual frame overlay on the live camera stream. This is ideal for document verification flows (KYC, insurance claims, ID card capture) where multiple photos must be taken and reviewed in order.

### 8.1. Core Types

| Type | Description |
|------|-------------|
| `CaptureFrameType` | `'card-landscape' \| 'card-portrait' \| 'passport' \| 'square' \| 'face' \| 'custom'` |
| `CaptureFrame` | Frame overlay config: `type`, `color`, `vignetteOpacity`, `label`, `aspectRatio` |
| `CaptureStep` | A single step: `id`, `label`, `instruction`, `icon?`, `frame?` |
| `CaptureStepResult` | Confirmed step output: `step`, `blob`, `objectUrl`, `timestamp` |
| `MultiCaptureConfig` | Session config: `title`, `steps[]`, `onStepCapture`, `onAllComplete` |

### 8.2. Pre-built Preset Frame Ratios

| Frame Type | Aspect Ratio | Real-World Standard |
|------------|-------------|---------------------|
| `card-landscape` | 1.585 : 1 | ISO/IEC 7810 ID-1 (credit card) |
| `card-portrait`  | 0.631 : 1 | Same card, portrait orientation |
| `passport`       | 1.420 : 1 | ICAO 9303 biometric page |
| `square`         | 1 : 1     | Square format |
| `face`           | 0.750 : 1 | Portrait oval for selfie/liveness |
| `custom`         | user-defined | Set `aspectRatio` explicitly |

### 8.3. Usage Example

```ts
import { CamKit } from '@camkit/core';
import type { MultiCaptureConfig, CaptureStepResult } from '@camkit/core';

const camkit = new CamKit({ /* uploader config */ });

// Define your capture flow
const config: MultiCaptureConfig = {
  title: 'ID Card Capture',
  steps: [
    {
      id: 'id-front',
      icon: '🪪',
      label: 'Front Side',
      instruction: 'Place the FRONT of your ID card within the frame.',
      frame: {
        type: 'card-landscape',
        label: 'ID Card — Front Side',
        color: '#9d4edd',
        vignetteOpacity: 0.6
      }
    },
    {
      id: 'id-back',
      icon: '🔄',
      label: 'Back Side',
      instruction: 'Flip your card and place the BACK within the frame.',
      frame: {
        type: 'card-landscape',
        label: 'ID Card — Back Side',
        color: '#9d4edd',
        vignetteOpacity: 0.6
      }
    }
  ],
  onStepCapture: (result: CaptureStepResult, index: number) => {
    console.log(`Step ${index + 1} confirmed: ${result.step.label}`);
    // Show thumbnail preview, update progress UI, etc.
  },
  onAllComplete: async (results: CaptureStepResult[]) => {
    // All steps confirmed — dispatch to uploader
    for (const r of results) {
      await camkit.upload(r.blob, { stepId: r.step.id, label: r.step.label });
      URL.revokeObjectURL(r.objectUrl); // free memory
    }
  }
};
```

### 8.4. Frame Overlay Rendering

The frame overlay uses a CSS `box-shadow` trick on an absolutely-positioned element to create a dark vignette **outside** the transparent frame window. Corner L-markers are drawn with pure CSS borders. For `face` frames the window uses `border-radius: 50%` to render an oval with the corner markers hidden automatically.

```
┌─────────────────────────────────────┐
│  ████████████████████████████████  │  ← dark vignette (rgba box-shadow)
│  █  ┌───────────────────────┐  █  │
│  █  │  [frame window]       │  █  │  ← transparent cutout (configurable aspect ratio)
│  █  │  ID Card — Front Side │  █  │
│  █  └───────────────────────┘  █  │
│  ████████████████████████████████  │
└─────────────────────────────────────┘
```

### 8.5. Vanilla Example Flows

The bundled vanilla example at `examples/vanilla/` ships with 3 ready-to-use flows demonstrable from the mode selection screen:

| Flow | Steps | Frame Type |
|------|-------|------------|
| **ID Card** | Front → Back | `card-landscape` (purple) |
| **Passport** | Bio Page | `passport` (green) |
| **Selfie + ID** | Selfie → ID Front | `face` (blue) + `card-landscape` (purple) |

**App Screens:**
1. **Mode Selection** — Flow cards with step count badges
2. **Camera + Frame** — Live stream with frame overlay + step breadcrumbs + instruction text
3. **Step Review** — Full-size preview with keep / retake decision
4. **Summary Grid** — Thumbnail grid of all captures with per-step "✏️ Edit" access
5. **Editor** — Full adjustment panel (presets, geometry, 9 sliders, Smart Assist HUD)

### 8.6. Memory Management

- Each confirmed step result carries an `objectUrl` created via `URL.createObjectURL`.
- Call `URL.revokeObjectURL(result.objectUrl)` when the preview is no longer needed.
- The vanilla example automatically revokes URLs on "Start Over" and after editor edits are saved.

---

## 9. Running the Examples & Playground

Each example in this repository is designed as a standalone Vite development server inside our pnpm monorepo. 

### 9.1. Running the Vanilla JS/TS Example
To run the Vanilla JS/TS sandbox locally:
```bash
pnpm --filter camkit-example-vanilla dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 9.2. Running the React Example
To run the React hooks & components workspace:
```bash
pnpm --filter camkit-example-react dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 9.3. Running the Vue 3 Example
To run the Vue 3 composables workspace:
```bash
pnpm --filter camkit-example-vue dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 9.4. Running the Creative Studio Playground App
To run our flagship Lightroom/Figma-like visual editor app:
```bash
pnpm --filter camkit-playground dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
