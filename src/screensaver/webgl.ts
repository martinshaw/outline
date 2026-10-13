import type { ScreensaverEffectId } from './types';
import { FRAG_BY_MODE, FRAG_SEED, VERT_SRC } from './shaders';

export type ThemeRgb = {
  paper: [number, number, number];
  ink: [number, number, number];
};

type ProgramBundle = {
  program: WebGLProgram;
  uniforms: {
    uSource: WebGLUniformLocation | null;
    uPrev: WebGLUniformLocation | null;
    uTime: WebGLUniformLocation | null;
    uDt: WebGLUniformLocation | null;
    uResolution: WebGLUniformLocation | null;
    uPaper: WebGLUniformLocation | null;
    uInk: WebGLUniformLocation | null;
  };
};

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'compile error';
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function link(
  gl: WebGL2RenderingContext,
  vert: WebGLShader,
  fragSrc: string,
): ProgramBundle {
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.bindAttribLocation(program, 0, 'aPos');
  gl.linkProgram(program);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? 'link error';
    gl.deleteProgram(program);
    throw new Error(info);
  }
  return {
    program,
    uniforms: {
      uSource: gl.getUniformLocation(program, 'uSource'),
      uPrev: gl.getUniformLocation(program, 'uPrev'),
      uTime: gl.getUniformLocation(program, 'uTime'),
      uDt: gl.getUniformLocation(program, 'uDt'),
      uResolution: gl.getUniformLocation(program, 'uResolution'),
      uPaper: gl.getUniformLocation(program, 'uPaper'),
      uInk: gl.getUniformLocation(program, 'uInk'),
    },
  };
}

function createTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('Failed to create texture');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  return tex;
}

function createFbo(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  width: number,
  height: number,
): WebGLFramebuffer {
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error('Failed to create framebuffer');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );
  gl.viewport(0, 0, width, height);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Framebuffer incomplete: ${status}`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

export class ScreensaverGL {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private vert: WebGLShader;
  private vao: WebGLVertexArrayObject;
  private sourceTex!: WebGLTexture;
  private pingTex!: WebGLTexture;
  private pongTex!: WebGLTexture;
  private pingFbo!: WebGLFramebuffer;
  private pongFbo!: WebGLFramebuffer;
  private seed: ProgramBundle;
  private programs = new Map<ScreensaverEffectId, ProgramBundle>();
  private mode: ScreensaverEffectId;
  private theme: ThemeRgb;
  /** Simulation / capture texture size. */
  private simWidth = 1;
  private simHeight = 1;
  private startMs = 0;
  private lastMs = 0;
  private pingIsPrev = true;
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    mode: ScreensaverEffectId,
    theme: ThemeRgb,
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'low-power',
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.canvas = canvas;
    this.mode = mode;
    this.theme = theme;
    gl.clearColor(...theme.paper, 1);
    this.vert = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    this.seed = link(gl, this.vert, FRAG_SEED);
    for (const id of Object.keys(FRAG_BY_MODE) as ScreensaverEffectId[]) {
      this.programs.set(id, link(gl, this.vert, FRAG_BY_MODE[id]));
    }

    const buf = gl.createBuffer();
    if (!buf) throw new Error('Failed to create buffer');
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    this.vao = vao;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.syncDisplaySize();
    this.resizeSim(1, 1);
  }

  uploadSource(image: ImageBitmap | HTMLCanvasElement): void {
    const gl = this.gl;
    const w = 'width' in image ? image.width : 1;
    const h = 'height' in image ? image.height : 1;
    this.resizeSim(w, h);
    this.syncDisplaySize();
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image,
    );
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    this.seedFeedback();
    this.startMs = performance.now();
    this.lastMs = this.startMs;
    this.frame(this.startMs);
  }

  private syncDisplaySize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(
      1,
      Math.floor(this.canvas.clientWidth * dpr) || this.simWidth,
    );
    const h = Math.max(
      1,
      Math.floor(this.canvas.clientHeight * dpr) || this.simHeight,
    );
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private resizeSim(width: number, height: number): void {
    const gl = this.gl;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (w === this.simWidth && h === this.simHeight) return;

    this.simWidth = w;
    this.simHeight = h;

    gl.deleteTexture(this.sourceTex);
    gl.deleteTexture(this.pingTex);
    gl.deleteTexture(this.pongTex);
    gl.deleteFramebuffer(this.pingFbo);
    gl.deleteFramebuffer(this.pongFbo);

    this.sourceTex = createTexture(gl, w, h);
    this.pingTex = createTexture(gl, w, h);
    this.pongTex = createTexture(gl, w, h);
    this.pingFbo = createFbo(gl, this.pingTex, w, h);
    this.pongFbo = createFbo(gl, this.pongTex, w, h);
  }

  private seedFeedback(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pingFbo);
    gl.viewport(0, 0, this.simWidth, this.simHeight);
    gl.useProgram(this.seed.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    if (this.seed.uniforms.uSource) {
      gl.uniform1i(this.seed.uniforms.uSource, 0);
    }
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.pingIsPrev = true;
  }

  frame(nowMs: number): void {
    if (this.disposed) return;
    const gl = this.gl;
    this.syncDisplaySize();
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastMs) / 1000));
    this.lastMs = nowMs;
    const time = (nowMs - this.startMs) / 1000;
    const bundle = this.programs.get(this.mode) ?? this.programs.get('diffuse');
    if (!bundle) return;

    const prevTex = this.pingIsPrev ? this.pingTex : this.pongTex;
    const outFbo = this.pingIsPrev ? this.pongFbo : this.pingFbo;
    const outTex = this.pingIsPrev ? this.pongTex : this.pingTex;

    gl.bindFramebuffer(gl.FRAMEBUFFER, outFbo);
    gl.viewport(0, 0, this.simWidth, this.simHeight);
    gl.useProgram(bundle.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, prevTex);
    const u = bundle.uniforms;
    if (u.uSource) gl.uniform1i(u.uSource, 0);
    if (u.uPrev) gl.uniform1i(u.uPrev, 1);
    if (u.uTime) gl.uniform1f(u.uTime, time);
    if (u.uDt) gl.uniform1f(u.uDt, dt);
    if (u.uResolution) {
      gl.uniform2f(u.uResolution, this.simWidth, this.simHeight);
    }
    if (u.uPaper) gl.uniform3f(u.uPaper, ...this.theme.paper);
    if (u.uInk) gl.uniform3f(u.uInk, ...this.theme.ink);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(...this.theme.paper, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.seed.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, outTex);
    if (this.seed.uniforms.uSource) {
      gl.uniform1i(this.seed.uniforms.uSource, 0);
    }
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    this.pingIsPrev = !this.pingIsPrev;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteTexture(this.sourceTex);
    gl.deleteTexture(this.pingTex);
    gl.deleteTexture(this.pongTex);
    gl.deleteFramebuffer(this.pingFbo);
    gl.deleteFramebuffer(this.pongFbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.seed.program);
    for (const bundle of this.programs.values()) {
      gl.deleteProgram(bundle.program);
    }
    gl.deleteShader(this.vert);
  }
}
