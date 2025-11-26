import React, { useEffect, useRef, useState } from "react";
import { compileShader, createProgram, createQuadBuffer, loadTexture } from "./webgl.js";

export default function RippleGrid() {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const programRef = useRef(null);
  const uniformsRef = useRef({});
  const startTimeRef = useRef(Date.now());

  const MAX_RIPPLE_DURATION = 1000; // in milliseconds
  const MAX_RIPPLES = 64;
  const GRID_DENSITY = 10;
  const RIPPLE_DELAY = 50; // milliseconds between each grid cell ripple

  const width = 960;
  const height = 640;

  const [params, setParams] = useState({
    amt: 2.0,
    amplitude: 0.03,
    radius: 0.3,
    width: 0.02,
    fadeStrength: 3.0,
    rectMode: 0, // 0: circle, 1: square, 2: diamond
    maxRippleDuration: 10000,
    maxRipples: 64,
    gridDensity: 10,
    rippleDelay: 50,
    showGrid: true,
  });

  const [debug, setDebug] = useState({
    activeRipples: 0,
    currentCell: -1,
  });

  const [gridBrightness, setGridBrightness] = useState([]);

  const restartAnimationRef = useRef(null);

  const getFragmentShader = () => `#version 300 es
precision mediump float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_texture;
uniform int u_rippleCount;
uniform vec2 u_ripplePos[${MAX_RIPPLES}];
uniform float u_rippleStart[${MAX_RIPPLES}];
uniform float u_maxRippleTime;
uniform float u_amt;
uniform float u_amplitude;
uniform float u_radius;
uniform float u_width;
uniform float u_fadeStrength;
uniform int u_rectMode;

void main() {
  vec2 uv = vUV;

  float totalRipple = 0.0;
  vec2 totalOffset = vec2(0.0);
  
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    if (i >= u_rippleCount) break;
    vec2 rPos = u_ripplePos[i];
    float rStart = u_rippleStart[i];
    vec2 v = uv - rPos;
    
    float dist;
    if (u_rectMode == 1) {
      // Square
      dist = max(abs(v.x), abs(v.y)) * u_amt + 0.0001;
    } else if (u_rectMode == 2) {
      // Diamond
      dist = (abs(v.x) + abs(v.y)) * u_amt + 0.0001;
    } else {
      // Circle (default)
      dist = length(v) * u_amt + 0.0001;
    }
    
    float t = u_time - rStart;
    if (t > 0.0 && t < u_maxRippleTime) {
      float radius = u_radius * t;
      float band = smoothstep(radius - u_width, radius, dist) - smoothstep(radius, radius + u_width, dist);
      float fade = exp(-u_fadeStrength * t / u_maxRippleTime);
      float val = band * fade;
      totalRipple += val;
      vec2 dir = normalize(v);
      totalOffset += dir * val;
    }
  }

  totalRipple *= u_amplitude;
  vec2 offset = totalRipple * normalize(totalOffset + vec2(0.001));
  vec3 color = texture(u_texture, clamp(uv - offset, 0.0, 1.0)).rgb;

  fragColor = vec4(color, 1.0);
}
  `;

  const vertexShader = `#version 300 es
    in vec2 aPos;
    out vec2 vUV;

    void main() {
      vUV = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext("webgl2");
    glRef.current = gl;

    if (!gl) {
      console.error("WebGL not supported");
      return;
    }

    const vert = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, getFragmentShader());
    const program = createProgram(gl, vert, frag);
    programRef.current = program;
    gl.useProgram(program);

    const uniforms = {
      resolution: gl.getUniformLocation(program, "u_resolution"),
      time: gl.getUniformLocation(program, "u_time"),
      texture: gl.getUniformLocation(program, "u_texture"),
      rippleCount: gl.getUniformLocation(program, "u_rippleCount"),
      ripplePos: gl.getUniformLocation(program, "u_ripplePos"),
      rippleStart: gl.getUniformLocation(program, "u_rippleStart"),
      maxRippleTime: gl.getUniformLocation(program, "u_maxRippleTime"),
      amt: gl.getUniformLocation(program, "u_amt"),
      amplitude: gl.getUniformLocation(program, "u_amplitude"),
      radius: gl.getUniformLocation(program, "u_radius"),
      width: gl.getUniformLocation(program, "u_width"),
      fadeStrength: gl.getUniformLocation(program, "u_fadeStrength"),
      rectMode: gl.getUniformLocation(program, "u_rectMode"),
    };
    uniformsRef.current = uniforms;

    gl.uniform1i(uniforms.texture, 0);
    gl.uniform1f(uniforms.maxRippleTime, MAX_RIPPLE_DURATION / 1000.0);

    createQuadBuffer(gl, program);
    gl.uniform2f(uniforms.resolution, width, height);
    gl.uniform1i(uniforms.rippleCount, 0);

    loadTexture(gl, "/img.jpg");

    // Also create an offscreen image+canvas to sample pixel brightness per grid cell
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = '/img.jpg';
    img.onload = () => {
      try {
        const off = document.createElement('canvas');
        off.width = width;
        off.height = height;
        const ctx = off.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const gd = params.gridDensity || GRID_DENSITY;
        const cellW = Math.floor(width / gd);
        const cellH = Math.floor(height / gd);
        const brightnessArr = new Array(gd * gd).fill(0);

        for (let row = 0; row < gd; row++) {
          for (let col = 0; col < gd; col++) {
            const cellIndex = row * gd + col;
            // sample a small area (3x3) around the center of the cell for averaged brightness
            const cx = Math.floor((col + 0.5) * cellW);
            const cy = Math.floor((row + 0.5) * cellH);
            const sampleSize = 3;
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            for (let sy = -1; sy <= 1; sy++) {
              for (let sx = -1; sx <= 1; sx++) {
                const sxPos = Math.min(width - 1, Math.max(0, cx + sx));
                const syPos = Math.min(height - 1, Math.max(0, cy + sy));
                const px = ctx.getImageData(sxPos, syPos, 1, 1).data;
                rSum += px[0]; gSum += px[1]; bSum += px[2];
                count++;
              }
            }
            const rAvg = rSum / count;
            const gAvg = gSum / count;
            const bAvg = bSum / count;
            const brightness = ((rAvg + gAvg + bAvg) / 3) / 255.0;
            brightnessArr[cellIndex] = brightness;
          }
        }

        setGridBrightness(brightnessArr);
      } catch (e) {
        console.warn('brightness sampling failed', e);
      }
    };

    const ripples = [];
gl._activeRipples = ripples;
let currentCellIndex = -1;
let timeoutIds = [];

const generateGridRipples = () => {
  // Clear any previous timeouts
  timeoutIds.forEach(id => clearTimeout(id));
  timeoutIds = [];
  
  const cellWidth = 1.0 / GRID_DENSITY;
  const cellHeight = 1.0 / GRID_DENSITY;

  const scheduleRipple = (index) => {
    if (index >= GRID_DENSITY * GRID_DENSITY) return;

    const row = Math.floor(index / GRID_DENSITY);
    const col = index % GRID_DENSITY;

    const x = (col + 0.5) * cellWidth;
    const y = (row + 0.5) * cellHeight;

    const timeoutId = setTimeout(() => {
      currentCellIndex = index;
      gl._activeRipples.push({
        x,
        y,
        start: (Date.now() - startTimeRef.current) / 1000.0,
        duration: MAX_RIPPLE_DURATION / 1000.0,
      });
      setDebug((prev) => ({
        ...prev,
        currentCell: index,
      }));
      scheduleRipple(index + 1);
    }, RIPPLE_DELAY);
    
    timeoutIds.push(timeoutId);
  };

  scheduleRipple(0);
};

restartAnimationRef.current = generateGridRipples;
const initialTimeoutId = setTimeout(generateGridRipples, 500);
timeoutIds.push(initialTimeoutId);

    function render() {
      if (!glRef.current || !programRef.current) return;
      const time = (Date.now() - startTimeRef.current) / 1000;

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const done = (typeof r.isDone === 'function') ? r.isDone(time) : ((time - r.start) > r.duration);
        if (done) ripples.splice(i, 1);
      }

      const count = Math.min(ripples.length, MAX_RIPPLES);
      const posArr = new Float32Array(count * 2);
      const startArr = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        posArr[i * 2] = ripples[i].x;
        posArr[i * 2 + 1] = ripples[i].y;
        startArr[i] = ripples[i].start;
      }

      gl.uniform1i(uniformsRef.current.rippleCount, count);
      if (count > 0) {
        gl.uniform2fv(uniformsRef.current.ripplePos, posArr);
        gl.uniform1fv(uniformsRef.current.rippleStart, startArr);
      }

      // Update shader parameters
      gl.uniform1f(uniformsRef.current.amt, params.amt);
      gl.uniform1f(uniformsRef.current.amplitude, params.amplitude);
      gl.uniform1f(uniformsRef.current.radius, params.radius);
      gl.uniform1f(uniformsRef.current.width, params.width);
      gl.uniform1f(uniformsRef.current.fadeStrength, params.fadeStrength);
      gl.uniform1i(uniformsRef.current.rectMode, params.rectMode);

      gl.uniform1f(uniformsRef.current.time, time);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      setDebug((prev) => ({
        ...prev,
        activeRipples: ripples.length,
      }));

      requestAnimationFrame(render);
    }

    render();
    return () => gl.deleteProgram(program);
  }, [params]);

  const handleParamChange = (key, value) => {
    setParams((prev) => ({
      ...prev,
      [key]: parseFloat(value),
    }));
  };

  return (
    <div style = { { display : "flex", flexDirection : "row", gap : "24px" } }>
      <div style = { { position : "relative" } }>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
        />

        <svg
          width = {width}
          height = {height}
          style = { { position : "absolute", left : 0, top : 0, display: params.showGrid ? "block" : "none" } }
        >
          { Array.from({ length: params.gridDensity }).map((_, row) =>
            Array.from({ length: params.gridDensity }).map((_, col) => {
              const cellIndex = row * params.gridDensity + col;
              const cellWidth = width / params.gridDensity;
              const cellHeight = height / params.gridDensity;
              const x = col * cellWidth;
              const y = row * cellHeight;
              const isActive = cellIndex === debug.currentCell;

              return (
                <rect
                  key={`${row}-${col}`}
                  x={x}
                  y={y}
                  width={cellWidth}
                  height={cellHeight}
                  stroke = "rgba(255, 255, 255, 0.24)"
                  fill = { isActive ? `rgba(255, 255, 255, 0.24)` : "none" }
                  opacity={isActive ? 0.8 : 0.3}
                />
              );
            })
          )}
        </svg>

        {/* brightness labels */}
        {params.showGrid && (
          <svg
            width={width}
            height={height}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            {Array.from({ length: params.gridDensity }).map((_, row) =>
              Array.from({ length: params.gridDensity }).map((_, col) => {
                const cellIndex = row * params.gridDensity + col;
                const cellWidth = width / params.gridDensity;
                const cellHeight = height / params.gridDensity;
                const cx = col * cellWidth + cellWidth / 2;
                const cy = row * cellHeight + cellHeight / 2;
                const b = gridBrightness && gridBrightness[cellIndex];
                const text = (typeof b === 'number') ? b.toFixed(2) : '';
                const fontSize = Math.max(10, Math.min(14, Math.floor(cellWidth / 5)));
                return (
                  <text
                    key={`label-${row}-${col}`}
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fill: 'rgba(255,255,255,0.9)', fontSize: fontSize, fontFamily: 'monospace', pointerEvents: 'none' }}
                  >
                    {text}
                  </text>
                );
              })
            )}
          </svg>
        )}
        </div>


      <div style = { { background : "rgba(255, 255, 255, 0.5)" } }>
        <div>
          <div><b>Debug Info</b></div>
          <div>gridDensity: {GRID_DENSITY}</div>
          <div>total cells: {GRID_DENSITY * GRID_DENSITY}</div>
          <div>activeRipples: { debug.activeRipples }
            <button
              disabled={debug.activeRipples !== 0}
              onClick={() => {
                if (glRef.current) {
                  glRef.current._activeRipples = [];
                  setDebug((prev) => ({ ...prev, currentCell: -1, activeRipples: 0 }));
                }
                if (restartAnimationRef.current) {
                  restartAnimationRef.current();
                }
              }}
              style={{
                opacity: debug.activeRipples !== 0 ? 0.5 : 1,
                cursor: debug.activeRipples !== 0 ? 'not-allowed' : 'pointer'
              }}
            >
              Restart
            </button>
          </div>
          <div>currentCell: {debug.currentCell}</div>
        </div>

        <div>
          <div><b>Ripple Parameters</b></div>

          <div>

<div style={{ marginBottom: '0.75rem' }}>
  <label style={{ display: 'block', marginBottom: '0.25rem' }}>Max Ripple Duration (ms): {params.maxRippleDuration}</label>
  <input
    type="range"
    min="500"
    max="30000"
    step="100"
    value={params.maxRippleDuration}
    onChange={(e) => handleParamChange('maxRippleDuration', e.target.value)}
    style={{ width: '100%' }}
  />
</div>

<div style={{ marginBottom: '0.75rem' }}>
  <label style={{ display: 'block', marginBottom: '0.25rem' }}>Max Ripples: {params.maxRipples}</label>
  <input
    type="range"
    min="8"
    max="128"
    step="8"
    value={params.maxRipples}
    onChange={(e) => handleParamChange('maxRipples', e.target.value)}
    style={{ width: '100%' }}
  />
</div>

<div style={{ marginBottom: '0.75rem' }}>
  <label style={{ display: 'block', marginBottom: '0.25rem' }}>Grid Density: {params.gridDensity}</label>
  <input
    type="range"
    min="5"
    max="50"
    step="1"
    value={params.gridDensity}
    onChange={(e) => handleParamChange('gridDensity', e.target.value)}
    style={{ width: '100%' }}
  />
</div>

<div style={{ marginBottom: '0.75rem' }}>
  <label style={{ display: 'block', marginBottom: '0.25rem' }}>Ripple Delay (ms): {params.rippleDelay}</label>
  <input
    type="range"
    min="0"
    max="1000"
    step="10"
    value={params.rippleDelay}
    onChange={(e) => handleParamChange('rippleDelay', e.target.value)}
    style={{ width: '100%' }}
  />
</div>

<div style={{ marginBottom: '0.75rem' }}>
  <label style={{ display: 'flex', alignItems: 'center' }}>
    <input
      type="checkbox"
      checked={params.showGrid}
      onChange={(e) => handleParamChange('showGrid', e.target.checked ? 1 : 0)}
      style={{ marginRight: '0.5rem' }}
    />
    Show Grid
  </label>
</div>


            <label className="block mb-1">Distance Scale (amt): {params.amt.toFixed(2)}</label>
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              value={params.amt}
              onChange={(e) => handleParamChange('amt', e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Amplitude: {params.amplitude.toFixed(3)}</label>
            <input
              type="range"
              min="0"
              max="0.2"
              step="0.005"
              value={params.amplitude}
              onChange={(e) => handleParamChange('amplitude', e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Radius Speed: {params.radius.toFixed(2)}</label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={params.radius}
              onChange={(e) => handleParamChange('radius', e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Wave Width: {params.width.toFixed(3)}</label>
            <input
              type="range"
              min="0.005"
              max="0.1"
              step="0.005"
              value={params.width}
              onChange={(e) => handleParamChange('width', e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Fade Strength: {params.fadeStrength.toFixed(1)}</label>
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={params.fadeStrength}
              onChange={(e) => handleParamChange('fadeStrength', e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Shape Mode</label>
            <select
              value={params.rectMode}
              onChange={(e) => handleParamChange('rectMode', e.target.value)}
            >
              <option value="0">Circle</option>
              <option value="1">Square</option>
              <option value="2">Diamond</option>
            </select>
          </div>
        </div>


      </div>
    </div>
  );
}