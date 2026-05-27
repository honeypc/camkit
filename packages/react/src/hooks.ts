// React Hooks for CamKit SDK Bindings
import { useState, useEffect, useCallback, useRef } from 'react';
import { CamKit, EditorChain, UploadTask } from '@camkit/core';
import { CameraConfig, UploaderConfig, AdjustmentParams, BlurParams, CropRegion } from '@camkit/types';

/**
 * useCamera
 * Hooks camera capture stream, state tracking, torch toggles, zoom ranges, permissions.
 */
export function useCamera(config: CameraConfig = {}) {
  const [active, setActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [caps, setCaps] = useState<any>(null);

  const managerRef = useRef<any>(null);

  if (!managerRef.current) {
    const camkit = new CamKit({
      camera: {
        ...config,
        onPermissionStatusChange: (status) => {
          setPermission(status);
          config.onPermissionStatusChange?.(status);
        },
        onStreamActive: (s) => {
          setStream(s);
          setActive(true);
          config.onStreamActive?.(s);
        },
        onStreamInactive: () => {
          setStream(null);
          setActive(false);
          config.onStreamInactive?.();
        },
      },
    });
    managerRef.current = camkit.camera;
  }

  const manager = managerRef.current;

  const start = useCallback(async () => {
    const s = await manager.start();
    setCaps(manager.getCapabilities());
    return s;
  }, [manager]);

  const stop = useCallback(() => {
    manager.stop();
    setStream(null);
    setActive(false);
  }, [manager]);

  const toggleFacingMode = useCallback(async () => {
    const s = await manager.toggleFacingMode();
    setFacingMode(manager.facingMode);
    setCaps(manager.getCapabilities());
    return s;
  }, [manager]);

  const changeZoom = useCallback(
    async (level: number) => {
      await manager.setZoom(level);
      setZoom(manager.zoomLevel);
    },
    [manager]
  );

  const toggleTorch = useCallback(async () => {
    const nextState = !torch;
    await manager.setTorch(nextState);
    setTorch(manager.torchActive);
  }, [manager, torch]);

  const capture = useCallback(
    async (options = {}) => {
      return manager.capture(options);
    },
    [manager]
  );

  const burstCapture = useCallback(
    async (options = {}) => {
      return manager.burstCapture(options);
    },
    [manager]
  );

  // Stop camera on unmount to prevent resource leaks
  useEffect(() => {
    return () => {
      manager.stop();
    };
  }, [manager]);

  return {
    active,
    stream,
    permission,
    facingMode,
    torch,
    zoom,
    capabilities: caps,
    start,
    stop,
    toggleFacingMode,
    setZoom: changeZoom,
    toggleTorch,
    capture,
    burstCapture,
  };
}

/**
 * useUploader
 * Orchestrates upload lists, online syncing, retry statuses, and IndexedDB queuing.
 */
export function useUploader(config: UploaderConfig) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const uploaderRef = useRef<any>(null);

  if (!uploaderRef.current) {
    const camkit = new CamKit({
      uploader: {
        ...config,
        onQueueChange: (t) => {
          setTasks([...t]);
          config.onQueueChange?.(t);
        },
      },
    });
    uploaderRef.current = camkit.uploader;
  }

  const upload = useCallback(
    async (file: Blob | File, customMetadata?: Record<string, any>) => {
      return uploaderRef.current.add(file, customMetadata);
    },
    []
  );

  const abort = useCallback((id: string) => {
    uploaderRef.current.abort(id);
  }, []);

  const remove = useCallback((id: string) => {
    uploaderRef.current.remove(id);
  }, []);

  useEffect(() => {
    // Load initial tasks on load
    setTasks(uploaderRef.current.getTasks());
  }, []);

  return {
    tasks,
    upload,
    abort,
    remove,
  };
}

/**
 * useImageEditor
 * Instantiates editor pipeline, tracks adjustment settings, processes steps, exports blobs.
 */
export function useImageEditor() {
  const [processing, setProcessing] = useState(false);
  const editorRef = useRef<EditorChain | null>(null);

  useEffect(() => {
    const camkit = new CamKit();
    editorRef.current = camkit.editor;

    return () => {
      editorRef.current?.destroy();
    };
  }, []);

  const load = useCallback(async (source: any) => {
    if (!editorRef.current) return;
    setProcessing(true);
    try {
      await editorRef.current.load(source);
    } finally {
      setProcessing(false);
    }
  }, []);

  const applyCrop = useCallback((region: CropRegion) => {
    editorRef.current?.crop(region);
  }, []);

  const applyRotate = useCallback((deg: 90 | 180 | 270) => {
    editorRef.current?.rotate(deg);
  }, []);

  const applyFlip = useCallback((h: boolean, v: boolean) => {
    editorRef.current?.flip(h, v);
  }, []);

  const applyAdjustments = useCallback((params: AdjustmentParams, blur?: BlurParams) => {
    editorRef.current?.adjust(params, blur);
  }, []);

  const applyPreset = useCallback((preset: string) => {
    editorRef.current?.filter(preset);
  }, []);

  const getCanvas = useCallback(() => {
    return editorRef.current?.getCanvas() || null;
  }, []);

  const exportBlob = useCallback(async (format = 'image/jpeg', quality = 0.92) => {
    if (!editorRef.current) throw new Error('Editor not loaded');
    setProcessing(true);
    try {
      return await editorRef.current.export(format, quality);
    } finally {
      setProcessing(false);
    }
  }, []);

  return {
    processing,
    load,
    crop: applyCrop,
    rotate: applyRotate,
    flip: applyFlip,
    adjust: applyAdjustments,
    filter: applyPreset,
    getCanvas,
    exportBlob,
  };
}
