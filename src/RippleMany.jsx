import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { compileShader, createProgram, createQuadBuffer, loadTexture } from "./webgl.js";

function RippleOne(props, ref, ambientTriggered, startCounter) {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const programRef = useRef(null);
  const uniformsRef = useRef({});
  const startTimeRef = useRef(Date.now());

  const MAX_RIPPLE_DURATION = 1000; // in milliseconds
  const MAX_RIPPLES = 64;

  const [debug, setDebug] = useState({
    ripplePos: [0.0, 0.0],
    rippleStart: -10,
    time: 0,
    radius: 0,
    active: false,
    distSample: 0,
  });

  const width = 960;
  const height = 640;

  const vertexShader = `#version 300 es
    in vec2 aPos;
    out vec2 vUV;

    void main() {

    vUV = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const fragmentShader = `#version 300 es
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

 uniform bool u_ambientTriggered;
 uniform int u_startCounter;

void main() {
  vec2 uv = vUV;

  // Sum contributions from multiple ripples
  float totalRipple = 0.0;
  vec2 totalOffset = vec2(0.0);
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    if (i >= u_rippleCount) break;
    vec2 rPos = u_ripplePos[i];
    float rStart = u_rippleStart[i];
    vec2 v = uv - rPos;
    float amt = 2.0;
    float dist = length(v) * amt + 0.0001;
    float t = u_time - rStart;

    if (t > 0.0 && t < u_maxRippleTime) {
      float radius = 0.3 * t;
      float width = 0.02;

      float fade = exp(-3.0 * t / u_maxRippleTime);

      float band = smoothstep(radius - width, radius, dist) - smoothstep(radius, radius + width, dist);
      float val = band * fade;
      totalRipple += val;
      vec2 dir = normalize(v);
      totalOffset += dir * val;
    }
  }

  // Show image when startCounter is at least 4; otherwise draw black (or ripple debug)
  if (u_startCounter < 4) {
    // DRAW BLACK CANVAS (use ripple value as visualization)
    fragColor = vec4(vec3(totalRipple), 1.0);
  } else {
    // DRAW IMAGE with ripple displacement
    float amplitude = 0.03;
    float tr = totalRipple * amplitude;
    vec2 offset = tr * normalize(totalOffset + vec2(0.001));
    vec3 color = texture(u_texture, clamp(uv - offset, 0.0, 1.0)).rgb;
    fragColor = vec4(color, 1.0);
  }

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

    // compile shaders and create program
    const vert = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
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
      
      ambientTriggered: gl.getUniformLocation(program, "u_ambientTriggered"),
      startCounter: gl.getUniformLocation(program, "u_startCounter"),
    };
    uniformsRef.current = uniforms;

    // bind texture unit 0 to sampler
    gl.uniform1i(uniforms.texture, 0);

    gl.uniform1f(uniforms.maxRippleTime, MAX_RIPPLE_DURATION / 1000.0);

    // initialize ambientTriggered uniform
    gl.uniform1i(uniforms.ambientTriggered, props.ambientTriggered ? 1 : 0);
    // initialize startCounter uniform (default 0)
    gl.uniform1i(uniforms.startCounter, typeof props.startCounter === 'number' ? props.startCounter : 0);

    createQuadBuffer(gl, program);
    gl.uniform2f(uniforms.resolution, width, height);
    // initialize empty ripple arrays
    gl.uniform1i(uniforms.rippleCount, 0);

    loadTexture(gl, props.img || "/img.jpg");

    // Manage active ripples in a JS array (store on gl so outside handlers can push)
    const ripples = [];
    gl._activeRipples = ripples;

    function render() {
      if (!glRef.current || !programRef.current) return;
      const time = (Date.now() - startTimeRef.current) / 1000;

      // prune finished ripples (support both objects and class instances)
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const done = (typeof r.isDone === 'function') ? r.isDone(time) : ((time - r.start) > r.duration);
        if (done) ripples.splice(i, 1);
      }

      // upload ripple arrays to shader
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

      gl.uniform1f(uniformsRef.current.time, time);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      setDebug((prev) => ({
        ...prev,
        time: time.toFixed(1),
        radius: (ripples.length > 0 ? (time - ripples[ripples.length - 1].start).toFixed(1) : '0'),
        active: ripples.length > 0,
      }));

      requestAnimationFrame(render);
    }

    render();
    return () => gl.deleteProgram(program);
  }, []);

  // Update ambientTriggered uniform when prop changes
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !uniformsRef.current || typeof uniformsRef.current.ambientTriggered === 'undefined') return;
    gl.useProgram(programRef.current);
    gl.uniform1i(uniformsRef.current.ambientTriggered, props.ambientTriggered ? 1 : 0);
  }, [props.ambientTriggered]);

  // Update startCounter uniform when prop changes
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !uniformsRef.current || typeof uniformsRef.current.startCounter === 'undefined') return;
    gl.useProgram(programRef.current);
    const v = (typeof props.startCounter === 'number') ? props.startCounter : 0;
    gl.uniform1i(uniformsRef.current.startCounter, v);
  }, [props.startCounter]);

  // If parent passes a different image, update the texture
  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    // load provided image or fallback to default
    loadTexture(gl, props.img || "/img.jpg");
  }, [props.img]);

  // expose addRipple(clientX, clientY) to parent via ref
  useImperativeHandle(ref, () => ({
    addRipple(clientX, clientY) {
      const gl = glRef.current;
      const canvas = canvasRef.current;
      if (!gl || !canvas || !uniformsRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      const rippleStart = (Date.now() - startTimeRef.current) / 1000;
      gl._activeRipples.push({ x, y, start: rippleStart, duration: MAX_RIPPLE_DURATION / 1000.0 });
      setDebug((prev) => ({
        ...prev,
        ripplePos: [x.toFixed(2), y.toFixed(2)],
        rippleStart: rippleStart.toFixed(2),
      }));
    }
  }));
  const pressingRef = useRef(false);

  const addRippleAtEvent = (e) => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    if (!gl || !canvas || !uniformsRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rippleStart = (Date.now() - startTimeRef.current) / 1000;
    // push plain object; renderer prunes based on start/duration
    gl._activeRipples.push({ x, y, start: rippleStart, duration: MAX_RIPPLE_DURATION / 1000.0 });
    setDebug((prev) => ({
      ...prev,
      ripplePos: [x.toFixed(2), y.toFixed(2)],
      rippleStart: rippleStart.toFixed(2),
    }));
  };

  const handlePointerDown = (e) => {
    pressingRef.current = true;
    e.target.setPointerCapture?.(e.pointerId);
    addRippleAtEvent(e);
  };

  const handlePointerMove = (e) => {
    if (!pressingRef.current) return;
    addRippleAtEvent(e);
  };

  const handlePointerUp = (e) => {
    pressingRef.current = false;
    e.target.releasePointerCapture?.(e.pointerId);
  };


  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: `${width}px`, height: `${height}px`, pointerEvents: props.pointerEvents || 'none', zIndex: props.zIndex || 1 }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style = {{
          display: 'block', width: '100%', height: '100%',
          // filter : 'blur(40px)',
        }}
      />
    </div>
  );
}

export default forwardRef(RippleOne);