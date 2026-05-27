// Vue 3 Composables for CamKit SDK Bindings
import { ref, shallowRef, onUnmounted } from 'vue';
import { CamKit, EditorChain, UploadTask } from '@camkit/core';
import { CameraConfig, UploaderConfig, AdjustmentParams, BlurParams, CropRegion } from '@camkit/types';

/**
 * useCamera (Vue Composable)
 */
export function useCamera(config: CameraConfig = {}) {
  const active = ref(false);
  const stream = shallowRef<MediaStream | null>(null);
  const permission = ref<PermissionState>('prompt');
  const facingMode = ref<'user' | 'environment'>('environment');
  const torch = ref(false);
  const zoom = ref(1.0);
  const capabilities = ref<any>(null);

  const camkit = new CamKit({
    camera: {
      ...config,
      onPermissionStatusChange: (status) => {
        permission.value = status;
        config.onPermissionStatusChange?.(status);
      },
      onStreamActive: (s) => {
        stream.value = s;
        active.value = true;
        config.onStreamActive?.(s);
      },
      onStreamInactive: () => {
        stream.value = null;
        active.value = false;
        config.onStreamInactive?.();
      },
    },
  });

  const manager = camkit.camera;
  facingMode.value = manager.facingMode;

  const start = async () => {
    const s = await manager.start();
    capabilities.value = manager.getCapabilities();
    return s;
  };

  const stop = () => {
    manager.stop();
    stream.value = null;
    active.value = false;
  };

  const toggleFacingMode = async () => {
    const s = await manager.toggleFacingMode();
    facingMode.value = manager.facingMode;
    capabilities.value = manager.getCapabilities();
    return s;
  };

  const setZoom = async (level: number) => {
    await manager.setZoom(level);
    zoom.value = manager.zoomLevel;
  };

  const toggleTorch = async () => {
    await manager.setTorch(!torch.value);
    torch.value = manager.torchActive;
  };

  const capture = async (options = {}) => {
    return manager.capture(options);
  };

  const burstCapture = async (options = {}) => {
    return manager.burstCapture(options);
  };

  onUnmounted(() => {
    manager.stop();
  });

  return {
    active,
    stream,
    permission,
    facingMode,
    torch,
    zoom,
    capabilities,
    start,
    stop,
    toggleFacingMode,
    setZoom,
    toggleTorch,
    capture,
    burstCapture,
  };
}

/**
 * useUploader (Vue Composable)
 */
export function useUploader(config: UploaderConfig) {
  const tasks = ref<UploadTask[]>([]);

  const camkit = new CamKit({
    uploader: {
      ...config,
      onQueueChange: (t) => {
        tasks.value = [...t];
        config.onQueueChange?.(t);
      },
    },
  });

  const upload = async (file: Blob | File, customMetadata?: Record<string, any>) => {
    return camkit.uploader.add(file, customMetadata);
  };

  const abort = (id: string) => {
    camkit.uploader.abort(id);
  };

  const remove = (id: string) => {
    camkit.uploader.remove(id);
  };

  // Get initial tasks
  tasks.value = camkit.uploader.getTasks();

  return {
    tasks,
    upload,
    abort,
    remove,
  };
}

/**
 * useImageEditor (Vue Composable)
 */
export function useImageEditor() {
  const processing = ref(false);
  const editor = shallowRef<EditorChain | null>(null);

  const camkit = new CamKit();
  editor.value = camkit.editor;

  const load = async (source: any) => {
    if (!editor.value) return;
    processing.value = true;
    try {
      await editor.value.load(source);
    } finally {
      processing.value = false;
    }
  };

  const crop = (region: CropRegion) => {
    editor.value?.crop(region);
  };

  const rotate = (deg: 90 | 180 | 270) => {
    editor.value?.rotate(deg);
  };

  const flip = (h: boolean, v: boolean) => {
    editor.value?.flip(h, v);
  };

  const adjust = (params: AdjustmentParams, blur?: BlurParams) => {
    editor.value?.adjust(params, blur);
  };

  const filter = (preset: string) => {
    editor.value?.filter(preset);
  };

  const getCanvas = () => {
    return editor.value?.getCanvas() || null;
  };

  const exportBlob = async (format = 'image/jpeg', quality = 0.92) => {
    if (!editor.value) throw new Error('Editor not loaded');
    processing.value = true;
    try {
      return await editor.value.export(format, quality);
    } finally {
      processing.value = false;
    }
  };

  onUnmounted(() => {
    editor.value?.destroy();
  });

  return {
    processing,
    load,
    crop,
    rotate,
    flip,
    adjust,
    filter,
    getCanvas,
    exportBlob,
  };
}
