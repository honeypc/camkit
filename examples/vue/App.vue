<template>
  <div class="vue-example-app" style="padding: 24px; background: #12121a; color: #fff; min-height: 100vh;">
    <h1>CamKit Vue 3 Studio</h1>

    <div v-if="active" class="camera-stream-wrapper" style="position: relative; max-width: 600px; margin: 16px 0;">
      <!-- HTML5 video stream node -->
      <video
        ref="videoRef"
        autoplay
        playsinline
        muted
        style="width: 100%; border-radius: 8px; background: #000;"
      ></video>

      <div class="controls" style="margin-top: 12px; display: flex; gap: 12px;">
        <button @click="runCapture" style="padding: 8px 16px; background: #ff3d00; border: none; border-radius: 4px; color: #fff; cursor: pointer;">
          📸 Take Photo
        </button>
        <button @click="toggleFacingMode" style="padding: 8px 16px; background: #444; border: none; border-radius: 4px; color: #fff; cursor: pointer;">
          🔄 Flip Lens
        </button>
        <button @click="stop" style="padding: 8px 16px; background: #444; border: none; border-radius: 4px; color: #fff; cursor: pointer;">
          Stop
        </button>
      </div>
    </div>

    <div v-else class="workspace">
      <button @click="startCamera" style="padding: 10px 20px; background: #8e2de2; border: none; border-radius: 4px; color: #fff; cursor: pointer; font-weight: 500;">
        Open Camera Sensor
      </button>

      <!-- Edited Output Preview -->
      <div v-if="hasEdited" style="margin-top: 24px;">
        <h3>Processed Output (Cinematic presets + Vignettes on GPU)</h3>
        <canvas ref="canvasRef" style="max-width: 100%; border-radius: 8px; border: 1px solid #232335;"></canvas>
        <br />
        <button @click="runUpload" style="margin-top: 16px; padding: 10px 20px; background: #00e676; border: none; border-radius: 4px; color: #000; font-weight: 600; cursor: pointer;">
          🚀 Sync to Cloud Queue
        </button>
      </div>
    </div>

    <!-- Active Dispatches list -->
    <div class="uploader-log" style="margin-top: 32px; border-top: 1px solid #232335; padding-top: 16px;">
      <h3>Resilient Upload Log</h3>
      <div v-for="task in tasks" :key="task.id" style="display: flex; gap: 16px; margin: 8px 0;">
        <span>{{ task.id }}</span>
        <span>Progress: {{ task.progress }}%</span>
        <span style="text-transform: uppercase;">[{{ task.status }}]</span>
      </div>
      <div v-if="tasks.length === 0" style="color: #666;">No active dispatches.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, watch, onMounted } from 'vue';
import { useCamera, useImageEditor, useUploader } from '@camkit/vue';

const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const hasEdited = ref(false);

const {
  active,
  stream,
  start,
  stop,
  toggleFacingMode,
  capture
} = useCamera({
  idealResolution: { width: 1280, height: 720 }
});

const editor = useImageEditor();

const { tasks, upload } = useUploader({
  uploadAdapter: async (task, onProgress, abortSignal) => {
    // Mock upload adapter loop
    for (let percent = 10; percent <= 100; percent += 20) {
      if (abortSignal.aborted) throw new Error('Aborted');
      await new Promise((r) => setTimeout(r, 150));
      onProgress(percent);
    }
    return { success: true };
  }
});

// Update video stream srcObject dynamically
watch(stream, (newStream) => {
  if (videoRef.value && newStream) {
    videoRef.value.srcObject = newStream;
  }
});

const startCamera = async () => {
  hasEdited.value = false;
  await start();
};

const runCapture = async () => {
  const blob = await capture();
  await editor.load(blob);

  // Apply filters on WebGL GPU engine
  editor.crop({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
  editor.adjust({ exposure: 10, temperature: 15, vignette: 25 });
  editor.filter('vintage');

  stop(); // Turn off camera stream

  // Render on preview canvas on next ticks
  hasEdited.value = true;
  setTimeout(() => {
    if (canvasRef.value) {
      const activeCanvas = editor.getCanvas();
      canvasRef.value.width = activeCanvas.width;
      canvasRef.value.height = activeCanvas.height;
      canvasRef.value.getContext('2d')!.drawImage(activeCanvas, 0, 0);
    }
  }, 50);
};

const runUpload = async () => {
  const blob = await editor.exportBlob();
  await upload(blob, { label: 'Vue 3 Example Upload' });
};
</script>
