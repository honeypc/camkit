// CamKit Vanilla TypeScript Creative Studio Laboratory
import { CamKit } from '@camkit/core';
import './style.css';

async function bootstrap() {
  // 1. Mock upload adapter simulating real network conditions
  const mockUploadAdapter = async (_task: any, onProgress: (pct: number) => void, abortSignal: AbortSignal) => {
    for (let percent = 5; percent <= 100; percent += 15) {
      if (abortSignal.aborted) throw new Error('Upload aborted');
      await new Promise((resolve) => setTimeout(resolve, 250));
      onProgress(Math.min(percent, 100));
    }
    return { url: 'https://cdn.camkit.io/uploads/vanilla-creative-lab.jpg' };
  };

  // 2. Initialize CamKit SDK Central Orchestrator
  const camkit = new CamKit({
    uploader: {
      uploadAdapter: mockUploadAdapter,
      concurrentLimit: 1,
      maxFileSize: 15 * 1024 * 1024, // 15MB limit
      allowedMimeTypes: ['image/jpeg', 'image/png'],
      offlineQueueEnabled: true,
      onQueueChange: (tasks) => {
        renderQueueLog(tasks);
      },
      onTaskProgress: (id, percent) => {
        const bar = document.getElementById(`progress-bar-${id}`);
        const text = document.getElementById(`progress-pct-${id}`);
        if (bar) bar.style.width = `${percent}%`;
        if (text) text.innerText = `${percent}%`;
      }
    }
  });

  // State Management variables
  let capturedBlob: Blob | null = null;
  let activeEditor = camkit.editor;
  let activePreset = 'none';
  let rotationAngle: 0 | 90 | 180 | 270 = 0;
  let flipH = false;
  let flipV = false;

  const adjustments = {
    exposure: 0,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    vibrance: 0,
    temperature: 0,
    vignette: 0,
    sharpening: 0,
    clarity: 0
  };

  // Get DOM Elements
  const videoElement = document.getElementById('camera-video') as HTMLVideoElement;
  const captureSection = document.getElementById('capture-section')!;
  const editorSection = document.getElementById('editor-section')!;
  const captureBtn = document.getElementById('capture-btn')!;
  const retakeBtn = document.getElementById('retake-btn')!;
  const uploadBtn = document.getElementById('upload-btn')!;
  const downloadBtn = document.getElementById('download-btn')!;
  const resetBtn = document.getElementById('reset-btn')!;
  const rotateBtn = document.getElementById('rotate-btn')!;
  const flipHBtn = document.getElementById('flip-h-btn')!;
  const flipVBtn = document.getElementById('flip-v-btn')!;
  const editorCanvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
  const queueLog = document.getElementById('queue-log')!;
  
  // Slider values & elements lists
  const sliders = {
    exposure: {
      input: document.getElementById('slider-exposure') as HTMLInputElement,
      valLabel: document.getElementById('val-exposure')!
    },
    brightness: {
      input: document.getElementById('slider-brightness') as HTMLInputElement,
      valLabel: document.getElementById('val-brightness')!
    },
    contrast: {
      input: document.getElementById('slider-contrast') as HTMLInputElement,
      valLabel: document.getElementById('val-contrast')!
    },
    saturation: {
      input: document.getElementById('slider-saturation') as HTMLInputElement,
      valLabel: document.getElementById('val-saturation')!
    },
    vibrance: {
      input: document.getElementById('slider-vibrance') as HTMLInputElement,
      valLabel: document.getElementById('val-vibrance')!
    },
    temperature: {
      input: document.getElementById('slider-temperature') as HTMLInputElement,
      valLabel: document.getElementById('val-temperature')!
    },
    vignette: {
      input: document.getElementById('slider-vignette') as HTMLInputElement,
      valLabel: document.getElementById('val-vignette')!
    },
    sharpening: {
      input: document.getElementById('slider-sharpening') as HTMLInputElement,
      valLabel: document.getElementById('val-sharpening')!
    },
    clarity: {
      input: document.getElementById('slider-clarity') as HTMLInputElement,
      valLabel: document.getElementById('val-clarity')!
    }
  };

  // Initialize online / offline listener
  const updateOnlineStatus = () => {
    const dot = document.querySelector('.indicator-dot')!;
    const text = document.querySelector('.indicator-text')!;
    if (navigator.onLine) {
      dot.className = 'indicator-dot online';
      text.textContent = 'Online';
    } else {
      dot.className = 'indicator-dot offline';
      text.textContent = 'Offline';
    }
  };
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  const updateSmartAssistUI = (result: any) => {
    const healthStatus = document.getElementById('health-status')!;
    const healthScore = document.getElementById('health-score')!;

    if (result.isHealthy) {
      healthStatus.className = 'health-badge status-healthy';
      healthStatus.innerText = 'Healthy';
    } else {
      healthStatus.className = 'health-badge status-unhealthy';
      healthStatus.innerText = 'Action Req';
    }

    healthScore.innerText = `${result.score}%`;

    const setRow = (id: string, check: any, formatVal: (v: number) => string) => {
      const el = document.getElementById(id)!;
      const valEl = el.querySelector('.metric-val')!;
      el.className = `metric-row ${check.isHealthy ? 'pass' : 'fail'}`;
      valEl.textContent = formatVal(check.value);
    };

    setRow('metric-blur', result.checks.blur, (v) => `${Math.round(v)} / 95`);
    setRow('metric-tooDark', result.checks.tooDark, (v) => `${Math.round(v)} / 55`);
    setRow('metric-overexposed', result.checks.overexposed, (v) => `${Math.round(v * 100)}% / 22%`);
    setRow('metric-lowContrast', result.checks.lowContrast, (v) => `${Math.round(v)} / 38`);
    setRow('metric-resolution', result.checks.minResolution, (v) => `${Math.round(v)}px / 600px`);
  };

  // 3. Mount and Boot Camera stream
  const startCamera = async () => {
    try {
      const stream = await camkit.camera.start();
      videoElement.srcObject = stream;
    } catch (err) {
      console.error('Camera stream initiation failed:', err);
      alert('Could not open camera sensor stream. Please verify camera permissions.');
    }
  };

  // 4. Handle Capture Trigger
  captureBtn.addEventListener('click', async () => {
    try {
      captureBtn.classList.add('active');
      // Grab high quality raw frames blob with Smart Assist checks and Auto Enhance
      capturedBlob = await camkit.capture({
        quality: 0.95,
        enableSmartAssist: true,
        autoEnhance: true,
        onSmartAssistResult: (result) => {
          updateSmartAssistUI(result);
        }
      });
      camkit.camera.stop(); // Stop sensor to save CPU
      captureBtn.classList.remove('active');

      // Transition layouts
      captureSection.classList.add('hidden');
      editorSection.classList.remove('hidden');

      // Load image source into WebGL rendering editor pipeline
      resetAdjustments();
      await activeEditor.load(capturedBlob);
      applyProcessing();
    } catch (e) {
      alert('Failed to capture snapshot: ' + e);
      captureBtn.classList.remove('active');
    }
  });

  // 5. Apply WebGL enhancements & preset filters dynamically
  const applyProcessing = async () => {
    if (!capturedBlob) return;

    // 1. Always reload original un-edited source into activeEditor to prevent compounding adjustments
    await activeEditor.load(capturedBlob);

    // 2. Apply Geometry & Transform first
    if (rotationAngle === 90 || rotationAngle === 180 || rotationAngle === 270) {
      activeEditor.rotate(rotationAngle);
    }
    if (flipH || flipV) {
      activeEditor.flip(flipH, flipV);
    }

    // 3. Run Lightroom-style WebGL/Canvas CPU enhancements
    activeEditor.adjust({
      exposure: adjustments.exposure,
      brightness: adjustments.brightness,
      contrast: adjustments.contrast,
      saturation: adjustments.saturation,
      vibrance: adjustments.vibrance,
      temperature: adjustments.temperature,
      vignette: adjustments.vignette,
      clarity: adjustments.clarity,
      sharpening: adjustments.sharpening
    });

    // 2. Overlay color preset filter if selected
    if (activePreset !== 'none') {
      activeEditor.filter(activePreset);
    }

    // 3. Render final canvas back onto the DOM viewport
    const outputCanvas = activeEditor.getCanvas();
    editorCanvas.width = outputCanvas.width;
    editorCanvas.height = outputCanvas.height;
    const ctx = editorCanvas.getContext('2d')!;
    ctx.drawImage(outputCanvas, 0, 0);

    // 4. REAL-TIME Smart Assist recalculation on the final edited output canvas!
    const { SmartPhotoAssist } = await import('@camkit/utils');
    const result = await SmartPhotoAssist.analyze(editorCanvas);
    updateSmartAssistUI(result);
  };

  // Setup live listeners on HSL range sliders
  Object.entries(sliders).forEach(([key, conf]) => {
    const adjustKey = key as keyof typeof adjustments;
    conf.input.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      adjustments[adjustKey] = val;
      conf.valLabel.textContent = val > 0 ? `+${val}` : `${val}`;
      applyProcessing();
    });
  });

  // Setup presets chip selectors
  const presetChips = document.querySelectorAll('.preset-chip');
  presetChips.forEach((chip) => {
    chip.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      presetChips.forEach((c) => c.classList.remove('active'));
      target.classList.add('active');

      activePreset = target.getAttribute('data-preset') || 'none';
      applyProcessing();
    });
  });

  // 6. Action button handlers
  retakeBtn.addEventListener('click', async () => {
    editorSection.classList.add('hidden');
    captureSection.classList.remove('hidden');
    
    // Clean editor resources
    activeEditor.destroy();
    activeEditor = camkit.editor;

    await startCamera();
  });

  // Export & Download handler
  downloadBtn.addEventListener('click', async () => {
    try {
      const blob = await activeEditor.export();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `camkit-vanilla-edit-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Could not export image: ' + e);
    }
  });

  // Upload Queue pipeline handler
  uploadBtn.addEventListener('click', async () => {
    try {
      uploadBtn.setAttribute('disabled', 'true');
      uploadBtn.innerText = '⌛ Enqueuing...';

      const finalBlob = await activeEditor.export();
      const id = await camkit.upload(finalBlob, {
        label: `Vanilla Edit Preset: ${activePreset}`
      });

      console.log(`Task successfully enqueued with Queue ID: ${id}`);
      
      uploadBtn.removeAttribute('disabled');
      uploadBtn.innerText = '🚀 Dispatch to Queue';
    } catch (e) {
      alert('Failed to dispatch to upload queue: ' + e);
      uploadBtn.removeAttribute('disabled');
      uploadBtn.innerText = '🚀 Dispatch to Queue';
    }
  });

  // Reset settings and reload original image
  resetBtn.addEventListener('click', async () => {
    try {
      resetBtn.setAttribute('disabled', 'true');
      resetBtn.innerText = '⌛ Resetting...';

      resetAdjustments();
      if (capturedBlob) {
        await activeEditor.load(capturedBlob);
      }
      applyProcessing();

      resetBtn.removeAttribute('disabled');
      resetBtn.innerText = '🔄 Reset All Settings';
    } catch (e) {
      alert('Failed to reset settings: ' + e);
      resetBtn.removeAttribute('disabled');
      resetBtn.innerText = '🔄 Reset All Settings';
    }
  });

  // Reset Sliders
  const resetAdjustments = () => {
    activePreset = 'none';
    presetChips.forEach((c) => {
      if (c.getAttribute('data-preset') === 'none') {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

    Object.entries(sliders).forEach(([key, conf]) => {
      const adjustKey = key as keyof typeof adjustments;
      adjustments[adjustKey] = 0;
      conf.input.value = '0';
      conf.valLabel.textContent = '0';
    });
  };

  // Render active offline queue dispatches list
  const renderQueueLog = (tasks: any[]) => {
    if (tasks.length === 0) {
      queueLog.innerHTML = '<div class="empty-queue-msg">No active dispatches in offline queue.</div>';
      return;
    }

    queueLog.innerHTML = '';
    tasks.forEach((task) => {
      const item = document.createElement('div');
      item.className = 'queue-item';
      
      const sizeKB = (task.file.size / 1024).toFixed(1);

      item.innerHTML = `
        <span class="queue-task-id">${task.id.slice(0, 11)}</span>
        <div class="queue-progress-container">
          <div class="queue-progress-label">
            <span>Size: ${sizeKB} KB</span>
            <span id="progress-pct-${task.id}">${task.progress}%</span>
          </div>
          <div class="queue-progress-track">
            <div id="progress-bar-${task.id}" class="queue-progress-bar" style="width: ${task.progress}%"></div>
          </div>
        </div>
        <span class="queue-status-badge badge-${task.status}">${task.status}</span>
      `;

      queueLog.appendChild(item);
    });
  };

  // Boot on startup
  await startCamera();
}

bootstrap();
