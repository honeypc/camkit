import { useRef, useEffect, useState, MouseEvent } from 'react';

/**
 * CameraView
 * Displays modern camera video, frames overlays, permission cards, and action overlays.
 */
interface CameraViewProps {
  stream: MediaStream | null;
  active: boolean;
  facingMode: 'user' | 'environment';
  permission: PermissionState;
  onCapture: () => void;
  onToggleFacing: () => void;
  torch: boolean;
  onToggleTorch: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  capabilities: any;
}

export function CameraView({
  stream,
  active,
  facingMode,
  permission,
  onCapture,
  onToggleFacing,
  torch,
  onToggleTorch,
  zoom,
  onZoomChange,
  capabilities,
}: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (permission === 'denied') {
    return (
      <div className="camkit-camera-container error-state">
        <div className="icon">⚠️</div>
        <h3>Camera Permission Denied</h3>
        <p>Please enable camera access in your browser settings to proceed.</p>
      </div>
    );
  }

  return (
    <div className="camkit-camera-container">
      {active && stream ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`camera-video ${facingMode === 'user' ? 'flipped' : ''}`}
          />
          {/* Visual grid overlay to guide framing */}
          <div className="camera-grid-overlay">
            <div className="grid-line horizontal" />
            <div className="grid-line horizontal" />
            <div className="grid-line vertical" />
            <div className="grid-line vertical" />
          </div>

          {/* Action floating bar */}
          <div className="camera-toolbar">
            {capabilities?.torch?.supported && (
              <button
                type="button"
                className={`toolbar-btn ${torch ? 'active' : ''}`}
                onClick={onToggleTorch}
                title="Toggle Flash / Torch"
              >
                {torch ? '💡 On' : '💡 Off'}
              </button>
            )}

            <button
              type="button"
              className="toolbar-btn capture-shutter-btn"
              onClick={onCapture}
              title="Capture Photo"
            >
              <div className="inner-shutter" />
            </button>

            <button
              type="button"
              className="toolbar-btn"
              onClick={onToggleFacing}
              title="Toggle Facing Camera"
            >
              🔄 Flip
            </button>
          </div>

          {/* Zoom slider overlay */}
          {capabilities?.zoom?.supported && capabilities.zoom.max > capabilities.zoom.min && (
            <div className="camera-zoom-slider-container">
              <span className="label">1x</span>
              <input
                type="range"
                min={capabilities.zoom.min}
                max={capabilities.zoom.max}
                step="0.1"
                value={zoom}
                onChange={(e) => onZoomChange(parseFloat(e.target.value))}
                className="zoom-slider"
              />
              <span className="label">{capabilities.zoom.max.toFixed(0)}x</span>
            </div>
          )}
        </>
      ) : (
        <div className="camera-loading-state">
          <div className="spinner" />
          <p>Initializing Camera Sensor...</p>
        </div>
      )}
    </div>
  );
}

/**
 * HistogramView
 * Renders real-time RGB & Luminance pixel channels distributions on a Canvas overlay.
 */
interface HistogramViewProps {
  sourceCanvas: HTMLCanvasElement | null;
}

export function HistogramView({ sourceCanvas }: HistogramViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!sourceCanvas || !canvasRef.current) return;

    const histCanvas = canvasRef.current;
    const ctx = histCanvas.getContext('2d')!;

    // Direct downsample to save CPU performance during calculation
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 128;
    sampleCanvas.height = 128;
    sampleCanvas.getContext('2d')!.drawImage(sourceCanvas, 0, 0, 128, 128);

    const imgData = sampleCanvas.getContext('2d')!.getImageData(0, 0, 128, 128);
    const pixels = imgData.data;
    const len = pixels.length;

    // 256 size channels
    const rHist = new Uint32Array(256);
    const gHist = new Uint32Array(256);
    const bHist = new Uint32Array(256);
    const lHist = new Uint32Array(256);

    for (let i = 0; i < len; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

      rHist[r]++;
      gHist[g]++;
      bHist[b]++;
      lHist[luma]++;
    }

    // Find peak value for scaling
    let peak = 0;
    for (let j = 0; j < 256; j++) {
      if (rHist[j] > peak) peak = rHist[j];
      if (gHist[j] > peak) peak = gHist[j];
      if (bHist[j] > peak) peak = bHist[j];
      if (lHist[j] > peak) peak = lHist[j];
    }

    // Clear canvas
    ctx.clearRect(0, 0, histCanvas.width, histCanvas.height);
    ctx.fillStyle = 'rgba(15, 15, 20, 0.4)';
    ctx.fillRect(0, 0, histCanvas.width, histCanvas.height);

    const drawPath = (data: Uint32Array, color: string, fill: string) => {
      ctx.beginPath();
      ctx.moveTo(0, histCanvas.height);

      const step = histCanvas.width / 256;
      for (let x = 0; x < 256; x++) {
        const value = (data[x] / (peak || 1)) * (histCanvas.height - 10);
        ctx.lineTo(x * step, histCanvas.height - value);
      }

      ctx.lineTo(histCanvas.width, histCanvas.height);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.stroke();

      ctx.fillStyle = fill;
      ctx.fill();
    };

    // Draw channels
    drawPath(rHist, '#ff4b4b', 'rgba(255, 75, 75, 0.15)');
    drawPath(gHist, '#00e676', 'rgba(0, 230, 118, 0.15)');
    drawPath(bHist, '#2979ff', 'rgba(41, 121, 255, 0.15)');
    drawPath(lHist, '#ffffff', 'rgba(255, 255, 255, 0.1)');
  }, [sourceCanvas]);

  return (
    <div className="camkit-histogram-container">
      <canvas ref={canvasRef} width={256} height={120} className="histogram-canvas" />
      <div className="labels">
        <span>Luminance / RGB channels</span>
      </div>
    </div>
  );
}

/**
 * BeforeAfterSlider
 * Renders a draggable slider comparing modified vs original frames side-by-side.
 */
interface BeforeAfterSliderProps {
  originalUrl: string;
  modifiedCanvas: HTMLCanvasElement | null;
}

export function BeforeAfterSlider({ originalUrl, modifiedCanvas }: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dividerPercent, setDividerPercent] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  // Copy canvas to local renderer
  useEffect(() => {
    if (!modifiedCanvas || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = modifiedCanvas.width;
    canvas.height = modifiedCanvas.height;
    canvas.getContext('2d')!.drawImage(modifiedCanvas, 0, 0);
  }, [modifiedCanvas]);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setDividerPercent(percent);
  };

  const handleMouseDown = () => setIsDragging(true);

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) handleMove(e.clientX);
    };

    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove as any);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove as any);
    };
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      className="camkit-before-after-container"
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
    >
      {/* Background Original Image */}
      <img src={originalUrl} alt="Original" className="original-image" />

      {/* Foreground Modified Image Canvas (Clipped by width percent) */}
      <div
        className="modified-clip-container"
        style={{ clipPath: `polygon(0 0, ${dividerPercent}% 0, ${dividerPercent}% 100, 0 100)` }}
      >
        <canvas ref={canvasRef} className="modified-canvas" />
      </div>

      {/* Slider Split Bar Handle */}
      <div
        className="slider-divider"
        style={{ left: `${dividerPercent}%` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        <div className="divider-handle">
          <span>↔</span>
        </div>
      </div>

      {/* Tags */}
      <div className="badge original-badge">Before</div>
      <div className="badge modified-badge">After</div>
    </div>
  );
}

/**
 * CropTool
 * Grid overlay box selector with draggable bounds for bounding crops.
 */
interface CropToolProps {
  aspectRatio?: number;
  onCropApply: (region: { x: number; y: number; width: number; height: number }) => void;
  onCancel: () => void;
}

export function CropTool({ aspectRatio, onCropApply, onCancel }: CropToolProps) {
  const region = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };

  const handleApply = () => {
    onCropApply(region);
  };

  return (
    <div className="camkit-crop-overlay-tool">
      <div
        className="crop-selection-box"
        style={{
          left: `${region.x * 100}%`,
          top: `${region.y * 100}%`,
          width: `${region.width * 100}%`,
          height: `${region.height * 100}%`,
        }}
      >
        {/* Border grid grids */}
        <div className="crop-grid horizontal-third-1" />
        <div className="crop-grid horizontal-third-2" />
        <div className="crop-grid vertical-third-1" />
        <div className="crop-grid vertical-third-2" />

        {/* Drag handles */}
        <div className="drag-handle tl" />
        <div className="drag-handle tr" />
        <div className="drag-handle bl" />
        <div className="drag-handle br" />
      </div>

      {/* Control Buttons */}
      <div className="crop-action-bar">
        <button type="button" className="crop-btn cancel" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="crop-btn apply" onClick={handleApply}>
          Apply Crop
        </button>
      </div>
    </div>
  );
}
