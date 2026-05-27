// Flagship CamKit Creative Studio Playground App
import React, { useState, useEffect, useRef } from 'react';
import {
  useCamera,
  useUploader,
  useImageEditor,
  CameraView,
  HistogramView,
  BeforeAfterSlider
} from '@camkit/react';

export default function App() {
  // Mode selection: 'camera' | 'editor'
  const [activeTab, setActiveTab] = useState<'camera' | 'editor'>('editor');
  const [originalUrl, setOriginalUrl] = useState<string>('');
  const [activeCanvas, setActiveCanvas] = useState<HTMLCanvasElement | null>(null);

  // Annotation Layer Drawing States
  const [drawMode, setDrawMode] = useState<'none' | 'arrow' | 'label'>('none');
  const [labelType, setLabelType] = useState<'damage' | 'critical'>('damage');
  const [annotations, setAnnotations] = useState<Array<{
    id: string;
    type: 'arrow' | 'label';
    points: Array<{ x: number; y: number }>;
    text?: string;
  }>>([]);

  const isDrawing = useRef(false);
  const drawingPath = useRef<Array<{ x: number; y: number }>>([]);

  // Mock Upload presigned triggers
  const mockUploadAdapter = async (_task: any, onProgress: any, abortSignal: any) => {
    for (let percent = 5; percent <= 100; percent += 15) {
      if (abortSignal.aborted) throw new Error('Upload aborted');
      await new Promise((r) => setTimeout(r, 180));
      onProgress(percent);
    }
    return { url: 'https://cdn.camkit.io/uploads/demo-result.jpg' };
  };

  const camera = useCamera({
    idealResolution: { width: 1280, height: 720 },
  });

  const uploader = useUploader({
    uploadAdapter: mockUploadAdapter,
    concurrentLimit: 2,
  });

  const editor = useImageEditor();

  // Basic Slider Adjustments
  const [adjustments, setAdjustments] = useState({
    brightness: 0,
    contrast: 0,
    exposure: 0,
    saturation: 0,
    vibrance: 0,
    temperature: 0,
    tint: 0,
    highlights: 0,
    shadows: 0,
    vignette: 0,
    sharpening: 0,
    clarity: 0,
  });

  const [activeFilter, setActiveFilter] = useState('none');
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // EXIF parsed metadata
  const [exifData, setExifData] = useState<any>(null);

  // Initialize a beautiful default gradient image on load
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 500;
    const ctx = canvas.getContext('2d')!;

    // Make elegant color gradient backdrop
    const grad = ctx.createLinearGradient(0, 0, 800, 500);
    grad.addColorStop(0, '#1a103c');
    grad.addColorStop(0.5, '#2b1055');
    grad.addColorStop(1, '#511060');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 500);

    // Draw lens abstract rings
    ctx.beginPath();
    ctx.arc(400, 250, 120, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 75, 75, 0.4)';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(420, 230, 60, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(41, 121, 255, 0.2)';
    ctx.fill();

    // Text details
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Outfit';
    ctx.fillText('CAMKIT STUDIO', 280, 255);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '16px Inter';
    ctx.fillText('Start Camera or Adjust Controls to Begin Processing', 210, 290);

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        setOriginalUrl(url);
        editor.load(blob).then(() => {
          setActiveCanvas(editor.getCanvas());
        });
      }
    });

    // Connectivity listener
    setIsOnline(navigator.onLine);
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));
  }, []);

  // Update adjustments on changes
  useEffect(() => {
    if (!editor.processing && activeCanvas) {
      editor.adjust(adjustments);
      setActiveCanvas(editor.getCanvas());
    }
  }, [adjustments]);

  const handleSliderChange = (key: keyof typeof adjustments, val: number) => {
    setAdjustments((prev) => ({ ...prev, [key]: val }));
  };

  const handlePresetSelect = (preset: string) => {
    setActiveFilter(preset);
    if (preset === 'none') {
      setAdjustments({
        brightness: 0,
        contrast: 0,
        exposure: 0,
        saturation: 0,
        vibrance: 0,
        temperature: 0,
        tint: 0,
        highlights: 0,
        shadows: 0,
        vignette: 0,
        sharpening: 0,
        clarity: 0,
      });
    } else {
      editor.filter(preset);
      setActiveCanvas(editor.getCanvas());
    }
  };

  const handleCapture = async () => {
    try {
      const blob = await camera.capture();
      const url = URL.createObjectURL(blob);
      setOriginalUrl(url);
      setExifData({
        make: 'CamKit Virtual Sensor',
        model: 'CMK-720p',
        iso: 200,
        shutter: '1/120s',
        gps: { latitude: 35.6762, longitude: 139.6503, altitude: 45 },
      });

      await editor.load(blob);
      setActiveCanvas(editor.getCanvas());
      setActiveTab('editor');
      camera.stop();
    } catch (e) {
      alert('Capture failed: ' + e);
    }
  };

  const handleUpload = async () => {
    if (!activeCanvas) return;
    try {
      const blob = await editor.exportBlob();
      await uploader.upload(blob, {
        gps: exifData?.gps,
        label: 'Inspection Damage Snapshot',
      });
    } catch (e) {
      alert('Upload enqueue failed: ' + e);
    }
  };

  // Canvas annotation events
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawMode === 'none') return;
    isDrawing.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawingPath.current = [{ x, y }];
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || drawMode === 'none') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawingPath.current.push({ x, y });
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawing.current || drawMode === 'none') return;
    isDrawing.current = false;
    if (drawingPath.current.length > 1) {
      setAnnotations((prev) => [
        ...prev,
        {
          id: `ann-${Math.random().toString(36).substring(2, 9)}`,
          type: drawMode === 'arrow' ? 'arrow' : 'label',
          points: [...drawingPath.current],
          text: drawMode === 'label' ? (labelType === 'damage' ? '⚠️ Damage' : '🚨 Critical') : undefined,
        },
      ]);
    }
    drawingPath.current = [];
  };

  // Redraw annotations on top of the main canvas preview
  useEffect(() => {
    if (!activeCanvas || annotations.length === 0) return;
    const ctx = activeCanvas.getContext('2d');
    if (!ctx) return;

    annotations.forEach((ann) => {
      if (ann.type === 'arrow' && ann.points.length >= 2) {
        const start = ann.points[0];
        const end = ann.points[ann.points.length - 1];

        // Draw arrow shaft
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = '#ff3d00';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Draw arrowhead
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - 15 * Math.cos(angle - Math.PI / 6), end.y - 15 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(end.x - 15 * Math.cos(angle + Math.PI / 6), end.y - 15 * Math.sin(angle + Math.PI / 6));
        ctx.fillStyle = '#ff3d00';
        ctx.fill();
      } else if (ann.type === 'label' && ann.points.length > 0) {
        const p = ann.points[0];
        ctx.fillStyle = labelType === 'critical' ? '#d50000' : '#ffab00';
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Inter';
        ctx.fillText(ann.text || '', p.x + 8, p.y + 4);
      }
    });
  }, [annotations, activeCanvas]);

  return (
    <div className="playground-app-wrapper">
      {/* Studio Header */}
      <header className="studio-header">
        <div className="logo-group">
          <span className="logo-pulse" />
          <h1 className="logo-title">CamKit</h1>
          <span className="logo-subtitle">Studio Lab</span>
        </div>

        <div className="tab-control-group">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'camera' ? 'active' : ''}`}
            onClick={async () => {
              setActiveTab('camera');
              await camera.start();
            }}
          >
            📸 Active Sensor
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('editor');
              camera.stop();
            }}
          >
            🎛️ Photo Lab
          </button>
        </div>

        <div className="status-indicator">
          <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
          <span>{isOnline ? 'Network Online' : 'Network Offline'}</span>
        </div>
      </header>

      {/* Main Studio Body */}
      <main className="studio-body">
        {/* Left Control Column (Presets & Cameras) */}
        <section className="studio-panel-column left-column">
          <div className="panel-card">
            <h2 className="panel-title">Instagram Presets</h2>
            <div className="presets-grid">
              <button
                type="button"
                className={`preset-thumb ${activeFilter === 'none' ? 'selected' : ''}`}
                onClick={() => handlePresetSelect('none')}
              >
                <span>🚫 Original</span>
              </button>
              <button
                type="button"
                className={`preset-thumb cinematic ${activeFilter === 'cinematic' ? 'selected' : ''}`}
                onClick={() => handlePresetSelect('cinematic')}
              >
                <span>🎬 Cinematic</span>
              </button>
              <button
                type="button"
                className={`preset-thumb vintage ${activeFilter === 'vintage' ? 'selected' : ''}`}
                onClick={() => handlePresetSelect('vintage')}
              >
                <span>🎞️ Vintage</span>
              </button>
              <button
                type="button"
                className={`preset-thumb bw ${activeFilter === 'bw' ? 'selected' : ''}`}
                onClick={() => handlePresetSelect('bw')}
              >
                <span>🌑 B&W</span>
              </button>
              <button
                type="button"
                className={`preset-thumb retro ${activeFilter === 'retro' ? 'selected' : ''}`}
                onClick={() => handlePresetSelect('retro')}
              >
                <span>🍂 Retro</span>
              </button>
              <button
                type="button"
                className={`preset-thumb nordic ${activeFilter === 'nordic' ? 'selected' : ''}`}
                onClick={() => handlePresetSelect('nordic')}
              >
                <span>❄️ Nordic</span>
              </button>
            </div>
          </div>

          <div className="panel-card">
            <h2 className="panel-title">Inspection Tools</h2>
            <div className="vertical-actions">
              <button
                type="button"
                className={`action-btn ${showBeforeAfter ? 'active' : ''}`}
                onClick={() => setShowBeforeAfter(!showBeforeAfter)}
              >
                ☯️ Compare Split View
              </button>

              <div className="draw-tool-selector">
                <span className="label">Damage Annotations:</span>
                <div className="btn-row">
                  <button
                    type="button"
                    className={`draw-btn ${drawMode === 'arrow' ? 'active' : ''}`}
                    onClick={() => setDrawMode(drawMode === 'arrow' ? 'none' : 'arrow')}
                  >
                    ↗ Arrow
                  </button>
                  <button
                    type="button"
                    className={`draw-btn ${drawMode === 'label' ? 'active' : ''}`}
                    onClick={() => setDrawMode(drawMode === 'label' ? 'none' : 'label')}
                  >
                    🏷️ Label Marker
                  </button>
                </div>

                {drawMode === 'label' && (
                  <select
                    value={labelType}
                    onChange={(e) => setLabelType(e.target.value as any)}
                    className="label-dropdown"
                  >
                    <option value="damage">⚠️ Damage Point</option>
                    <option value="critical">🚨 Critical Structural</option>
                  </select>
                )}

                {annotations.length > 0 && (
                  <button
                    type="button"
                    className="clear-draw-btn"
                    onClick={() => setAnnotations([])}
                  >
                    Clear Annotations
                  </button>
                )}
              </div>
            </div>
          </div>

          {exifData && (
            <div className="panel-card exif-card">
              <h2 className="panel-title">EXIF Telemetry</h2>
              <div className="exif-grid">
                <div className="exif-item">
                  <span className="label">Camera Make:</span>
                  <span className="val">{exifData.make}</span>
                </div>
                <div className="exif-item">
                  <span className="label">Sensor Model:</span>
                  <span className="val">{exifData.model}</span>
                </div>
                <div className="exif-item">
                  <span className="label">ISO Rating:</span>
                  <span className="val">ISO {exifData.iso}</span>
                </div>
                <div className="exif-item">
                  <span className="label">Shutter Speed:</span>
                  <span className="val">{exifData.shutter}</span>
                </div>
                <div className="exif-item full">
                  <span className="label">GPS Coordinates:</span>
                  <span className="val">
                    📍 {exifData.gps.latitude.toFixed(4)}, {exifData.gps.longitude.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Center Workspace Area */}
        <section className="studio-workspace">
          {activeTab === 'camera' ? (
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
            <div className="editor-viewport">
              {showBeforeAfter && originalUrl && activeCanvas ? (
                <BeforeAfterSlider originalUrl={originalUrl} modifiedCanvas={activeCanvas} />
              ) : (
                <div className="canvas-wrapper">
                  {/* Drawing canvas annotations overlay listener wrapper */}
                  <canvas
                    ref={(el) => {
                      if (el && activeCanvas) {
                        el.width = activeCanvas.width;
                        el.height = activeCanvas.height;
                        el.getContext('2d')!.clearRect(0, 0, el.width, el.height);
                        el.getContext('2d')!.drawImage(activeCanvas, 0, 0);
                      }
                    }}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    className={`editor-canvas ${drawMode !== 'none' ? 'draw-pointer' : ''}`}
                  />
                  {drawMode !== 'none' && (
                    <div className="annotation-badge">Drawing Mode Active</div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Adjustments panel Column (Lightroom Slider Dashboard) */}
        <section className="studio-panel-column right-column">
          <div className="panel-card">
            <h2 className="panel-title">Real-Time Histogram</h2>
            <HistogramView sourceCanvas={activeCanvas} />
          </div>

          <div className="panel-card adjustments-panel">
            <h2 className="panel-title">Light & Color</h2>

            {/* LIGHT AND COLOR SLIDERS */}
            {[
              { label: 'Exposure', key: 'exposure', min: -100, max: 100 },
              { label: 'Brightness', key: 'brightness', min: -100, max: 100 },
              { label: 'Contrast', key: 'contrast', min: -100, max: 100 },
              { label: 'Highlights', key: 'highlights', min: -100, max: 100 },
              { label: 'Shadows', key: 'shadows', min: -100, max: 100 },
            ].map((slide) => (
              <div key={slide.key} className="slider-row">
                <div className="slider-label">
                  <span>{slide.label}</span>
                  <span className="value">{(adjustments as any)[slide.key]}</span>
                </div>
                <input
                  type="range"
                  min={slide.min}
                  max={slide.max}
                  value={(adjustments as any)[slide.key]}
                  onChange={(e) => handleSliderChange(slide.key as any, parseInt(e.target.value))}
                  className="adjustment-slider"
                />
              </div>
            ))}

            <h2 className="panel-title sub-header">Color Mixer</h2>

            {[
              { label: 'Saturation', key: 'saturation', min: -100, max: 100 },
              { label: 'Vibrance', key: 'vibrance', min: -100, max: 100 },
              { label: 'Temp', key: 'temperature', min: -100, max: 100 },
              { label: 'Tint', key: 'tint', min: -100, max: 100 },
            ].map((slide) => (
              <div key={slide.key} className="slider-row">
                <div className="slider-label">
                  <span>{slide.label}</span>
                  <span className="value">{(adjustments as any)[slide.key]}</span>
                </div>
                <input
                  type="range"
                  min={slide.min}
                  max={slide.max}
                  value={(adjustments as any)[slide.key]}
                  onChange={(e) => handleSliderChange(slide.key as any, parseInt(e.target.value))}
                  className="adjustment-slider"
                />
              </div>
            ))}

            <h2 className="panel-title sub-header">Detail & Clarity</h2>

            {[
              { label: 'Clarity', key: 'clarity', min: 0, max: 100 },
              { label: 'Sharpening', key: 'sharpening', min: 0, max: 100 },
              { label: 'Vignette', key: 'vignette', min: 0, max: 100 },
            ].map((slide) => (
              <div key={slide.key} className="slider-row">
                <div className="slider-label">
                  <span>{slide.label}</span>
                  <span className="value">{(adjustments as any)[slide.key]}</span>
                </div>
                <input
                  type="range"
                  min={slide.min}
                  max={slide.max}
                  value={(adjustments as any)[slide.key]}
                  onChange={(e) => handleSliderChange(slide.key as any, parseInt(e.target.value))}
                  className="adjustment-slider"
                />
              </div>
            ))}
          </div>

          <div className="panel-card">
            <button
              type="button"
              className="action-btn upload-workflow-btn"
              onClick={handleUpload}
            >
              🚀 Send to Upload Pipeline
            </button>
          </div>
        </section>
      </main>

      {/* Upload Queue Bottom Bar Footer */}
      <footer className="studio-footer-queue">
        <h2 className="queue-title">Upload Dispatch Control</h2>
        {uploader.tasks.length === 0 ? (
          <div className="empty-queue">No active dispatches running. Enqueue photos above.</div>
        ) : (
          <div className="queue-list">
            {uploader.tasks.map((task) => (
              <div key={task.id} className="queue-row">
                <div className="task-info">
                  <span className="task-id">{task.id}</span>
                  <span className="task-file">({(task.file.size / 1024).toFixed(1)} KB)</span>
                </div>

                <div className="task-progress-bar-container">
                  <div className="task-progress-bar" style={{ width: `${task.progress}%` }} />
                </div>

                <span className="task-percent">{task.progress}%</span>

                <span className={`task-status badge-${task.status}`}>{task.status}</span>

                {task.status === 'uploading' && (
                  <button
                    type="button"
                    className="abort-btn"
                    onClick={() => uploader.abort(task.id)}
                  >
                    Abort
                  </button>
                )}

                {task.status === 'failed' && (
                  <span className="task-error">{task.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
