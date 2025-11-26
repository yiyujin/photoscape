import React, { useEffect, useRef } from "react";

export default function ClickRipples() {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const programRef = useRef(null);
  const textureRef = useRef(null);
  const uniformsRef = useRef({});
  const startTimeRef = useRef(Date.now());

  const width = 960;
  const height = 640;

  const vertexShader = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentShader = `
    precision mediump float;
    
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform sampler2D u_texture;
    uniform vec2 u_ripplePos;
    uniform float u_rippleStart;

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      uv.y = 1.0 - uv.y;
      
      // Debug: show ripple position as a red dot
      // if(length(uv - u_ripplePos) < 0.05) {
      //   gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
      //   return;
      // }
      
      vec2 v = uv - u_ripplePos;
      float dist = length(v) * 2.0;

      float ripple = 0.0;
      float t = u_time - u_rippleStart;

      if(t >= 0.0) {
        float radius = 0.3 * t;
        float width = 0.02;
        ripple = smoothstep(radius - width, radius, dist) -
                 smoothstep(radius, radius + width, dist);
      }

      vec2 offset = 0.02 * ripple * normalize(v + 0.001);
      vec3 color = texture2D(u_texture, clamp(uv - offset, 0.0, 1.0)).rgb;

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext("webgl");
    glRef.current = gl;

    if (!gl) {
      console.error("WebGL not supported");
      return;
    }

    // Compile shaders
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vertexShader);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fragmentShader);
    gl.compileShader(fs);

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error("Fragment shader error:", gl.getShaderInfoLog(fs));
    }

    // Create program
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);
    programRef.current = program;

    // Get uniform locations
    uniformsRef.current = {
      resolution: gl.getUniformLocation(program, "u_resolution"),
      time: gl.getUniformLocation(program, "u_time"),
      texture: gl.getUniformLocation(program, "u_texture"),
      ripplePos: gl.getUniformLocation(program, "u_ripplePos"),
      rippleStart: gl.getUniformLocation(program, "u_rippleStart"),
    };

    // Create full-screen quad
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Set resolution
    gl.uniform2f(uniformsRef.current.resolution, width, height);

    // Initialize ripple (off-screen)
    gl.uniform2f(uniformsRef.current.ripplePos, 0.5, 0.5);
    gl.uniform1f(uniformsRef.current.rippleStart, -10.0);

    // Load texture
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      textureRef.current = texture;
    };
    img.src = "/img.jpg";

    // Animation loop
    function render() {
      if (!glRef.current || !programRef.current) return;

      const time = (Date.now() - startTimeRef.current) / 1000;
      gl.uniform1f(uniformsRef.current.time, time);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(render);
    }
    render();

    return () => {
      gl.deleteProgram(program);
    };
  }, []);

  const handleClick = (e) => {
    const gl = glRef.current;
    if (!gl || !uniformsRef.current.ripplePos) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rippleStart = (Date.now() - startTimeRef.current) / 1000;

    console.log("Click at:", x.toFixed(3), y.toFixed(3));

    gl.uniform2f(uniformsRef.current.ripplePos, x, y);
    gl.uniform1f(uniformsRef.current.rippleStart, rippleStart);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleClick}
        className="border-2 border-gray-700 cursor-pointer"
      />
      <p className="text-gray-400 mt-2 text-sm">
        💧 Click to create ripples at the mouse position
      </p>
    </div>
  );
}