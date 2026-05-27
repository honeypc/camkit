// CamKit React Example Application
import React, { useState } from 'react';
import {
  useCamera,
  useUploader,
  useImageEditor,
  CameraView,
  HistogramView,
  BeforeAfterSlider
} from '@camkit/react';

export default function App() {
  const camera = useCamera({
    idealResolution: { width: 1280, height: 720 },
    aspectRatio: 16 / 9
  });

  const uploader = useUploader({
    uploadAdapter: async (task, onProgress, abortSignal) => {
      // Mock upload progress dispatcher
      for (let p = 10; p <= 100; p += 20) {
        if (abortSignal.aborted) throw new Error('Aborted');
        await new Promise((r) => setTimeout(r, 200));
        onProgress(p);
      }
      return { success: true };
    },
    maxFileSize: 5 * 1024 * 1024 // 5MB limit
  });

  const editor = useImageEditor();
  const [originalUrl, setOriginalUrl] = useState<string>('');
  const [editedCanvas, setEditedCanvas] = useState<HTMLCanvasElement | null>(null);

  const handleCapture = async () => {
    try {
      const blob = await camera.capture();
      setOriginalUrl(URL.createObjectURL(blob));

      // Load into Editor
      await editor.load(blob);

      // Process adjustments on the GPU
      editor.adjust({
        exposure: 15,
        contrast: 10,
        temperature: 15,
        vignette: 20
      });

      setEditedCanvas(editor.getCanvas());
      camera.stop(); // Release camera track
    } catch (err) {
      console.error('Capture failed', err);
    }
  };

  const handleUpload = async () => {
    if (!editedCanvas) return;
    const finalBlob = await editor.exportBlob();
    await uploader.upload(finalBlob, { label: 'React Example Upload' });
  };

  return (
    <div className="react-example-app" style={{ padding: '24px', background: '#12121a', color: '#fff', minHeight: '100vh' }}>
      <h1>CamKit React Studio</h1>

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
        <div className="workspace">
          <button onClick={camera.start}>Open Camera Sensor</button>

          {editedCanvas && (
            <div style={{ marginTop: '24px' }}>
              <BeforeAfterSlider
                originalUrl={originalUrl}
                modifiedCanvas={editedCanvas}
              />
              <HistogramView sourceCanvas={editedCanvas} />
              <button onClick={handleUpload} style={{ marginTop: '16px', padding: '10px 20px', background: '#8e2de2', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>
                🚀 resilient Upload
              </button>
            </div>
          )}
        </div>
      )}

      {/* Task Queue Log */}
      <div className="uploader-log" style={{ marginTop: '32px', borderTop: '1px solid #232335', paddingTop: '16px' }}>
        <h3>resilient Upload Queue</h3>
        {uploader.tasks.map((task) => (
          <div key={task.id} style={{ display: 'flex', gap: '16px', margin: '8px 0' }}>
            <span>{task.id}</span>
            <span>Progress: {task.progress}%</span>
            <span>Status: {task.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
