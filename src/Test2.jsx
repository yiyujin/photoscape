import React, { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';

export default function Test2() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const synthRef = useRef(null);
  const sandboxRef = useRef(null);
  const dataRef = useRef([]);
  const activeAnimationsRef = useRef([]);
  const mouseDownRef = useRef(false);
  const animationFrameRef = useRef(null);

  const width = 960;
  const height = 640;
  const gridDensity = 20;

  const colorToNoteMap = {
    red: ['C', 'E', 'G', 'C'],
    green: ['E', 'G', 'B', 'E'],
    blue: ['G', 'B', 'D', 'G']
  };

  const fragmentShader = `
    #ifdef GL_ES
    precision mediump float;
    #endif

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_active[100];
    uniform vec2 u_activePos[100];
    uniform vec3 u_activeColor[100];
    uniform float u_activeTime[100];

    void main() {
      vec2 st = gl_FragCoord.xy / u_resolution;
      
      // Create gradient background
      vec3 color = vec3(st.x, st.y, (st.x + st.y) * 0.5);
      
      // Add animations for active cells
      for (int i = 0; i < 100; i++) {
        if (u_active[i] > 0.0) {
          vec2 cellPos = u_activePos[i];
          float t = u_activeTime[i];
          vec2 offset = gl_FragCoord.xy - cellPos;
          float dy = -t * 100.0;
          offset.y -= dy;
          
          float dist = length(offset);
          float size = 8.0 * (1.0 + cellPos.y / u_resolution.y * 1.5) * (1.0 - t * 0.1);
          
          if (dist < size) {
            vec3 animColor = u_activeColor[i];
            float intensity = 1.0 - (dist / size);
            intensity *= (1.0 - t);
            
            // Additive blending with sine waves
            float sine1 = sin((t * 600.0 + float(i)) * 0.01745) * 10.0;
            float sine2 = sin((t * 600.0 + float(i) * 2.0) * 0.01745) * 10.0;
            float sine3 = sin((t * 600.0 + float(i) * 3.0) * 0.01745) * 10.0;
            
            color += animColor * intensity * 0.5;
          }
        }
      }
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  useEffect(() => {
    // Initialize Tone.js synth
    synthRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.02,
        decay: 0.3,
        sustain: 0.2,
        release: 1
      }
    }).toDestination();
    synthRef.current.volume.value = -8;

    return () => {
      if (synthRef.current) {
        synthRef.current.dispose();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize GlslCanvas - dynamically import to avoid SSR issues
    import('glslcanvas').then(({ default: GlslCanvas }) => {
      sandboxRef.current = new GlslCanvas(canvas);
      sandboxRef.current.load(fragmentShader);
    }).catch(err => {
      console.error('Failed to load glslCanvas:', err);
    });

    // Sample grid data
    dataRef.current = [];
    for (let y = 0; y < height; y += gridDensity) {
      for (let x = 0; x < width; x += gridDensity) {
        const r = (x / width) * 255;
        const g = (y / height) * 255;
        const b = ((x + y) / (width + height)) * 255;
        dataRef.current.push({ x, y, r, g, b });
      }
    }

    return () => {
      if (sandboxRef.current) {
        // Cleanup shader
        sandboxRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    drawGrid();
  }, [showGrid]);

  const getDominantColor = (r, g, b) => {
    const threshold = 10;
    const diffRG = Math.abs(r - g);
    const diffGB = Math.abs(g - b);
    const diffBR = Math.abs(b - r);

    if (diffRG < threshold && diffGB < threshold && diffBR < threshold) {
      return 'white';
    }

    const strongest = Math.max(r, g, b);
    if (strongest === r) return 'red';
    if (strongest === g) return 'green';
    return 'blue';
  };

  const getNoteForCell = (r, g, b, x, y) => {
    const dominantColor = getDominantColor(r, g, b);
    if (dominantColor === 'white' || !colorToNoteMap[dominantColor]) return null;

    const octave = Math.floor(4 + (1 - y / height) * 2);
    const noteIndex = Math.floor((x / width) * colorToNoteMap[dominantColor].length);
    const note = colorToNoteMap[dominantColor][noteIndex];

    return `${note}${octave}`;
  };

  const playNote = (r, g, b, x, y) => {
    const note = getNoteForCell(r, g, b, x, y);
    if (note && synthRef.current) {
      synthRef.current.triggerAttackRelease(note, '8n');
    }
  };

  const drawGrid = () => {
    const overlayCanvas = overlayRef.current;
    if (!overlayCanvas) return;

    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.zIndex = 10;
      ctx.font = 'bold 10px monospace';

      dataRef.current.forEach(cell => {
        ctx.strokeRect(cell.x, cell.y, gridDensity, gridDensity);

        const note = getNoteForCell(cell.r, cell.g, cell.b, cell.x, cell.y);
        const dominantColor = getDominantColor(cell.r, cell.g, cell.b);

        if (note) {
          const textWidth = ctx.measureText(note).width;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
          ctx.fillRect(cell.x + 1, cell.y + 1, textWidth + 4, 12);

          if (dominantColor === 'red') ctx.fillStyle = '#ffaaaa';
          else if (dominantColor === 'green') ctx.fillStyle = '#aaffaa';
          else if (dominantColor === 'blue') ctx.fillStyle = '#aaaaff';
          else ctx.fillStyle = 'white';

          ctx.fillText(note, cell.x + 3, cell.y + 10);
        }
      });
    }
  };

  const startAudio = async () => {
    await Tone.start();
    setIsAudioReady(true);
    startAnimation();
  };

  const startAnimation = () => {
    const animate = () => {
      // Update active animations
      const animations = activeAnimationsRef.current;
      for (let i = animations.length - 1; i >= 0; i--) {
        animations[i].t += 0.01;
        if (animations[i].t >= 1.0) {
          animations.splice(i, 1);
        }
      }

      // Update shader uniforms
      if (sandboxRef.current) {
        const activeArray = new Array(100).fill(0);
        const activePosArray = new Array(200).fill(0);
        const activeColorArray = new Array(300).fill(0);
        const activeTimeArray = new Array(100).fill(0);

        for (let i = 0; i < Math.min(animations.length, 100); i++) {
          const anim = animations[i];
          activeArray[i] = 1.0;
          activePosArray[i * 2] = anim.x;
          activePosArray[i * 2 + 1] = anim.y;
          activeColorArray[i * 3] = anim.r;
          activeColorArray[i * 3 + 1] = anim.g;
          activeColorArray[i * 3 + 2] = anim.b;
          activeTimeArray[i] = anim.t;
        }

        try {
          sandboxRef.current.setUniform('u_active', ...activeArray);
          sandboxRef.current.setUniform('u_activePos', ...activePosArray);
          sandboxRef.current.setUniform('u_activeColor', ...activeColorArray);
          sandboxRef.current.setUniform('u_activeTime', ...activeTimeArray);
        } catch {
          // Shader may not be ready yet
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
  };

  const handleMouseEvent = (e) => {
    if (!isAudioReady || !mouseDownRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    for (let cell of dataRef.current) {
      if (mouseX >= cell.x && mouseX < cell.x + gridDensity &&
          mouseY >= cell.y && mouseY < cell.y + gridDensity) {

        playNote(cell.r, cell.g, cell.b, cell.x, cell.y);

        const depthData = 1 + (cell.y / height) * 1.5;
        activeAnimationsRef.current.push({
          x: cell.x + gridDensity / 2,
          y: cell.y + gridDensity / 2,
          r: cell.r / 255,
          g: cell.g / 255,
          b: cell.b / 255,
          t: 0,
          rs: 8 * depthData,
          rand: Math.random() * 100
        });

        if (activeAnimationsRef.current.length > 100) {
          activeAnimationsRef.current.shift();
        }
        break;
      }
    }
  };

  const handleMouseDown = (e) => {
    if (!isAudioReady) return;
    mouseDownRef.current = true;
    handleMouseEvent(e);
  };

  const handleMouseUp = () => {
    mouseDownRef.current = false;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4">
      <div className="mb-4 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">RGB Musical Canvas - Shader Version</h1>
        <p className="text-gray-300 text-sm mb-4">
          Red → C major | Green → E minor | Blue → G major
        </p>
        <div className="flex gap-4 items-center justify-center mb-2">
          {!isAudioReady && (
            <button
              onClick={startAudio}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
            >
              Start Audio & Play
            </button>
          )}
          {isAudioReady && (
            <>
              <p className="text-green-400 text-sm">🎵 Audio ready - Click and drag!</p>
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  showGrid
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                }`}
              >
                {showGrid ? '✓ Hide Grid' : 'Show Grid'}
              </button>
            </>
          )}
        </div>
      </div>

      <div style = { { position : "relative" } }>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseEvent}
          onMouseLeave={handleMouseUp}
          className="border-2 border-gray-700 cursor-crosshair"
          style={{ cursor: isAudioReady ? 'crosshair' : 'not-allowed' }}
        />
        <canvas
          ref={overlayRef}
          width={width}
          height={height}
          className="absolute top-0 left-0 pointer-events-none"
          style={{ border: '2px solid transparent', position : "absolute", top : 0, left : 0, pointerEvents: 'none'  }}
        />
      </div>
    </div>
  );
};