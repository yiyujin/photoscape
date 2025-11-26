import React, { useEffect, useRef, useState } from "react";
import { compileShader, createProgram, createQuadBuffer, loadTexture } from "./webgl.js";

export default function RippleOne() {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const programRef = useRef(null);
  const uniformsRef = useRef({});
  const startTimeRef = useRef(Date.now());

  const MAX_RIPPLE_DURATION = 1000; // in milliseconds

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
uniform vec2 u_ripplePos;
uniform float u_rippleStart;
uniform float u_maxRippleTime; // new uniform

void main() {
  vec2 uv = vUV;
  vec2 v = uv - u_ripplePos;

  float amt = 2.0;
  float dist = length(v) * amt; // ultimatley makes ripple bigger/smaller;

  float ripple = 0.0;
  float t = u_time - u_rippleStart;

  if (t > 0.0 && t < u_maxRippleTime) {
    float radius = 0.3 * t;
    float width = 0.02; // 0.02 // initial ring length
    // float fade = 1.0 - ( t / u_maxRippleTime );  // fade over time
    float fade = exp(-3.0 * t / u_maxRippleTime);


    // JUST SHOW HARD RING
    // float band = 0.0;
    // if(dist > radius - width && dist < radius + width){
    //     band = 1.0;
    // }
    // ripple = band;

    // SOFTER RING
    float band = smoothstep(radius - width, radius, dist)
               - smoothstep(radius, radius + width, dist);
    ripple = band;

    ripple *= fade;
  }

  // BLACK CANVAS
  // fragColor = vec4(vec3(ripple), 1.0);

  // IMAGE
  float amplitude = 0.03; // scale down amplitude // make ripple more subtle
  ripple *= amplitude;

  vec2 offset = ripple * normalize(v + 0.001);
  vec3 color = texture(u_texture, clamp(uv - offset, 0.0, 1.0)).rgb;
  // vec3 color = texture(u_texture, uv + offset).rgb;

  fragColor = vec4(color, 1.0);

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

    const vs = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    const program = createProgram(gl, vs, fs);
    gl.useProgram(program);
    programRef.current = program;

  uniformsRef.current = {
  resolution: gl.getUniformLocation(program, "u_resolution"),
  time: gl.getUniformLocation(program, "u_time"),
  texture: gl.getUniformLocation(program, "u_texture"),
  ripplePos: gl.getUniformLocation(program, "u_ripplePos"),
  rippleStart: gl.getUniformLocation(program, "u_rippleStart"),
  maxRippleTime: gl.getUniformLocation(program, "u_maxRippleTime"),
};

gl.uniform1f(uniformsRef.current.maxRippleTime, MAX_RIPPLE_DURATION / 1000.0);


    createQuadBuffer(gl, program);
    gl.uniform2f(uniformsRef.current.resolution, width, height);
    gl.uniform2f(uniformsRef.current.ripplePos, 0.5, 0.5);
    gl.uniform1f(uniformsRef.current.rippleStart, -10.0);

    loadTexture(gl, "/img.jpg");

    function render() {
      if (!glRef.current || !programRef.current) return;
      const time = (Date.now() - startTimeRef.current) / 1000;

      gl.uniform1f(uniformsRef.current.time, time);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      
      const t = time - rippleStartRef.current;
      const active = t >= 0 && t < MAX_RIPPLE_DURATION / 1000;
      const radius = active ? 0.3 * t : 0;

      setDebug((prev) => ({
        ...prev,
        time: time.toFixed(1),
        radius: radius.toFixed(1),
        active,
      }));


      requestAnimationFrame(render);
    }

    render();
    return () => gl.deleteProgram(program);
  }, []);

  const rippleStartRef = useRef(-10);

const handleClick = (e) => {
  const gl = glRef.current;
  if (!gl) return;

  const rect = canvasRef.current.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  const rippleStart = (Date.now() - startTimeRef.current) / 1000;
  rippleStartRef.current = rippleStart; // store in ref

  gl.uniform2f(uniformsRef.current.ripplePos, x, y);
  gl.uniform1f(uniformsRef.current.rippleStart, rippleStart);

  setDebug((prev) => ({
    ...prev,
    ripplePos: [x.toFixed(1), y.toFixed(1)],
    rippleStart: rippleStart.toFixed(1),
  }));
};


  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-green-400 font-mono">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleClick}
        className="border border-gray-700"
      />

      <div className="mt-4 text-sm bg-gray-900 p-3 rounded-xl w-[320px]">
        <div><b>Debug Info</b></div>
        <div>ripplePos: {debug.ripplePos.join(", ")}</div>
        <div>rippleStart: {debug.rippleStart}</div>
        <div>time: {debug.time}</div>
        <div>radius: {debug.radius}</div>
        <div>active: {String(debug.active)}</div>
      </div>
    </div>
  );
}