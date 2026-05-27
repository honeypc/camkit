// CamKit Vanilla TypeScript Creative Studio — Multi-Step Capture Edition
import { CamKit } from '@camkit/core';
import './style.css';

// ── Local type definitions (mirrors @camkit/types for self-contained example) ──

interface CaptureFrame {
  type: 'card-landscape' | 'card-portrait' | 'passport' | 'square' | 'face' | 'custom';
  aspectRatio?: number;   // only used when type === 'custom'
  label?: string;         // text shown inside the frame guide
  color?: string;         // border & corner color (default: white)
  vignetteOpacity?: number; // 0–1 darkness outside frame (default: 0.55)
}

interface CaptureStep {
  id: string;
  icon?: string;          // emoji shown in step pill
  label: string;          // short pill label (e.g. "Front Side")
  instruction: string;    // guidance text shown below camera
  frame?: CaptureFrame;
}

interface CaptureStepResult {
  step: CaptureStep;
  blob: Blob;
  objectUrl: string;      // pre-created for preview images
  timestamp: number;
}

interface CaptureFlow {
  title: string;
  steps: CaptureStep[];
}

// ── Pre-built flow configurations ───────────────────────────────────────────

const CAPTURE_FLOWS: Record<string, CaptureFlow> = {
  'id-card': {
    title: 'ID Card Capture',
    steps: [
      {
        id: 'id-front',
        icon: '🪪',
        label: 'Front Side',
        instruction: 'Place the FRONT of your ID card flat within the frame. Ensure all four corners are visible and there is no glare or shadow.',
        frame: { type: 'card-landscape', label: 'ID Card — Front Side', color: '#9d4edd', vignetteOpacity: 0.62 }
      },
      {
        id: 'id-back',
        icon: '🔄',
        label: 'Back Side',
        instruction: 'Flip your ID card over. Place the BACK side flat within the frame, ensuring barcodes and text are clearly readable.',
        frame: { type: 'card-landscape', label: 'ID Card — Back Side', color: '#9d4edd', vignetteOpacity: 0.62 }
      }
    ]
  },
  'passport': {
    title: 'Passport Capture',
    steps: [
      {
        id: 'passport-bio',
        icon: '🛂',
        label: 'Bio Page',
        instruction: 'Open your passport to the photo/biographic page. Place it flat within the frame with all MRZ lines at the bottom clearly visible.',
        frame: { type: 'passport', label: 'Passport — Biometric Page', color: '#00e676', vignetteOpacity: 0.62 }
      }
    ]
  },
  'selfie-id': {
    title: 'Selfie + ID Verification',
    steps: [
      {
        id: 'selfie',
        icon: '🤳',
        label: 'Selfie',
        instruction: 'Position your face within the oval guide. Look directly at the camera with a neutral expression in good, even lighting.',
        frame: { type: 'face', label: 'Your Face', color: '#29b6f6', vignetteOpacity: 0.55 }
      },
      {
        id: 'id-front',
        icon: '🪪',
        label: 'ID Front',
        instruction: 'Now place the FRONT of your ID card flat within the frame. Ensure all text and the photo are clearly visible.',
        frame: { type: 'card-landscape', label: 'ID Card — Front Side', color: '#9d4edd', vignetteOpacity: 0.62 }
      }
    ]
  }
};

// Frame aspect ratios (width / height) per type
const FRAME_RATIOS: Record<string, number> = {
  'card-landscape': 85.6 / 54,   // ISO/IEC 7810 ID-1 standard (~1.585)
  'card-portrait':  54 / 85.6,   // ~0.631
  'passport':       125 / 88,    // ICAO 9303 biometric passport (~1.420)
  'square':         1,
  'face':           0.75,
};

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap() {

  // 1. Mock upload adapter (simulates network latency & progress)
  const mockUploadAdapter = async (
    _task: any,
    onProgress: (pct: number) => void,
    abortSignal: AbortSignal
  ) => {
    for (let pct = 10; pct <= 100; pct += 18) {
      if (abortSignal.aborted) throw new Error('Upload aborted');
      await new Promise(r => setTimeout(r, 220));
      onProgress(Math.min(pct, 100));
    }
    return { url: `https://cdn.camkit.io/uploads/${Date.now()}.jpg` };
  };

  // 2. Initialize CamKit SDK
  const camkit = new CamKit({
    uploader: {
      uploadAdapter: mockUploadAdapter,
      concurrentLimit: 3,
      maxFileSize: 15 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      offlineQueueEnabled: true,
      onQueueChange: tasks => renderQueueLog(tasks),
      onTaskProgress: (id, percent) => {
        const bar  = document.getElementById(`progress-bar-${id}`);
        const text = document.getElementById(`progress-pct-${id}`);
        if (bar)  bar.style.width    = `${percent}%`;
        if (text) text.innerText     = `${percent}%`;
      }
    }
  });

  // ── App State ──────────────────────────────────────────────────────────────
  type AppMode = 'single' | 'multi';
  let appMode: AppMode = 'single';
  let activeFlow: CaptureFlow | null = null;
  let multiStepIndex = 0;
  let stepResults: CaptureStepResult[] = [];
  let pendingStepResult: CaptureStepResult | null = null;
  let editingStepIndex = -1;   // ≥ 0 when editing a step result from the summary

  let capturedBlob: Blob | null = null;
  let activeEditor = camkit.editor;
  let activePreset = 'none';
  let rotationAngle: 0 | 90 | 180 | 270 = 0;
  let flipH = false;
  let flipV = false;

  const adjustments = {
    exposure: 0, brightness: 0, contrast: 0, saturation: 0,
    vibrance: 0, temperature: 0, vignette: 0, sharpening: 0, clarity: 0
  };

  // ── DOM References ─────────────────────────────────────────────────────────
  const videoEl          = document.getElementById('camera-video')           as HTMLVideoElement;
  const editorCanvas     = document.getElementById('editor-canvas')          as HTMLCanvasElement;
  const photoFileInput   = document.getElementById('photo-file-input')       as HTMLInputElement;
  const queueLog         = document.getElementById('queue-log')!;

  // Sections
  const modeSection          = document.getElementById('mode-section')!;
  const captureSection       = document.getElementById('capture-section')!;
  const stepReviewSection    = document.getElementById('step-review-section')!;
  const multiSummarySection  = document.getElementById('multi-summary-section')!;
  const editorSection        = document.getElementById('editor-section')!;
  const ALL_SECTIONS = [modeSection, captureSection, stepReviewSection, multiSummarySection, editorSection];

  // Capture controls
  const captureBtn        = document.getElementById('capture-btn')!;
  const backToModeBtn     = document.getElementById('back-to-mode-btn')!;
  const pickPhotoBtn      = document.getElementById('pick-photo-btn')!;
  const singleModeExtras  = document.getElementById('single-mode-extras')!;
  const dropZoneOverlay   = document.getElementById('drop-zone-overlay')!;

  // Frame + step overlay
  const frameOverlay      = document.getElementById('frame-overlay')!;
  const frameWindow       = document.getElementById('frame-window')!;
  const frameInnerLabel   = document.getElementById('frame-inner-label')!;
  const stepIndicator     = document.getElementById('step-indicator')!;
  const stepBreadcrumbs   = document.getElementById('step-breadcrumbs')!;
  const stepInstructionEl = document.getElementById('step-instruction')!;

  // Step review
  const reviewPreviewImg      = document.getElementById('review-preview-img')  as HTMLImageElement;
  const reviewStepBadge       = document.getElementById('review-step-badge')!;
  const reviewFlowLabel       = document.getElementById('review-flow-label')!;
  const reviewStepName        = document.getElementById('review-step-name')!;
  const reviewStepInstruction = document.getElementById('review-step-instruction')!;
  const reviewRetakeBtn       = document.getElementById('review-retake-btn')!;
  const reviewConfirmBtn      = document.getElementById('review-confirm-btn')!;

  // Summary
  const summaryTitle          = document.getElementById('summary-title')!;
  const summarySubtitle       = document.getElementById('summary-subtitle')!;
  const summaryCapturesGrid   = document.getElementById('summary-captures-grid')!;
  const summaryStartoverBtn   = document.getElementById('summary-startover-btn')!;
  const summaryDispatchBtn    = document.getElementById('summary-dispatch-btn')!;

  // Editor
  const editorBadge = document.getElementById('editor-badge')!;
  const retakeBtn   = document.getElementById('retake-btn')!;
  const uploadBtn   = document.getElementById('upload-btn')!;
  const downloadBtn = document.getElementById('download-btn')!;
  const resetBtn    = document.getElementById('reset-btn')!;
  const rotateBtn   = document.getElementById('rotate-btn')!;
  const flipHBtn    = document.getElementById('flip-h-btn')!;
  const flipVBtn    = document.getElementById('flip-v-btn')!;

  // Sliders
  const sliders = {
    exposure:    { input: document.getElementById('slider-exposure')    as HTMLInputElement, valLabel: document.getElementById('val-exposure')! },
    brightness:  { input: document.getElementById('slider-brightness')  as HTMLInputElement, valLabel: document.getElementById('val-brightness')! },
    contrast:    { input: document.getElementById('slider-contrast')    as HTMLInputElement, valLabel: document.getElementById('val-contrast')! },
    saturation:  { input: document.getElementById('slider-saturation')  as HTMLInputElement, valLabel: document.getElementById('val-saturation')! },
    vibrance:    { input: document.getElementById('slider-vibrance')    as HTMLInputElement, valLabel: document.getElementById('val-vibrance')! },
    temperature: { input: document.getElementById('slider-temperature') as HTMLInputElement, valLabel: document.getElementById('val-temperature')! },
    vignette:    { input: document.getElementById('slider-vignette')    as HTMLInputElement, valLabel: document.getElementById('val-vignette')! },
    sharpening:  { input: document.getElementById('slider-sharpening') as HTMLInputElement, valLabel: document.getElementById('val-sharpening')! },
    clarity:     { input: document.getElementById('slider-clarity')     as HTMLInputElement, valLabel: document.getElementById('val-clarity')! },
  };

  // ── Section Navigation ─────────────────────────────────────────────────────
  const showSection = (target: HTMLElement) => {
    ALL_SECTIONS.forEach(s => s.classList.toggle('hidden', s !== target));
  };

  // ── Online status ──────────────────────────────────────────────────────────
  const updateOnlineStatus = () => {
    const dot  = document.querySelector('.indicator-dot')!;
    const text = document.querySelector('.indicator-text')!;
    dot.className = `indicator-dot ${navigator.onLine ? 'online' : 'offline'}`;
    text.textContent = navigator.onLine ? 'Online' : 'Offline';
  };
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // ── Smart Assist HUD ───────────────────────────────────────────────────────
  const updateSmartAssistUI = (result: any) => {
    const healthStatus = document.getElementById('health-status')!;
    const healthScore  = document.getElementById('health-score')!;
    healthStatus.className   = result.isHealthy ? 'health-badge status-healthy' : 'health-badge status-unhealthy';
    healthStatus.innerText   = result.isHealthy ? 'Healthy' : 'Action Req';
    healthScore.innerText    = `${result.score}%`;

    const setRow = (id: string, check: any, fmt: (v: number) => string) => {
      const el = document.getElementById(id)!;
      el.className = `metric-row ${check.isHealthy ? 'pass' : 'fail'}`;
      el.querySelector('.metric-val')!.textContent = fmt(check.value);
    };
    setRow('metric-blur',        result.checks.blur,          v => `${Math.round(v)} / 95`);
    setRow('metric-tooDark',     result.checks.tooDark,       v => `${Math.round(v)} / 55`);
    setRow('metric-overexposed', result.checks.overexposed,   v => `${Math.round(v * 100)}% / 22%`);
    setRow('metric-lowContrast', result.checks.lowContrast,   v => `${Math.round(v)} / 38`);
    setRow('metric-resolution',  result.checks.minResolution, v => `${Math.round(v)}px / 600px`);
  };

  // ── Camera ─────────────────────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await camkit.camera.start();
      videoEl.srcObject = stream;
    } catch (err) {
      console.error('Camera stream failed:', err);
      alert('Could not open camera. Please verify camera permissions in your browser.');
    }
  };

  // ── Frame Overlay Renderer ─────────────────────────────────────────────────
  const renderFrameOverlay = (frame?: CaptureFrame) => {
    if (!frame) { frameOverlay.classList.add('hidden'); return; }

    const wrapper = document.getElementById('camera-stream-wrapper')!;
    const wW = wrapper.clientWidth;
    const wH = wrapper.clientHeight;
    const ratio = frame.type === 'custom'
      ? (frame.aspectRatio ?? 1)
      : (FRAME_RATIOS[frame.type] ?? 1);

    // Fill 82% of width or 76% of height — whichever fits
    let fW = wW * 0.82;
    let fH = fW / ratio;
    if (fH > wH * 0.76) { fH = wH * 0.76; fW = fH * ratio; }

    const color = frame.color ?? '#ffffff';
    frameWindow.style.width       = `${fW}px`;
    frameWindow.style.height      = `${fH}px`;
    frameWindow.style.borderColor = color;
    frameWindow.style.setProperty('--frame-color', color);
    frameWindow.style.boxShadow   = `0 0 0 9999px rgba(0,0,0,${frame.vignetteOpacity ?? 0.55})`;
    frameWindow.classList.toggle('face-frame', frame.type === 'face');
    frameInnerLabel.textContent = frame.label ?? '';
    frameInnerLabel.style.color = color;
    frameOverlay.classList.remove('hidden');
  };

  // ── Step Indicator Renderer ────────────────────────────────────────────────
  const renderStepIndicator = (steps: CaptureStep[], currentIdx: number) => {
    stepBreadcrumbs.innerHTML = steps.map((step, i) => {
      const cls = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending';
      const connector = i < steps.length - 1 ? '<div class="step-connector"></div>' : '';
      return `<div class="step-pill ${cls}">${step.icon ?? ''} <span>${step.label}</span></div>${connector}`;
    }).join('');
    stepInstructionEl.textContent = steps[currentIdx].instruction;
    stepIndicator.classList.remove('hidden');
  };

  // ── Start a flow ───────────────────────────────────────────────────────────
  const startFlow = async (flowKey: string) => {
    multiStepIndex = 0;
    stepResults    = [];
    pendingStepResult = null;
    editingStepIndex  = -1;

    if (flowKey === 'single') {
      appMode    = 'single';
      activeFlow = null;
      frameOverlay.classList.add('hidden');
      stepIndicator.classList.add('hidden');
      singleModeExtras.classList.remove('hidden');
      showSection(captureSection);
      await startCamera();
    } else {
      appMode    = 'multi';
      activeFlow = CAPTURE_FLOWS[flowKey] ?? null;
      if (!activeFlow) return;
      singleModeExtras.classList.add('hidden');
      showSection(captureSection);
      await startCamera();
      showCaptureStep(0);
    }
  };

  // ── Advance to capture step N ──────────────────────────────────────────────
  const showCaptureStep = (index: number) => {
    if (!activeFlow) return;
    multiStepIndex = index;
    const step = activeFlow.steps[index];
    renderFrameOverlay(step.frame);
    renderStepIndicator(activeFlow.steps, index);
  };

  // ── After capture: show per-step review ───────────────────────────────────
  const showStepReview = (result: CaptureStepResult) => {
    pendingStepResult              = result;
    reviewPreviewImg.src           = result.objectUrl;
    reviewFlowLabel.textContent    = activeFlow?.title ?? '';
    reviewStepName.textContent     = `${result.step.icon ?? ''} ${result.step.label}`;
    reviewStepInstruction.textContent = result.step.instruction;
    reviewStepBadge.textContent    = `Step ${multiStepIndex + 1} of ${activeFlow!.steps.length}`;
    showSection(stepReviewSection);
  };

  // ── Confirm the pending step ───────────────────────────────────────────────
  const confirmStep = async () => {
    if (!pendingStepResult || !activeFlow) return;
    stepResults.push(pendingStepResult);
    pendingStepResult = null;

    const next = multiStepIndex + 1;
    if (next < activeFlow.steps.length) {
      showSection(captureSection);
      showCaptureStep(next);
    } else {
      camkit.camera.stop();
      showSummary();
    }
  };

  // ── Retake: discard pending and re-show camera for same step ──────────────
  const retakeCurrentStep = () => {
    if (pendingStepResult) {
      URL.revokeObjectURL(pendingStepResult.objectUrl);
      pendingStepResult = null;
    }
    showSection(captureSection);
    showCaptureStep(multiStepIndex);
  };

  // ── Show final summary grid ────────────────────────────────────────────────
  const showSummary = () => {
    summaryTitle.textContent    = `${activeFlow?.title ?? 'Capture'} Complete`;
    summarySubtitle.textContent = `${stepResults.length} photo${stepResults.length !== 1 ? 's' : ''} captured — review and edit before submitting`;

    summaryCapturesGrid.innerHTML = stepResults.map((r, i) => `
      <div class="capture-thumb-card">
        <img class="capture-thumb-img" src="${r.objectUrl}" alt="${r.step.label}">
        <div class="capture-thumb-overlay">
          <div class="capture-thumb-label">${r.step.icon ?? ''} ${r.step.label}</div>
          <button class="capture-edit-btn" data-step-index="${i}">✏️ Edit</button>
        </div>
      </div>
    `).join('');

    summaryCapturesGrid.querySelectorAll<HTMLButtonElement>('.capture-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-step-index') ?? '0');
        editStepFromSummary(idx);
      });
    });

    showSection(multiSummarySection);
  };

  // ── Open editor for a specific step result ─────────────────────────────────
  const editStepFromSummary = async (index: number) => {
    editingStepIndex      = index;
    capturedBlob          = stepResults[index].blob;
    editorBadge.textContent = `Editing: ${stepResults[index].step.icon ?? ''} ${stepResults[index].step.label}`;
    retakeBtn.textContent = '← Back to Summary';
    resetAdjustments();
    await activeEditor.load(capturedBlob);
    applyProcessing();
    showSection(editorSection);
  };

  // ── Open editor (single mode) ──────────────────────────────────────────────
  const openEditor = async (blob: Blob) => {
    capturedBlob           = blob;
    editingStepIndex       = -1;
    camkit.camera.stop();
    editorBadge.textContent = 'Photo Editor Active';
    retakeBtn.textContent  = '📸 New Photo';
    resetAdjustments();
    await activeEditor.load(capturedBlob);
    applyProcessing();
    showSection(editorSection);
  };

  // ── Apply WebGL/Canvas2D processing pipeline ───────────────────────────────
  const applyProcessing = async () => {
    if (!capturedBlob) return;
    await activeEditor.load(capturedBlob);
    if (rotationAngle !== 0) activeEditor.rotate(rotationAngle);
    if (flipH || flipV)      activeEditor.flip(flipH, flipV);
    activeEditor.adjust({
      exposure: adjustments.exposure, brightness: adjustments.brightness,
      contrast:    adjustments.contrast,  saturation: adjustments.saturation,
      vibrance:    adjustments.vibrance,  temperature: adjustments.temperature,
      vignette:    adjustments.vignette,  clarity:    adjustments.clarity,
      sharpening:  adjustments.sharpening
    });
    if (activePreset !== 'none') activeEditor.filter(activePreset);

    const out = activeEditor.getCanvas();
    editorCanvas.width  = out.width;
    editorCanvas.height = out.height;
    editorCanvas.getContext('2d')!.drawImage(out, 0, 0);

    const { SmartPhotoAssist } = await import('@camkit/utils');
    const result = await SmartPhotoAssist.analyze(editorCanvas);
    updateSmartAssistUI(result);
  };

  // ── Reset sliders & geometry ───────────────────────────────────────────────
  const resetAdjustments = () => {
    rotationAngle = 0; flipH = false; flipV = false;
    activePreset = 'none';
    document.querySelectorAll('.preset-chip').forEach(c =>
      c.classList.toggle('active', c.getAttribute('data-preset') === 'none')
    );
    Object.entries(sliders).forEach(([key, conf]) => {
      (adjustments as any)[key] = 0;
      conf.input.value         = '0';
      conf.valLabel.textContent = '0';
    });
  };

  // ── Mode selection ─────────────────────────────────────────────────────────
  document.querySelectorAll<HTMLElement>('.flow-card').forEach(card => {
    card.addEventListener('click', () => startFlow(card.getAttribute('data-flow') ?? 'single'));
  });

  backToModeBtn.addEventListener('click', () => {
    camkit.camera.stop();
    if (pendingStepResult) { URL.revokeObjectURL(pendingStepResult.objectUrl); pendingStepResult = null; }
    frameOverlay.classList.add('hidden');
    stepIndicator.classList.add('hidden');
    showSection(modeSection);
  });

  // ── Camera capture button ──────────────────────────────────────────────────
  captureBtn.addEventListener('click', async () => {
    try {
      captureBtn.classList.add('active');

      if (appMode === 'multi' && activeFlow) {
        const blob = await camkit.capture({ quality: 0.95 });
        captureBtn.classList.remove('active');
        showStepReview({ step: activeFlow.steps[multiStepIndex], blob, objectUrl: URL.createObjectURL(blob), timestamp: Date.now() });
      } else {
        const blob = await camkit.capture({
          quality: 0.95, enableSmartAssist: true, autoEnhance: true,
          onSmartAssistResult: updateSmartAssistUI
        });
        captureBtn.classList.remove('active');
        await openEditor(blob);
      }
    } catch (e) {
      alert('Capture failed: ' + e);
      captureBtn.classList.remove('active');
    }
  });

  // ── Step review buttons ────────────────────────────────────────────────────
  reviewConfirmBtn.addEventListener('click', confirmStep);
  reviewRetakeBtn.addEventListener('click',  retakeCurrentStep);

  // ── Summary buttons ────────────────────────────────────────────────────────
  summaryStartoverBtn.addEventListener('click', () => {
    stepResults.forEach(r => URL.revokeObjectURL(r.objectUrl));
    stepResults    = [];
    activeFlow     = null;
    appMode        = 'single';
    showSection(modeSection);
  });

  summaryDispatchBtn.addEventListener('click', async () => {
    summaryDispatchBtn.setAttribute('disabled', 'true');
    summaryDispatchBtn.textContent = '⌛ Submitting...';
    try {
      await Promise.all(stepResults.map(r =>
        camkit.upload(r.blob, { stepId: r.step.id, label: r.step.label, flow: activeFlow?.title })
      ));
      summaryDispatchBtn.removeAttribute('disabled');
      summaryDispatchBtn.textContent = '✅ Submitted!';
    } catch (e) {
      alert('Submission failed: ' + e);
      summaryDispatchBtn.removeAttribute('disabled');
      summaryDispatchBtn.textContent = '🚀 Submit All Photos';
    }
  });

  // ── Editor: retake / back-to-summary ──────────────────────────────────────
  retakeBtn.addEventListener('click', async () => {
    if (editingStepIndex >= 0) {
      // Save edited blob back into stepResults
      try {
        const updated = await activeEditor.export();
        URL.revokeObjectURL(stepResults[editingStepIndex].objectUrl);
        stepResults[editingStepIndex] = {
          ...stepResults[editingStepIndex],
          blob: updated,
          objectUrl: URL.createObjectURL(updated)
        };
      } catch (_) {}
      editingStepIndex = -1;
      showSummary();
    } else {
      activeEditor.destroy();
      activeEditor = camkit.editor;
      capturedBlob = null;
      photoFileInput.value = '';
      showSection(modeSection);
    }
  });

  // ── Upload photo from device (single mode) ─────────────────────────────────
  pickPhotoBtn.addEventListener('click', () => { photoFileInput.value = ''; photoFileInput.click(); });

  photoFileInput.addEventListener('change', async () => {
    const file = photoFileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
    await openEditor(file);
  });

  // Drag-and-drop (single mode only)
  captureSection.addEventListener('dragenter', e => { e.preventDefault(); if (appMode === 'single') dropZoneOverlay.classList.remove('hidden'); });
  captureSection.addEventListener('dragover',  e => e.preventDefault());
  captureSection.addEventListener('dragleave', e => {
    if (!captureSection.contains(e.relatedTarget as Node)) dropZoneOverlay.classList.add('hidden');
  });
  captureSection.addEventListener('drop', async e => {
    e.preventDefault();
    dropZoneOverlay.classList.add('hidden');
    if (appMode !== 'single') return;
    const file = e.dataTransfer?.files[0];
    if (!file?.type.startsWith('image/')) { alert('Not a supported image type.'); return; }
    await openEditor(file);
  });

  // ── Slider listeners ───────────────────────────────────────────────────────
  Object.entries(sliders).forEach(([key, conf]) => {
    conf.input.addEventListener('input', e => {
      const val = parseInt((e.target as HTMLInputElement).value);
      (adjustments as any)[key] = val;
      conf.valLabel.textContent = val > 0 ? `+${val}` : `${val}`;
      applyProcessing();
    });
  });

  // ── Preset chips ───────────────────────────────────────────────────────────
  const presetChips = document.querySelectorAll('.preset-chip');
  presetChips.forEach(chip => {
    chip.addEventListener('click', e => {
      const target = e.currentTarget as HTMLElement;
      // Only apply to non-transform chips (transform row uses data-preset absent)
      if (!target.hasAttribute('data-preset')) return;
      presetChips.forEach(c => { if (c.hasAttribute('data-preset')) c.classList.remove('active'); });
      target.classList.add('active');
      activePreset = target.getAttribute('data-preset') ?? 'none';
      applyProcessing();
    });
  });

  // ── Geometry transforms ────────────────────────────────────────────────────
  rotateBtn.addEventListener('click', () => { rotationAngle = ((rotationAngle + 90) % 360) as 0|90|180|270; applyProcessing(); });
  flipHBtn.addEventListener('click',  () => { flipH = !flipH; applyProcessing(); });
  flipVBtn.addEventListener('click',  () => { flipV = !flipV; applyProcessing(); });

  // ── Editor action buttons ──────────────────────────────────────────────────
  downloadBtn.addEventListener('click', async () => {
    try {
      const blob = await activeEditor.export();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `camkit-edit-${Date.now()}.jpg`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { alert('Export failed: ' + e); }
  });

  uploadBtn.addEventListener('click', async () => {
    try {
      uploadBtn.setAttribute('disabled', 'true'); uploadBtn.innerText = '⌛ Enqueuing...';
      const blob = await activeEditor.export();
      await camkit.upload(blob, { label: `Vanilla Edit — ${activePreset}` });
      uploadBtn.removeAttribute('disabled'); uploadBtn.innerText = '🚀 Dispatch to Queue';
    } catch (e) {
      alert('Upload failed: ' + e);
      uploadBtn.removeAttribute('disabled'); uploadBtn.innerText = '🚀 Dispatch to Queue';
    }
  });

  resetBtn.addEventListener('click', async () => {
    resetBtn.setAttribute('disabled', 'true'); resetBtn.innerText = '⌛ Resetting...';
    resetAdjustments();
    if (capturedBlob) await activeEditor.load(capturedBlob);
    applyProcessing();
    resetBtn.removeAttribute('disabled'); resetBtn.innerText = '🔄 Reset All Settings';
  });

  // ── Queue log renderer ─────────────────────────────────────────────────────
  const renderQueueLog = (tasks: any[]) => {
    if (!tasks.length) {
      queueLog.innerHTML = '<div class="empty-queue-msg">No active dispatches in offline queue.</div>';
      return;
    }
    queueLog.innerHTML = tasks.map(task => {
      const sizeKB = (task.file.size / 1024).toFixed(1);
      return `
        <div class="queue-item">
          <span class="queue-task-id">${task.id.slice(0, 11)}</span>
          <div class="queue-progress-container">
            <div class="queue-progress-label">
              <span>Size: ${sizeKB} KB</span>
              <span id="progress-pct-${task.id}">${task.progress}%</span>
            </div>
            <div class="queue-progress-track">
              <div id="progress-bar-${task.id}" class="queue-progress-bar" style="width:${task.progress}%"></div>
            </div>
          </div>
          <span class="queue-status-badge badge-${task.status}">${task.status}</span>
        </div>`;
    }).join('');
  };

  // ── Boot: show mode selection screen ──────────────────────────────────────
  showSection(modeSection);
}

bootstrap();
