# CamKit SDK

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-First-blue?style=for-the-badge&logo=typescript" alt="TypeScript First" />
  <img src="https://img.shields.io/badge/Vite-Build-646CFF?style=for-the-badge&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/WebGL2-GPU_Accelerated-darkgreen?style=for-the-badge&logo=webgl" alt="WebGL2 GPU" />
  <img src="https://img.shields.io/badge/Framework-Agnostic-orange?style=for-the-badge" alt="Framework Agnostic" />
</p>

**CamKit** is a high-performance, modular, framework-agnostic camera capture, GPU-accelerated image processing, and upload SDK designed for modern web applications. Whether you are building mobile-first capture experiences, professional Lightroom-like photo editors, or offline-resilient document inspection systems, CamKit provides standard out-of-the-box modules.

---

## 🌟 Key Features

* 📸 **Universal Camera Manager**: HTML5 `getUserMedia` wrappers tracking device facing modes, zoom ranges, torch constraints, tap-to-focus coordinates, and high-quality burst snapshot sessions.
* 🚀 **GPU-Accelerated Shaders**: WebGL2 fragment pipelines running 15+ adjustment parameters (Exposure, Vibrance, Temperature, Shadows, Vignettes, Bilateral Noise Reduction, Clarity, Sharpening, and Multi-pass Blurs) with a Canvas2D CPU fallback.
* 🧠 **Telea FMM Image Inpainting**: Self-contained background Web Worker compiler running scikit-image style Fast Marching Method (FMM) Eikonal solvers and priority HeapQueue structures for realistic spot-healing brushes.
* 💾 **Offline-Ready Upload Queue**: IndexedDB-backed serialization engine storing files and metadata, automatically resuming dispatches via exponential backoff retries and concurrency pools.
* 🎨 **Framework Bindings**: Fluent Vanilla TS chains, React hooks & styled components (HistogramView, BeforeAfterSlider), and Vue 3 reactive composables.
* 🏷️ **Binary EXIF Telemetry**: Low-level binary TIFF parser extracting detailed shutter speeds, ISOs, lens focal points, GPS tags, and stripping binary headers to reduce upload footprints.

---

## 📁 Repository Directory Structure

CamKit is organized as a high-performance **pnpm monorepo** managed by **Turborepo**:

```txt
camkit/
├── packages/
│   ├── core/           # Fluent orchestrator & Plugin register
│   ├── camera/         # getUserMedia and MediaStreamTrack sensor bounds
│   ├── uploader/       # Resilient uploads, IndexedDB queues, S3 adapters
│   ├── image-tools/    # crops, rotations, flips, and perspective homography solvers
│   ├── webgl-engine/   # WebGL2 rendering passes, convolution shaders, and fallbacks
│   ├── filters/        # Vintage/Cinematic preset adjustments and .cube LUT parsers
│   ├── workers/        # Telea FMM background thread inpainter
│   ├── utils/          # Binary EXIF decoders and Display-P3 color gamuts
│   └── types/          # Shared type declarations
├── apps/
│   └── playground/     # Flagship Lightroom/Figma-style demo editor
├── docs/               # Complete developer tutorials
└── pnpm-workspace.yaml # Monorepo workspaces definition
```

---

## ⚙️ Installation & Workspace Setup

To link packages in your local development workspace, run:

```bash
# Clone the repository
git clone https://github.com/honeypc/camkit.git
cd camkit

# Install dependencies and link monorepo packages
pnpm install

# Run the flagship Lightroom-style playground app
pnpm --filter camkit-playground dev

# Run individual integration examples (Vite Dev Server)
pnpm --filter camkit-example-vanilla dev   # Vanilla JS/TS
pnpm --filter camkit-example-react dev     # React hooks & components
pnpm --filter camkit-example-vue dev       # Vue 3 composables
```

---

## 📖 Fluent Developer Guidelines

### 1. Vanilla TypeScript Chaining Workflow
Construct a complete pipeline starting the camera sensor, capturing frames, applying WebGL filters, and enqueuing offline uploads:

```typescript
import { CamKit, createHttpAdapter } from '@camkit/core';

// 1. Initialize CamKit with Resilient Uploads
const camkit = new CamKit({
  uploader: {
    uploadAdapter: createHttpAdapter({
      url: 'https://api.yourdomain.com/dispatches/upload'
    }),
    concurrentLimit: 2,
    offlineQueueEnabled: true,
    allowedMimeTypes: ['image/jpeg', 'image/png'], // File format filter
    maxFileSize: 10 * 1024 * 1024, // 10MB size limit (in bytes)
    maxQueueSize: 15 // Limit queue capacity to 15 files
  }
});

// 2. Stream Camera Sensors
await camkit.camera.start();

// 3. Take High-Quality Snapshot
const imageBlob = await camkit.camera.capture({ quality: 0.95 });

// 4. Chain Fluent GPU Editor Operations
const editedBlob = await camkit.editor
  .load(imageBlob)
  .crop({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })
  .adjust({
    exposure: 15,
    contrast: 10,
    temperature: 15,
    vignette: 25
  })
  .filter('cinematic')
  .sharpen(30)
  .export();

// 5. Send to Offline Queue
const taskId = await camkit.upload(editedBlob, {
  category: "Inspection Report"
});
```

---

### 2. React Bindings Integration (Hooks & UI)
Create a beautiful photo editor and capture studio using pre-styled Lightroom-like components:

```tsx
import React, { useState } from 'react';
import {
  useCamera,
  useImageEditor,
  CameraView,
  HistogramView,
  BeforeAfterSlider
} from '@camkit/react';

export default function Studio() {
  const camera = useCamera();
  const editor = useImageEditor();
  const [original, setOriginal] = useState<string>('');
  const [editedCanvas, setEditedCanvas] = useState<HTMLCanvasElement | null>(null);

  const handleCapture = async () => {
    const blob = await camera.capture();
    setOriginal(URL.createObjectURL(blob));
    
    // Load into WebGL Editor pipeline
    await editor.load(blob);
    
    // Apply preset adjustments on the GPU
    editor.adjust({ exposure: 10, contrast: 15, vignette: 20 });
    setEditedCanvas(editor.getCanvas());
    camera.stop();
  };

  return (
    <div className="studio-app">
      {camera.active ? (
        <CameraView
          stream={camera.stream}
          active={camera.active}
          facingMode={camera.facingMode}
          permission={camera.permission}
          onCapture={handleCapture}
          onToggleFacing={camera.toggleFacingMode}
          torch={camera.torch}
          onToggleTorch={camera.toggleTorch}
          zoom={camera.zoom}
          onZoomChange={camera.setZoom}
          capabilities={camera.capabilities}
        />
      ) : (
        <div className="editor-view">
          {editedCanvas && (
            <BeforeAfterSlider
              originalUrl={original}
              modifiedCanvas={editedCanvas}
            />
          )}
          <HistogramView sourceCanvas={editedCanvas} />
        </div>
      )}
    </div>
  );
}
```

---

### 3. Vue 3 Composables Integration
Manage camera and editor state reactively in Vue SFCs:

```vue
<script setup lang="ts">
import { useCamera, useImageEditor } from '@camkit/vue';
import { ref } from 'vue';

const { active, stream, start, stop, capture } = useCamera();
const editor = useImageEditor();
const currentCanvas = ref<HTMLCanvasElement | null>(null);

const runCapture = async () => {
  const blob = await capture();
  await editor.load(blob);
  editor.filter('vintage'); // Apply vintage LUT/preset
  currentCanvas.value = editor.getCanvas();
  stop();
};
</script>

<template>
  <div class="vue-studio">
    <button v-if="!active" @click="start">Open Sensor</button>
    <button v-else @click="runCapture">Capture Snapshot</button>
    <canvas ref="currentCanvas" />
  </div>
</template>
```

---

## 🔌 Extensible Plugin System

Extend CamKit's core pipelines by registering custom plugins with dedicated lifecycles:

```typescript
import { CamKitPlugin, UploadTask } from '@camkit/types';

// Custom plugin to parse EXIF GPS details and inject watermarks
export const InspectionHelperPlugin: CamKitPlugin = {
  name: 'inspection-helper-watermark',
  version: '1.0.0',
  hooks: {
    // 1. Draw timestamp stamp prior to GPU processing
    beforeProcess: async (canvas) => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(255, 61, 0, 0.8)';
        ctx.font = 'bold 20px Inter';
        ctx.fillText(`CAMKIT DISPATCH SECURE`, 20, 40);
      }
    },
    // 2. Intercept upload tasks and inject customized descriptors
    beforeUpload: async (task: UploadTask) => {
      task.metadata.customData = {
        ...task.metadata.customData,
        secureDispatchVerification: true,
        hash: 'SHA-256'
      };
      return task;
    }
  }
};

// Register
camkit.use(InspectionHelperPlugin);
```

---

## ⚡ Performance Optimization Guides

* **Destroy WebGL Instances**: To prevent GPU contexts memory leaking, always call `editor.destroy()` or the hook-equivalent unmount lifecycle.
* **Inline Web Workers**: Heavy mathematical calculations (Telea inpainting FMM) are run asynchronously in self-contained inline Web Workers using Transferables, keeping the browser UI thread running at a smooth $60$ FPS.
* **Gamma and Color Spaces**: Conversions between Display-P3 gamuts and sRGB are processed on linear space via fast color matrix transforms before applying gamma corrections ($2.2$ standard curve).
* **JPEG Stripping**: Reduce upload footprints up to $15\%$ by calling `camkit.cleanMetadata(blob)` which strips binary JPEG EXIF segments prior to queue insertion.

---

## ⚙️ Config & Settings Cheat Sheet

Below is a cheat sheet of core configurations and adjustment options in CamKit. For the exhaustive reference, see the [Developer Reference Guide](file:///Users/honeypc/Github/camkit/docs/index.md#6-complete-configuration--settings-reference).

### Camera Options (`CameraConfig`)
* `preferredFacingMode` — `'user' | 'environment'` (defaults to `'environment'`).
* `idealResolution` — `{ width, height }` (defaults to `1920x1080`).
* `aspectRatio` — Shape ratio (defaults to `16/9`).

### Resilient Uploader Options (`UploaderConfig`)
* `uploadAdapter` — Custom upload adapter callback.
* `concurrentLimit` — Max active concurrent uploads (defaults to `2`).
* `maxRetries` — Max failed retry limits (defaults to `3`).
* `offlineQueueEnabled` — Backup failed uploads to IndexedDB (defaults to `true`).
* `allowedMimeTypes` — File format list filter (e.g. `['image/jpeg', 'image/png']`).
* `maxFileSize` — Max file size limit in bytes (e.g. `10 * 1024 * 1024` for 10MB).
* `maxQueueSize` — Maximum concurrent files allowed in queue.

### GPU Shader Adjustments (`AdjustmentParams`)
* `exposure` / `brightness` / `contrast` / `saturation` / `vibrance` (`-100` to `100`).
* `temperature` / `tint` (`-100` to `100`).
* `highlights` / `shadows` (`-100` to `100`).
* `vignette` / `clarity` / `sharpening` (`0` to `100`).

---

## 🛡️ License

CamKit is licensed under the **MIT License**.
