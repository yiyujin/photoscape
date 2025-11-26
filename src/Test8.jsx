import React, { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import SettingsNavigator from './SettingsNavigator';
import RippleMany from './RippleMany';

export default function Test8() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);

  const [isAudioReady, setIsAudioReady] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [samplerLoaded, setSamplerLoaded] = useState(false);
  const [rippleImg, setRippleImg] = useState(null);

  const [startCounter, setStartCounter] = useState(0);
  const [ambientTriggered, setAmbientTriggered] = useState(false);
  const ambientAudioRef = useRef(null);



  const synthRef = useRef(null);
  const sandboxRef = useRef(null);
  const dataRef = useRef([]);
  const imageCanvasRef = useRef(null);
  const selectedCellRef = useRef(null);
  const activeAnimationsRef = useRef([]);
  const mouseDownRef = useRef(false);
  const animationFrameRef = useRef(null);
  const animationStartedRef = useRef(false);
  const currentNoteRef = useRef(null);
  const lastCellRef = useRef(null);

  const rippleRef = useRef(null);

  const settingsNavRef = useRef(null);
  const [swatchColor, setSwatchColor] = useState('transparent');

  useEffect(() => {
    const onNextPressed = () => {
      // Reset startCounter and ambient state when settings advance
      setStartCounter(0);
      setAmbientTriggered(false);
      setShowGrid(false);

      try {
        if (ambientAudioRef.current) {
          ambientAudioRef.current.pause();
          ambientAudioRef.current = null;
        }
      } catch (e) {}
    };
    
    window.addEventListener('SettingsNavigator.nextPressed', onNextPressed);
    return () => window.removeEventListener('SettingsNavigator.nextPressed', onNextPressed);
  }, []);

  const currentSettingRef = useRef(null);

  const width = 960;
  const height = 640;
  const gridDensity = 20;

  const mappingRef = useRef({
    red: { note: 'G', baseOctave: 3 },
    green: { note: 'Bb', baseOctave: 3 },
    blue: { note: 'Eb', baseOctave: 4 },
  });

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

    // ambient audio is now handled by SettingsNavigator (HTMLAudio); no Tone.Player here

    // Wait for samples to load
    Tone.loaded().then(() => {
      setSamplerLoaded(true);
    });

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

    // Initialize GlslCanvas
    import('glslCanvas/dist/GlslCanvas.es.js').then((mod) => {
      const GlslCanvas = mod && (mod.default || mod.GlslCanvas) || mod;
      sandboxRef.current = new GlslCanvas(canvas);
      sandboxRef.current.load(fragmentShader);
      
      // Load the image from public folder
      loadImageFromPublic();
    }).catch(err => {
      console.error('Failed to load glslCanvas dist build:', err);
    });

    return () => {
      if (sandboxRef.current) {
        sandboxRef.current = null;
      }
    };
  }, []);

  const loadImageFromPublic = () => {
    // keep for backward compatibility but not used when navigator provides image
    const img = new Image();
    img.onload = () => {
      loadImageFromUrl(img.src);
    };
    img.src = '/img.jpg';
  };

  const loadImageFromUrl = (url) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // sample pixels for grid mapping
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(img, 0, 0, width, height);
      // Save the full-size sampled canvas so we can draw thumbnails later
      imageCanvasRef.current = tempCanvas;

      dataRef.current = [];
      for (let y = 0; y < height; y += gridDensity) {
        for (let x = 0; x < width; x += gridDensity) {
          const pixel = tempCtx.getImageData(x, y, 1, 1).data;
          const r = pixel[0], g = pixel[1], b = pixel[2];
          const brightness = ((r + g + b) / 3) / 255.0;
          dataRef.current.push({
            x,
            y,
            r,
            g,
            b,
            a: pixel[3],
            brightness,
          });
        }
      }

      if (sandboxRef.current) {
        sandboxRef.current.loadTexture('u_texture', img);
      }

      setImageLoaded(true);
      // inform ripple overlay which image to use
      try { setRippleImg(url); } catch (e) {}
    };
    img.src = url;
  };

  const handleSettingChange = (setting, index) => {
    if (!setting) return;

    currentSettingRef.current = setting;

    // update mappingRef -> color -> note+octave
    const newMap = {};
    Object.entries(setting.colorToMap || {}).forEach(([color, val]) => {
      const base = parseInt(val.octave || '3', 10) || 3;
      newMap[color] = { note: val.note, baseOctave: base };
    });
    mappingRef.current = newMap;

    // load image into shader and sample pixels
    if (setting.img) loadImageFromUrl(setting.img);
    // inform ripple overlay of new image
    setRippleImg(setting.img || null);

    // ambient audio is handled by SettingsNavigator (HTMLAudio autoplay).
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
    if (dominantColor === 'white') return null;
    const map = mappingRef.current || {};
    const mapped = map[dominantColor];
    if (!mapped) return null;

    // compute brightness-based octave mapping
    const brightness = ((r + g + b) / 3) / 255.0;
    const base = (mapped.baseOctave && Number.isFinite(mapped.baseOctave)) ? mapped.baseOctave : (parseInt(mapped.octave || '3', 10) || 3);
    const step = Math.min(2, Math.max(0, Math.floor(brightness * 3)));
    const octave = base - 1 + step; // maps to base-1, base, base+1
    return `${mapped.note}${octave}`;
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
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.font = '8px Arial';

      dataRef.current.forEach(cell => {
        ctx.strokeRect(cell.x, cell.y, gridDensity, gridDensity);

        const note = getNoteForCell(cell.r, cell.g, cell.b, cell.x, cell.y);
        const dominantColor = getDominantColor(cell.r, cell.g, cell.b);

        if (note) {
          // use cell brightness (0.0 - 1.0) as alpha for the color
          const alpha = (typeof cell.brightness === 'number') ? Math.max(0, Math.min(1, cell.brightness + 0.1)) : (((cell.r + cell.g + cell.b) / 3) / 255.0);
          if (dominantColor === 'red') ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
          else if (dominantColor === 'green') ctx.fillStyle = `rgba(0, 255, 0, ${alpha})`;
          else if (dominantColor === 'blue') ctx.fillStyle = `rgba(0, 0, 255, ${alpha})`;
          else ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;

          ctx.fillText(note, cell.x + 3, cell.y + 10);
        }
      });

      // SCALED UP THUMBNAIL OF SELECTED CELL
      const sel = selectedCellRef.current;
      const srcCanvas = imageCanvasRef.current;
      if (sel && srcCanvas) {
        const sx = sel.x;
        const sy = sel.y;
        const sw = gridDensity;
        const sh = gridDensity;

        const thumbW = 100;
        const thumbH = 100;
        const padding = 20;
        const dx = Math.max(0, width - thumbW - padding);
        const dy = Math.floor((height - thumbH) / 2);

        // Draw background box
        ctx.save();
        // ctx.fillStyle = 'rgba(0,0,0,0.7)';
        // ctx.fillRect(dx - 4, dy - 4, thumbW + 8, thumbH + 8);

          // Disable smoothing to keep pixelated look
          // ctx.imageSmoothingEnabled = false;
          ctx.drawImage(srcCanvas, sx, sy, sw, sh, dx, dy, thumbW, thumbH);
          // ctx.imageSmoothingEnabled = true;

          // Draw border and text with brightness and note
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 1;
          ctx.strokeRect(dx - 4, dy - 4, thumbW + 8, thumbH + 8);

          const b = (typeof sel.brightness === 'number') ? sel.brightness : (((sel.r + sel.g + sel.b) / 3) / 255);
          const note = getNoteForCell(sel.r, sel.g, sel.b, sel.x, sel.y) || '';
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.font = '12px monospace';
          ctx.fillText(`${note}`, dx, dy - 8);
          ctx.fillText(`b:${b.toFixed(2)}`, dx + 56, dy - 8);
        ctx.restore();
      }
    }
  };

  useEffect(() => {
    drawGrid();
  }, [showGrid, imageLoaded]);

  
  useEffect(() => {
    if(startCounter === 3) {
      setAmbientTriggered(true);
    }

    // console.log(ambientTriggered, startCounter)
  }, [startCounter]);

  // cleanup ambient audio on unmount
  useEffect(() => {
    return () => {
      try {
        if (ambientAudioRef.current) {
          ambientAudioRef.current.pause();
          ambientAudioRef.current = null;
        }
      } catch (e) {}
    };
  }, []);

  // start particle animation loop immediately (so visuals and ripples work before audio)
  useEffect(() => {
    startAnimation();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };

  }, []);

  // Setup both overlay canvases (grid and particle) for DPR and stacking.
  useEffect( () => {
    const gridCanvas = overlayRef.current;
    const main = canvasRef.current;
    if (!gridCanvas || !main) return;

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
    startAnimation();
  };

  const startAnimation = () => {
  if (animationStartedRef.current) return;
  animationStartedRef.current = true;

  const animate = () => {
    // Update active animations
    const animations = activeAnimationsRef.current;
    for (let i = animations.length - 1; i >= 0; i--) {
      animations[i].t += 0.02;
      animations[i].rs -= animations[i].rs * 0.15;
      if (animations[i].t > 1.0 || animations[i].rs < 0.01) {
        animations.splice(i, 1);
      }
    }

    // Update shader uniforms
    if (sandboxRef.current && animations.length > 0) {
      const maxAnimations = 50;
      const activeArray = new Array(maxAnimations).fill(0);
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
        const realToCSS = (sandboxRef.current && sandboxRef.current.realToCSSPixels) || 1;
        const canvasHeightPx = (sandboxRef.current && sandboxRef.current.gl && sandboxRef.current.gl.canvas && sandboxRef.current.gl.canvas.height) || (height * realToCSS);

        const posX = anim.x * realToCSS;
        const posY = canvasHeightPx - anim.y * realToCSS;
        activePosVecs.push([posX, posY]);
        activeColorVecs.push([brightnessR / 255, brightnessG / 255, brightnessB / 255]);
        activeTimeArray[i] = anim.t;
      }
      try {
        sandboxRef.current.setUniform('u_active', activeArray);
        sandboxRef.current.setUniform('u_activePos', activePosVecs);
        sandboxRef.current.setUniform('u_activeColor', activeColorVecs);
        sandboxRef.current.setUniform('u_activeTime', activeTimeArray);
      } catch {
        // Shader may not be ready yet
      }
    }

    // particle canvas was removed; particles are represented to the shader
    // via `activeAnimationsRef` and handled there. No per-frame 2D draw.

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  animate();
};

  const handleMouseEvent = (e) => {
    // allow visuals (thumbnail, particle markers, ripples) before audio is ready
    if (!mouseDownRef.current || !imageLoaded) return;

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
          // play sound only if audio unlocked
          if (isAudioReady) playNote(cell.r, cell.g, cell.b, cell.x, cell.y);
          lastCellRef.current = cellKey;

          // increment start counter (cap at 5)
          setStartCounter((c) => {
            const next = Math.min(10, c + 1);

            // If this user gesture moves the counter to 2, start ambient audio
            // directly here so the play() call originates from a user gesture
            // (avoids browser autoplay blocking) and only start once.
            if (next === 3 && !ambientTriggered && !ambientAudioRef.current) {
              try {
                const setting = currentSettingRef.current || {};
                if (setting.ambient) {
                  const a = new Audio(setting.ambient);
                  a.loop = true;
                  a.volume = 0.5;
                  a.play().catch(() => {
                    // play may still fail; that's ok — ambientTriggered will
                    // reflect intent and we won't repeatedly attempt to recreate
                  });
                  ambientAudioRef.current = a;
                  setAmbientTriggered(true);
                }
              } catch (err) {
                // ignore
              }
            }

            return next;
          });

          // mark this cell as the selected cell for thumbnail (clicked cell only)
          selectedCellRef.current = cell;
          // update swatch color (red/green/blue) for the side div
          try {
            const dom = getDominantColor(cell.r, cell.g, cell.b);
            if (dom === 'red') setSwatchColor('red');
            else if (dom === 'green') setSwatchColor('lime');
            else if (dom === 'blue') setSwatchColor('blue');
            else setSwatchColor('transparent');
          } catch (e) {}
          // redraw the grid overlay so the thumbnail updates immediately
          drawGrid();

          // trigger ripple overlay at click position (client coords)
          try {
            rippleRef.current?.addRipple(e.clientX, e.clientY);
          } catch (err) {
            // ignore if ripple overlay not ready
          }

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

          // immediate burst removed — particles are handled by the
          // activeAnimationsRef draw in the animation loop (Test6-style)
        }
        break;
      }
    }
  };

  const handleMouseDown = (e) => {
    if (!imageLoaded) return;
    mouseDownRef.current = true;
    handleMouseEvent(e);
  };

  const handleMouseUp = () => {
    mouseDownRef.current = false;
    lastCellRef.current = null;
    if (isAudioReady) stopNote();
  };

  return (
    <div style = { { display: 'flex', flexDirection: '', alignItems: 'center', justifyContent: 'center', backgroundColor: 'black', padding: '16px',
      // background : "rgba(255, 255, 255, 0.1)"
     }}>
      <SettingsNavigator ref={settingsNavRef} onChange={handleSettingChange} ambientPlaying = { ambientTriggered } />

      <div style = { { position: "relative", width: width, height: height, overflow : "hidden",
        // border : "1px solid red",
      } }>

        {/* SIDE DIV */}
        { isAudioReady && (
          <div style={{ position: 'absolute', left: "-95px", top: 0, width: '100px', height: '200%', zIndex: 999,
              background: swatchColor || 'transparent', transition: 'background 160ms ease',
              filter : "blur(40px)",
              animation: "oscillateOpacity 2s ease-in-out infinite"
            }}
          />
        )}
        
        {/* BUTTONS HERE */}
        <div style = { { position : "absolute", zIndex : 99, background : "", display : "flex" } }>
          {!isAudioReady && imageLoaded && samplerLoaded && (
            <button
              onClick={startAudio}
              style={{
                // color: 'white', cursor: 'pointer',
                width : "960px", height : "640px",
                display: startCounter >= 5 ? 'block' : 'none',
                color : "transparent",
                // background : "transparent",
              }}
            />
          )}
          {isAudioReady && (
            <button
              onClick = { () => { setShowGrid(!showGrid); } }
              style = { { 
                width : "100px", height : "100px", // top left corner
                background : "transparent",
                // background : "lime"
              }}
            />
          )}

          {/* NEXT SCENE BUTTON */}
          <button onClick = { () => { setStartCounter(0); setIsAudioReady(false); settingsNavRef.current?.next?.();}}
            style = { {
              width : "100px", height : "100px", // bottom right corner
              marginLeft : "760px",
              top : 0,
              background : "transparent",
              // background : "red",
            } }  
          />
        </div>


        {/* CANVAS HERE */}
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseEvent}
          onMouseLeave={handleMouseUp}
        />
        
        <canvas
          ref={overlayRef} // GRID OVERLAY
          width={width}
          height={height}
          style={{ border: '2px solid transparent', zIndex: "3", position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        />

        <RippleMany ref = { rippleRef } pointerEvents = "none" img = {rippleImg} ambientTriggered = { ambientTriggered } startCounter={startCounter} />
      </div>
    </div>
  );
}