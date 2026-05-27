// WebGL2 Core GPU Image Renderer Pipeline
import { AdjustmentParams, BlurParams } from '@camkit/types';
import { VERTEX_SHADER, FRAGMENT_SHADER, CONVOLUTION_FRAGMENT_SHADER, GAUSSIAN_BLUR_FRAGMENT_SHADER } from './shaders';

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement | OffscreenCanvas;

  // Cached compiled program handles
  private adjustProgram!: WebGLProgram;
  private convProgram!: WebGLProgram;
  private blurProgram!: WebGLProgram;

  // Vertex buffer
  private positionBuffer!: WebGLBuffer;

  constructor(targetCanvas?: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = targetCanvas || document.createElement('canvas');
    const glContext = this.canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    });

    if (!glContext) {
      throw new Error('WebGL2 not supported in this browser context');
    }
    this.gl = glContext;

    this.initPipeline();
  }

  private initPipeline() {
    const gl = this.gl;

    // Compile and cache programs
    this.adjustProgram = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    this.convProgram = this.createProgram(VERTEX_SHADER, CONVOLUTION_FRAGMENT_SHADER);
    this.blurProgram = this.createProgram(VERTEX_SHADER, GAUSSIAN_BLUR_FRAGMENT_SHADER);

    // Setup Quad geometry (-1 to 1)
    const vertices = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0,
    ]);

    this.positionBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }

  /**
   * Main rendering processor. Processes image source, applies adjustments, sharpening/clarity, and blurs.
   */
  public render(
    source: HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas,
    adjustments: AdjustmentParams,
    blur?: BlurParams
  ): HTMLCanvasElement {
    const gl = this.gl;

    // Resize viewport to match source
    this.canvas.width = source.width;
    this.canvas.height = source.height;
    gl.viewport(0, 0, source.width, source.height);

    // Create primary input texture
    const texture = this.createTexture(source);

    // We will do multi-pass rendering. Create a framebuffer for ping-pong passes.
    let currentTex = texture;
    let nextFb = this.createFramebuffer(source.width, source.height);

    // PASS 1: Color Adjustments & Vignette
    gl.bindFramebuffer(gl.FRAMEBUFFER, nextFb.framebuffer);
    gl.useProgram(this.adjustProgram);

    this.setupAttribute(this.adjustProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTex);

    // Set Uniforms
    this.setUniform(this.adjustProgram, 'u_image', 0);
    this.setUniform(this.adjustProgram, 'u_brightness', (adjustments.brightness ?? 0) / 100);
    this.setUniform(this.adjustProgram, 'u_contrast', (adjustments.contrast ?? 0) / 100);
    this.setUniform(this.adjustProgram, 'u_exposure', (adjustments.exposure ?? 0) / 100);
    this.setUniform(this.adjustProgram, 'u_saturation', (adjustments.saturation ?? 0) / 100);
    this.setUniform(this.adjustProgram, 'u_vibrance', (adjustments.vibrance ?? 0) / 100);
    this.setUniform(this.adjustProgram, 'u_temperature', (adjustments.temperature ?? 0) / 100);
    this.setUniform(this.adjustProgram, 'u_tint', (adjustments.tint ?? 0) / 100);
    this.setUniform(this.adjustProgram, 'u_highlights', (adjustments.highlights ?? 0) / 100);
    this.setUniform(this.adjustProgram, 'u_shadows', (adjustments.shadows ?? 0) / 100);
    this.setUniform(this.adjustProgram, 'u_vignette', (adjustments.vignette ?? 0) / 100);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Ping-pong texture assignments
    gl.deleteTexture(currentTex);
    currentTex = nextFb.texture;
    nextFb = this.createFramebuffer(source.width, source.height);

    // PASS 2: Convolution Effects (Sharpening / Clarity)
    if ((adjustments.sharpening ?? 0) > 0 || (adjustments.clarity ?? 0) > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, nextFb.framebuffer);
      gl.useProgram(this.convProgram);

      this.setupAttribute(this.convProgram);
      gl.bindTexture(gl.TEXTURE_2D, currentTex);

      this.setUniform(this.convProgram, 'u_image', 0);
      this.setUniform(this.convProgram, 'u_sharpen', (adjustments.sharpening ?? 0) / 100);
      this.setUniform(this.convProgram, 'u_clarity', (adjustments.clarity ?? 0) / 100);
      this.setUniform(this.convProgram, 'u_textureSize', [source.width, source.height]);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.deleteTexture(currentTex);
      currentTex = nextFb.texture;
      nextFb = this.createFramebuffer(source.width, source.height);
    }

    // PASS 3: Gaussian Blur Passes (Two-Pass: Horiz & Vert)
    if (blur && blur.radius > 0) {
      // Pass 3a: Horizontal Blur
      gl.bindFramebuffer(gl.FRAMEBUFFER, nextFb.framebuffer);
      gl.useProgram(this.blurProgram);

      this.setupAttribute(this.blurProgram);
      gl.bindTexture(gl.TEXTURE_2D, currentTex);

      this.setUniform(this.blurProgram, 'u_image', 0);
      this.setUniform(this.blurProgram, 'u_direction', [1.0, 0.0]);
      this.setUniform(this.blurProgram, 'u_radius', blur.radius);
      this.setUniform(this.blurProgram, 'u_textureSize', [source.width, source.height]);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.deleteTexture(currentTex);
      currentTex = nextFb.texture;
      nextFb = this.createFramebuffer(source.width, source.height);

      // Pass 3b: Vertical Blur
      gl.bindFramebuffer(gl.FRAMEBUFFER, nextFb.framebuffer);
      this.setupAttribute(this.blurProgram);
      gl.bindTexture(gl.TEXTURE_2D, currentTex);

      this.setUniform(this.blurProgram, 'u_direction', [0.0, 1.0]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.deleteTexture(currentTex);
      currentTex = nextFb.texture;
      nextFb = this.createFramebuffer(source.width, source.height);
    }

    // FINAL PASS: Draw to the Canvas Screen Buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.adjustProgram); // reuse simple pass-through
    this.setupAttribute(this.adjustProgram);
    gl.bindTexture(gl.TEXTURE_2D, currentTex);

    // Clear uniforms to baseline
    this.setUniform(this.adjustProgram, 'u_image', 0);
    this.setUniform(this.adjustProgram, 'u_brightness', 0.0);
    this.setUniform(this.adjustProgram, 'u_contrast', 0.0);
    this.setUniform(this.adjustProgram, 'u_exposure', 0.0);
    this.setUniform(this.adjustProgram, 'u_saturation', 0.0);
    this.setUniform(this.adjustProgram, 'u_vibrance', 0.0);
    this.setUniform(this.adjustProgram, 'u_temperature', 0.0);
    this.setUniform(this.adjustProgram, 'u_tint', 0.0);
    this.setUniform(this.adjustProgram, 'u_highlights', 0.0);
    this.setUniform(this.adjustProgram, 'u_shadows', 0.0);
    this.setUniform(this.adjustProgram, 'u_vignette', 0.0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Cleanup resources
    gl.deleteTexture(currentTex);
    gl.deleteFramebuffer(nextFb.framebuffer);
    gl.deleteTexture(nextFb.texture);

    // Export current Canvas pixels as a return
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = source.width;
    exportCanvas.height = source.height;
    exportCanvas.getContext('2d')!.drawImage(this.canvas as HTMLCanvasElement, 0, 0);

    return exportCanvas;
  }

  /**
   * Direct garbage collection helper to prevent GPU context resource leaking
   */
  public destroy() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.deleteBuffer(this.positionBuffer);

    gl.deleteProgram(this.adjustProgram);
    gl.deleteProgram(this.convProgram);
    gl.deleteProgram(this.blurProgram);
  }

  // --- WebGL Compilation Helpers ---

  private createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failure: ${gl.getProgramInfoLog(program)}`);
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return program;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compilation error (${type}): ${info}`);
    }
    return shader;
  }

  private createTexture(source: any): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return texture;
  }

  private createFramebuffer(width: number, height: number): {
    framebuffer: WebGLFramebuffer;
    texture: WebGLTexture;
  } {
    const gl = this.gl;
    const framebuffer = gl.createFramebuffer()!;
    const texture = gl.createTexture()!;

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    return { framebuffer, texture };
  }

  private setupAttribute(program: WebGLProgram) {
    const gl = this.gl;
    const loc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  private setUniform(program: WebGLProgram, name: string, value: any) {
    const gl = this.gl;
    const loc = gl.getUniformLocation(program, name);
    if (loc === null) return;

    if (typeof value === 'number') {
      gl.uniform1f(loc, value);
    } else if (Array.isArray(value)) {
      if (value.length === 2) {
        gl.uniform2f(loc, value[0], value[1]);
      } else if (value.length === 3) {
        gl.uniform3f(loc, value[0], value[1], value[2]);
      }
    }
  }
}
