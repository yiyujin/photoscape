import React, { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';

export default function Test5() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const overlayRef2 = useRef(null);

  const [isAudioReady, setIsAudioReady] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [samplerLoaded, setSamplerLoaded] = useState(false);
  const synthRef = useRef(null);
  const sandboxRef = useRef(null);
  const dataRef = useRef([]);
  const activeAnimationsRef = useRef([]);
  const mouseDownRef = useRef(false);
  const animationFrameRef = useRef(null);
  const currentNoteRef = useRef(null);
  const lastCellRef = useRef(null);
  const ambientPlayerRef = useRef(null);

  const width = 960;
  const height = 640;
  const gridDensity = 20;

  // Simple note mapping without octaves
//   const colorToNoteMap = {
//     red: 'Bb',   // B flat
//     green: 'D',
//     blue: 'F',
//   };

// // SOUND 2
//   const colorToNoteMap = {
//     red: 'A',
//     green: 'C',
//     blue: 'F',
//   };

// // SOUND 3
//   const colorToNoteMap = {
//     red: 'G',
//     green: 'Bb',
//     blue: 'D',
//   };

// SOUND 4
  const colorToNoteMap = {
    red: 'G',
    green: 'Bb',
    blue: 'Eb',
  };



  const fragmentShader = `
    #ifdef GL_ES
    precision mediump float;
    #endif

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform sampler2D u_texture;
    uniform float u_active[50];
    uniform vec2 u_activePos[50];
    uniform vec3 u_activeColor[50];
    uniform float u_activeTime[50];

    void main() {
      vec2 st = gl_FragCoord.xy / u_resolution;
      vec2 uv = st;
      
      // Apply ripple displacement from active cells
      for (int i = 0; i < 50; i++) {
        if (u_active[i] > 0.0) {
          vec2 cellPos = u_activePos[i] / u_resolution;
          float t = u_activeTime[i];
          vec2 offset = st - cellPos;
          float dist = length(offset * u_resolution) + 0.0001;

          // Ripple parameters - MUCH more dramatic for visibility
          float rippleSpeed = 12.0;
          float rippleFreq = 0.08;
          float rippleFalloff = 0.001;
          float rippleStrength = 0.15; // Very strong effect
          
          float ripple = sin(dist * rippleFreq - t * rippleSpeed) * exp(-dist * rippleFalloff) * (1.0 - t);

          // Displace UV coordinates
          vec2 dir = normalize(offset);
          uv += dir * ripple * rippleStrength;
        }
      }

      // Sample the image texture after uv displacement
      vec3 color = texture2D(u_texture, uv).rgb;
      
      // Add animations for active cells (color highlights)
      for (int i = 0; i < 50; i++) {
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
            
            // Additive blending
            color += animColor * intensity * 1.2;
          }
        }
      }
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  useEffect(() => {
    // Initialize Tone.js sampler with piano sounds
    synthRef.current = new Tone.Sampler({
      urls: {
        C4: "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        A4: "A4.mp3",
      },
      release: 1,
      baseUrl: "https://tonejs.github.io/audio/salamander/",
    }).toDestination();
    
    synthRef.current.volume.value = -8;

    // Initialize ambient background player
    ambientPlayerRef.current = new Tone.Player({
      url: "/ambient.mp3",
      loop: true,
      autostart: false
    }).toDestination();
    
    ambientPlayerRef.current.volume.value = -12; // Quieter background

    // Wait for samples to load
    Tone.loaded().then(() => {
      setSamplerLoaded(true);
    });

    return () => {
      if (synthRef.current) {
        synthRef.current.dispose();
      }
      if (ambientPlayerRef.current) {
        ambientPlayerRef.current.dispose();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize GlslCanvas
    import('glslcanvas').then(({ default: GlslCanvas }) => {
      sandboxRef.current = new GlslCanvas(canvas);
      sandboxRef.current.load(fragmentShader);
      
      // Load the image from public folder
      loadImageFromPublic();
    }).catch(err => {
      console.error('Failed to load glslCanvas:', err);
    });

    return () => {
      if (sandboxRef.current) {
        sandboxRef.current = null;
      }
    };
  }, []);

  const loadImageFromPublic = () => {
    const img = new Image();
    img.onload = () => {
      // Create a temporary canvas to sample pixel colors
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(img, 0, 0, width, height);

      // Sample image colors into data[] at gridDensity intervals
      dataRef.current = [];
      for (let y = 0; y < height; y += gridDensity) {
        for (let x = 0; x < width; x += gridDensity) {
          const pixel = tempCtx.getImageData(x, y, 1, 1).data;
          dataRef.current.push({
            x,
            y,
            r: pixel[0],
            g: pixel[1],
            b: pixel[2],
            a: pixel[3]
          });
        }
      }

      // Load texture into shader using the library's loader (pass element)
      if (sandboxRef.current) {
        // use loadTexture so the library treats the Image element correctly
        sandboxRef.current.loadTexture('u_texture', img);
      }

      setImageLoaded(true);
    };
    img.src = '/img.jpg'; // Load from public folder
  };

  const getDominantColor = (r, g, b) => {
    const threshold = 0;
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

    const note = colorToNoteMap[dominantColor];
    
    // SOUND 1, 2
    // if (dominantColor === 'red') {
    //   return `${note}3`;
    // }
    // return `${note}4`;

    // SOUND 3, 4
    if (dominantColor === 'red' || dominantColor === 'green') {
      return `${note}3`;
    }
    return `${note}4`;

    
  };

  const playNote = (r, g, b, x, y) => {
    const note = getNoteForCell(r, g, b, x, y);
    if (note && synthRef.current) {
      // If we're already playing this note, don't retrigger
      if (currentNoteRef.current === note) {
        return;
      }
      
      // Stop previous note if any
      if (currentNoteRef.current) {
        synthRef.current.triggerRelease(currentNoteRef.current);
      }
      
      // Start new sustained note
      synthRef.current.triggerAttack(note);
      currentNoteRef.current = note;
    }
  };
  
  const stopNote = () => {
    if (currentNoteRef.current && synthRef.current) {
      synthRef.current.triggerRelease(currentNoteRef.current);
      currentNoteRef.current = null;
    }
  };

  const drawGrid = () => {
    const gridCanvas = overlayRef.current;
    if (!gridCanvas) return;

    const ctx = gridCanvas.getContext('2d');
    // clear and draw grid only when requested; this function is called from
    // the showGrid/imageLoaded effect, not per animation frame
    ctx.clearRect(0, 0, width, height);

    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
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

  useEffect(() => {
    drawGrid();
  }, [showGrid, imageLoaded]);

  // Setup both overlay canvases (grid and particle) for DPR and stacking.
  useEffect(() => {
    const gridCanvas = overlayRef.current;
    const particleCanvas = overlayRef2.current;
    const main = canvasRef.current;
    if (!gridCanvas || !particleCanvas || !main) return;

    const setup = () => {
      const dpr = window.devicePixelRatio || 1;

      // Grid canvas (top)
      gridCanvas.width = Math.floor(width * dpr);
      gridCanvas.height = Math.floor(height * dpr);
      gridCanvas.style.width = width + 'px';
      gridCanvas.style.height = height + 'px';
      gridCanvas.style.position = 'absolute';
      gridCanvas.style.top = '0px';
      gridCanvas.style.left = '0px';
      gridCanvas.style.zIndex = '3';
      const gctx = gridCanvas.getContext('2d');
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Particle canvas (middle)
      particleCanvas.width = Math.floor(width * dpr);
      particleCanvas.height = Math.floor(height * dpr);
      particleCanvas.style.width = width + 'px';
      particleCanvas.style.height = height + 'px';
      particleCanvas.style.position = 'absolute';
      particleCanvas.style.top = '0px';
      particleCanvas.style.left = '0px';
      particleCanvas.style.zIndex = '2';
      const pctx = particleCanvas.getContext('2d');
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Ensure main canvas is below
      main.style.position = 'relative';
      main.style.zIndex = '1';

      // Redraw grid if visible
      if (showGrid) drawGrid();
    };

    setup();
    window.addEventListener('resize', setup);
    return () => window.removeEventListener('resize', setup);
  }, [showGrid]);

  const startAudio = async () => {
    await Tone.start();
    setIsAudioReady(true);
    
    // Start ambient background music
    if (ambientPlayerRef.current) {
      ambientPlayerRef.current.start();
    }
    
    startAnimation();
  };

  const startAnimation = () => {
    const animate = () => {
      // Update active animations - remove faster to prevent buildup
      const animations = activeAnimationsRef.current;
      for (let i = animations.length - 1; i >= 0; i--) {
        animations[i].t += 0.02; // Faster animation
        animations[i].rs -= animations[i].rs * 0.15; // Faster decay
        if (animations[i].t > 1.0 || animations[i].rs < 0.01) { // Remove after 1 second
          animations.splice(i, 1);
        }
      }

      // Update shader uniforms - limit to active animations only
      if (sandboxRef.current && animations.length > 0) {
        const maxAnimations = 50; // Reduced from 100
        const activeArray = new Array(maxAnimations).fill(0);
        // Build arrays-of-vectors so glslCanvas parses them as vec2/vec3 arrays
        const activePosVecs = [];
        const activeColorVecs = [];
        const activeTimeArray = new Array(maxAnimations).fill(0);

        for (let i = 0; i < Math.min(animations.length, maxAnimations); i++) {
          const anim = animations[i];
          const strongestColor = Math.max(anim.r, anim.g, anim.b);
          let brightnessR, brightnessG, brightnessB;
          const sf = 0.5;

          if (strongestColor === anim.r) {
            brightnessR = 255;
            brightnessG = anim.g * sf;
            brightnessB = anim.b * sf;
          } else if (strongestColor === anim.g) {
            brightnessG = 255;
            brightnessR = anim.r * sf;
            brightnessB = anim.b * sf;
          } else {
            brightnessB = 255;
            brightnessR = anim.r * sf;
            brightnessG = anim.g * sf;
          }

          activeArray[i] = 1.0;
          // Convert CSS pixel coordinates into drawing-buffer pixels used by the shader
          const realToCSS = (sandboxRef.current && sandboxRef.current.realToCSSPixels) || 1;
          const canvasHeightPx = (sandboxRef.current && sandboxRef.current.gl && sandboxRef.current.gl.canvas && sandboxRef.current.gl.canvas.height) || (height * realToCSS);

          const posX = anim.x * realToCSS;
          const posY = canvasHeightPx - anim.y * realToCSS; // flip Y for GL
          activePosVecs.push([posX, posY]);
          activeColorVecs.push([brightnessR / 255, brightnessG / 255, brightnessB / 255]);
          activeTimeArray[i] = anim.t;
        }
        try {
          // Pass arrays (not spread) so parseUniforms recognizes arrays-of-vectors
          sandboxRef.current.setUniform('u_active', activeArray);
          sandboxRef.current.setUniform('u_activePos', activePosVecs);
          sandboxRef.current.setUniform('u_activeColor', activeColorVecs);
          sandboxRef.current.setUniform('u_activeTime', activeTimeArray);
        } catch {
          // Shader may not be ready yet
        }

      // Draw particle animations to a dedicated particle canvas so the grid
      // canvas isn't cleared each frame.
      const particleCanvas = overlayRef2.current;
      if (particleCanvas) {
        const pctx = particleCanvas.getContext('2d');
        pctx.clearRect(0, 0, width, height);

        const animationsForDraw = activeAnimationsRef.current;
        for (let i = animationsForDraw.length - 1; i >= 0; i--) {
          const a = animationsForDraw[i];
          const dy = -a.t * 100;

          pctx.save();
          pctx.translate(a.x + gridDensity / 2, a.y + gridDensity / 2 + dy);

          const strongest = Math.max(a.r, a.g, a.b);
          let brightnessR, brightnessG, brightnessB;
          const sf = 0.5;
          if (strongest === a.r) {
            brightnessR = 255;
            brightnessG = a.g * sf;
            brightnessB = a.b * sf;
          } else if (strongest === a.g) {
            brightnessG = 255;
            brightnessR = a.r * sf;
            brightnessB = a.b * sf;
          } else {
            brightnessB = 255;
            brightnessR = a.r * sf;
            brightnessG = a.g * sf;
          }

          pctx.globalCompositeOperation = 'lighter';
          const angleBase = Math.PI / 180;

          pctx.fillStyle = `rgba(255,0,0,${Math.min(1, brightnessR / 255)})`;
          pctx.fillRect(Math.sin((a.rand + a.t * 600) * angleBase) * 10, 0, a.rs, a.rs);

          pctx.fillStyle = `rgba(0,255,0,${Math.min(1, brightnessG / 255)})`;
          pctx.fillRect(Math.sin((a.rand * 2 + a.t * 600) * angleBase) * 10, -a.rs * 0.5, a.rs, a.rs);

          pctx.fillStyle = `rgba(0,0,255,${Math.min(1, brightnessB / 255)})`;
          pctx.fillRect(Math.sin((a.rand * 3 + a.t * 600) * angleBase) * 10, -a.rs, a.rs, a.rs);

          pctx.restore();
        }
      }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
  };

  const handleMouseEvent = (e) => {
    if (!isAudioReady || !mouseDownRef.current || !imageLoaded) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    for (let cell of dataRef.current) {
      if (mouseX >= cell.x && mouseX < cell.x + gridDensity &&
          mouseY >= cell.y && mouseY < cell.y + gridDensity) {

        // Only trigger if we moved to a different cell
        const cellKey = `${cell.x},${cell.y}`;
        if (lastCellRef.current !== cellKey) {
          playNote(cell.r, cell.g, cell.b, cell.x, cell.y);
          lastCellRef.current = cellKey;

          const depthData = 1 + (cell.y / height) * 1.5;
          activeAnimationsRef.current.push({
            x: cell.x + gridDensity / 2,
            y: cell.y + gridDensity / 2,
            r: cell.r,
            g: cell.g,
            b: cell.b,
            t: 0,
            rs: 8 * depthData,
            rand: Math.random() * 100
          });

          if (activeAnimationsRef.current.length > 50) { // Reduced from 100
            activeAnimationsRef.current.shift();
          }
        }
        break;
      }
    }
  };

  const handleMouseDown = (e) => {
    if (!isAudioReady || !imageLoaded) return;
    mouseDownRef.current = true;
    handleMouseEvent(e);
  };

  const handleMouseUp = () => {
    mouseDownRef.current = false;
    lastCellRef.current = null;
    stopNote();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#111827', padding: '16px' }}>
      <div style={{ marginBottom: '16px', textAlign: 'center' }}>
        <p style={{ color: '#D1D5DB', fontSize: '14px', marginBottom: '16px' }}>
          Red → B♭ | Green → D | Blue → F
        </p>
        
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
          {!isAudioReady && imageLoaded && samplerLoaded && (
            <button
              onClick={startAudio}
              style={{ padding: '12px 24px', backgroundColor: '#2563EB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#1D4ED8'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#2563EB'}
            >
              Start Audio & Play
            </button>
          )}
          {(!imageLoaded || !samplerLoaded) && (
            <p style={{ color: '#9CA3AF', fontSize: '14px' }}>
              {!imageLoaded && 'Loading image...'}
              {!samplerLoaded && ' Loading piano samples...'}
            </p>
          )}
          {isAudioReady && (
            <>
              <p style={{ color: '#4ADE80', fontSize: '14px' }}>🎵 Audio ready - Click and drag!</p>
              <button
                onClick={() => {
                  setShowGrid(!showGrid);
                }}
                style={{ 
                  padding: '8px 16px', 
                  backgroundColor: showGrid ? '#16A34A' : '#4B5563', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '8px', 
                  fontWeight: '600', 
                  cursor: 'pointer' 
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = showGrid ? '#15803D' : '#374151'}
                onMouseOut={(e) => e.target.style.backgroundColor = showGrid ? '#16A34A' : '#4B5563'}
              >
                {showGrid ? '✓ Hide Grid' : 'Show Grid'}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseEvent}
          onMouseLeave={handleMouseUp}
          style={{ border: '2px solid #374151', cursor: isAudioReady && imageLoaded ? 'crosshair' : 'not-allowed', zIndex: "1" }}
        />
        <canvas
          ref={overlayRef2}
          width={width}
          height={height}
          style={{ border: '2px solid transparent', zIndex: "2", position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        />
        <canvas
          ref={overlayRef}
          width={width}
          height={height}
          style={{ border: '2px solid transparent', zIndex: "999", position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        />
      </div>
    </div>
  );
}