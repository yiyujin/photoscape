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
  const activePointersRef = useRef(new Map());
  const touchMarkersRef = useRef(new Map()); // touch identifier -> {x,y}
  const animationFrameRef = useRef(null);
  const animationStartedRef = useRef(false);
  const currentNoteRef = useRef(null);
  const lastCellRef = useRef(null);
  const activeNotesRef = useRef(new Map()); // note -> count of holders
  const releaseTimersRef = useRef(new Map()); // note -> timer id
  const CROSSFADE_MS = 120;

  const incNoteCount = (note) => {
    if (!note) return;
    const m = activeNotesRef.current;
    const c = m.get(note) || 0;
    m.set(note, c + 1);
    // clear any pending release for this note
    if (releaseTimersRef.current.has(note)) {
      clearTimeout(releaseTimersRef.current.get(note));
      releaseTimersRef.current.delete(note);
    }
  };

  const decNoteCount = (note, immediate = false) => {
    if (!note) return;
    const m = activeNotesRef.current;
    const c = m.get(note) || 0;
    if (c <= 1) {
      m.delete(note);
      // schedule release
      if (releaseTimersRef.current.has(note)) {
        clearTimeout(releaseTimersRef.current.get(note));
        releaseTimersRef.current.delete(note);
      }
      if (immediate) {
        try { safeTriggerRelease(synthRef.current, note); } catch (e) {}
      } else {
        const t = setTimeout(() => {
          try { safeTriggerRelease(synthRef.current, note); } catch (e) {}
          releaseTimersRef.current.delete(note);
        }, CROSSFADE_MS);
        releaseTimersRef.current.set(note, t);
      }
    } else {
      m.set(note, c - 1);
    }
  };

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

  // Helpers to safely play/release notes on different Tone instruments.
  const safeTriggerAttack = (inst, note) => {
    if (!inst || !note) return;
    const doTrigger = () => {
      try {
        if (typeof inst.triggerAttack === 'function') {
          inst.triggerAttack(note);
        } else if (typeof inst.triggerAttackRelease === 'function') {
          // fallback to immediate attack+release with a short sustain
          inst.triggerAttackRelease(note, '1n');
        } else if (typeof inst.pluck === 'function') {
          // PluckSynth uses `pluck`
          inst.pluck(note);
        } else if (typeof inst.trigger === 'function') {
          inst.trigger('attack', note);
        }
        return true;
      } catch (e) {
        // If the sampler buffer hasn't loaded yet, Tone will throw an error
        // like "buffer is either not set or not loaded". In that case, wait
        // for Tone.loaded() and retry once. Other errors are logged.
        const msg = (e && e.message) ? e.message.toLowerCase() : String(e).toLowerCase();
        if (msg.includes('buffer') || msg.includes('not set') || msg.includes('not loaded')) {
          Tone.loaded().then(() => {
            try {
              if (!inst) return;
              if (typeof inst.triggerAttack === 'function') {
                inst.triggerAttack(note);
              } else if (typeof inst.triggerAttackRelease === 'function') {
                inst.triggerAttackRelease(note, '1n');
              } else if (typeof inst.pluck === 'function') {
                inst.pluck(note);
              } else if (typeof inst.trigger === 'function') {
                inst.trigger('attack', note);
              }
            } catch (e2) {
              console.warn('safeTriggerAttack retry failed', e2);
            }
          }).catch(() => {});
        } else {
          console.warn('safeTriggerAttack failed', e);
        }
        return false;
      }
    };

    // Attempt now
    doTrigger();
  };

  const safeTriggerRelease = (inst, note) => {
    if (!inst) return;
    try {
      if (!note) {
        // If no note provided, try generic release if available
        if (typeof inst.releaseAll === 'function') inst.releaseAll();
        return;
      }

      if (typeof inst.triggerRelease === 'function') {
        inst.triggerRelease(note);
      } else if (typeof inst.triggerAttackRelease === 'function') {
        // can't release a triggerAttackRelease (it manages its own release)
        // so do nothing here
      } else if (typeof inst.untrigger === 'function') {
        inst.untrigger(note);
      } else if (typeof inst.releaseAll === 'function') {
        inst.releaseAll();
      }
    } catch (e) {
      console.warn('safeTriggerRelease failed', e);
    }
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

    // ambient audio is now handled by SettingsNavigator (HTMLAudio); no Tone.Player here

    // Wait for samples to load
    Tone.loaded().then(() => {
      setSamplerLoaded(true);
    });

    return () => {
      if (synthRef.current) {
        try {
          if (synthRef.current._effect && typeof synthRef.current._effect.dispose === 'function') {
            try { synthRef.current._effect.dispose(); } catch (e) {}
          }
        } catch (e) {}
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

    // Switch the instrument/synth according to the setting's `instrument` field.
    // Stop any currently-sounding note, dispose the previous synth and
    // create the right Tone instrument.
    try {
      if (currentNoteRef.current && synthRef.current) {
        try { synthRef.current.triggerRelease(currentNoteRef.current); } catch (e) {}
        currentNoteRef.current = null;
      }
    } catch (e) {}
    try {
      if (synthRef.current) {
        // Before disposing, release any held notes and clear pending timers
        try {
          for (const t of releaseTimersRef.current.values()) {
            try { clearTimeout(t); } catch (e) {}
          }
          releaseTimersRef.current.clear();
        } catch (e) {}

        try {
          for (const note of activeNotesRef.current.keys()) {
            try { safeTriggerRelease(synthRef.current, note); } catch (e) {}
          }
          activeNotesRef.current.clear();
        } catch (e) {}

        try { activePointersRef.current.clear(); } catch (e) {}
        try { currentNoteRef.current = null; } catch (e) {}

        try { synthRef.current.dispose(); } catch (e) {}
        synthRef.current = null;
      }
    } catch (e) {}

    const instr = (setting.instrument || 'piano').toLowerCase();
    if (instr === 'piano') {
      synthRef.current = new Tone.Sampler({
        urls: {
          C4: 'C4.mp3',
          'D#4': 'Ds4.mp3',
          'F#4': 'Fs4.mp3',
          A4: 'A4.mp3',
        },
        release: 1,
        baseUrl: 'https://tonejs.github.io/audio/salamander/',
      }).toDestination();
      try { synthRef.current.volume.value = -8; } catch (e) {}
      // ensure samples loaded
      Tone.loaded().then(() => setSamplerLoaded(true));
    } else if (instr === 'pluck' || instr === 'guitar') {
      synthRef.current = new Tone.PluckSynth().toDestination();
      try { synthRef.current.volume.value = -8; } catch (e) {}
      setSamplerLoaded(true);
    } else if (instr === 'sine') {
      synthRef.current = new Tone.Synth({ oscillator: { type: 'sine' } }).toDestination();
      try { synthRef.current.volume.value = -8; } catch (e) {}
      setSamplerLoaded(true);
    } else if (instr === 'pingpong-drum') {
      try {
        const pingPong = new Tone.PingPongDelay('4n', 0.2).toDestination();
        const drum = new Tone.MembraneSynth().connect(pingPong);
        synthRef.current = drum;
        synthRef.current._effect = pingPong;
        setSamplerLoaded(true);
      } catch (e) {
        synthRef.current = new Tone.MembraneSynth().toDestination();
        setSamplerLoaded(true);
      }
    } else {
      // fallback to a simple synth
      synthRef.current = new Tone.Synth().toDestination();
      try { synthRef.current.volume.value = -8; } catch (e) {}
      setSamplerLoaded(true);
    }

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
    // If current setting uses pingpong-drum, play a snare-like noise instead
    const currentInstr = currentSettingRef.current && (currentSettingRef.current.instrument || '').toLowerCase();
    if (currentInstr === 'pingpong-drum' && synthRef.current) {
      try {
        // short noise hit
        if (typeof synthRef.current.triggerAttackRelease === 'function') {
          synthRef.current.triggerAttackRelease('16n');
        } else if (typeof synthRef.current.triggerAttack === 'function') {
          synthRef.current.triggerAttack('16n');
        }
      } catch (e) {
        console.warn('pingpong-drum play failed', e);
      }
      return;
    }

    const note = getNoteForCell(r, g, b, x, y);
    // Guard: don't attempt to play sampler notes until samplerLoaded is true.
    if (!note || !synthRef.current || !isAudioReady) return;
    if (!samplerLoaded) {
      // If samples aren't loaded yet, skip triggering now. safeTriggerAttack
      // already retries on Tone.loaded(), but avoid changing holder state
      // until the instrument is ready to reduce races.
      return;
    }

    // If we're already playing this note, don't retrigger
    if (currentNoteRef.current === note) return;

    // Use holder-count logic so transitions are smooth and per-pointer logic
    // remains consistent with mouse dragging behavior.
    const prev = currentNoteRef.current;
    try {
      // increment holder for the new note and play it
      incNoteCount(note);
      safeTriggerAttack(synthRef.current, note);
      currentNoteRef.current = note;
      // decrement the previous note so it will be released with crossfade
      if (prev && prev !== note) {
        decNoteCount(prev, false);
      }
    } catch (err) {
      console.warn('playNote error', err);
    }
  };
  
  const stopNote = () => {
    if (currentNoteRef.current) {
      // Use decNoteCount so the same crossfade scheduling is used
      decNoteCount(currentNoteRef.current, false);
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
      // draw any active touch markers on top (always draw, even if grid hidden)
      try {
        for (const [id, p] of touchMarkersRef.current.entries()) {
          if (!p) continue;
          ctx.beginPath();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 2;
          const cx = p.x + 0.5; const cy = p.y + 0.5;
          ctx.arc(cx, cy, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(0,0,0,0.9)';
          ctx.font = '10px monospace';
          ctx.fillText(String(id), cx - 4, cy + 4);
        }
      } catch (e) {}
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
          // determine note for this cell first; if there's no note, don't
          // change the current sustained note (avoids abrupt silence while dragging)
          const noteHere = getNoteForCell(cell.r, cell.g, cell.b, cell.x, cell.y);
          const instr = currentSettingRef.current && (currentSettingRef.current.instrument || '').toLowerCase();
          // pingpong-drum is a one-shot instrument: still trigger when entering cells
          const shouldTrigger = (noteHere != null) || (instr === 'pingpong-drum');
          if (shouldTrigger && isAudioReady) {
            playNote(cell.r, cell.g, cell.b, cell.x, cell.y);
            lastCellRef.current = cellKey;
          }

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

  // play a cell for a specific pointerId (supports multi-touch)
  const playCellForPointer = (cell, pointerId, clientX, clientY) => {
    if (!cell) return;
    const cellKey = `${cell.x},${cell.y}`;
    const state = activePointersRef.current.get(pointerId) || {};
    if (state.lastCellKey === cellKey) return;

    const instr = currentSettingRef.current && (currentSettingRef.current.instrument || '').toLowerCase();
    const note = getNoteForCell(cell.r, cell.g, cell.b, cell.x, cell.y);
    // If there's no musical note here and instrument isn't a one-shot, do
    // not update pointer's lastCellKey nor stop the previously held note.
    if (note == null && instr !== 'pingpong-drum') return;

    // update last cell
    state.lastCellKey = cellKey;

    // handle ambient/start counter like mouse
    setStartCounter((c) => {
      const next = Math.min(10, c + 1);
      if (next === 3 && !ambientTriggered && !ambientAudioRef.current) {
        try {
          const setting = currentSettingRef.current || {};
          if (setting.ambient) {
            const a = new Audio(setting.ambient);
            a.loop = true;
            a.volume = 0.5;
            a.play().catch(() => {});
            ambientAudioRef.current = a;
            setAmbientTriggered(true);
          }
        } catch (err) {}
      }
      return next;
    });

    // visual selection and ripple
    selectedCellRef.current = cell;
    try {
      const dom = getDominantColor(cell.r, cell.g, cell.b);
      if (dom === 'red') setSwatchColor('red');
      else if (dom === 'green') setSwatchColor('lime');
      else if (dom === 'blue') setSwatchColor('blue');
      else setSwatchColor('transparent');
    } catch (e) {}
    drawGrid();
    try { rippleRef.current?.addRipple(clientX, clientY); } catch (e) {}

    // trigger the sound for this pointer
    if (instr === 'pingpong-drum' && synthRef.current) {
      try {
        if (typeof synthRef.current.triggerAttackRelease === 'function') {
          synthRef.current.triggerAttackRelease('16n');
        } else if (typeof synthRef.current.triggerAttack === 'function') {
          synthRef.current.triggerAttack('16n');
        }
      } catch (e) { console.warn('pingpong-drum play failed', e); }
      activePointersRef.current.set(pointerId, state);
      return;
    }

    // Guard: if samples/instrument aren't ready, skip triggering
    if (note && !samplerLoaded) return;

    if (note && synthRef.current && isAudioReady) {
      try {
        // release previous note held by this pointer (if any)
        if (state.note && state.note !== note) {
          decNoteCount(state.note, false);
        }
        // increment holder count for this note
        incNoteCount(note);
        safeTriggerAttack(synthRef.current, note);
        // store the note so we can release it when this pointer lifts
        state.note = note;
      } catch (err) {
        console.warn('play error', err);
      }
    }

    activePointersRef.current.set(pointerId, state);
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

  // Pointer (touch) support: mirror mouse handlers so dragging a finger on
  // the canvas behaves like mouse drag on desktop.
  const handlePointerEvent = (e) => {
    // For pointer events, treat them like mouse events; use clientX/Y
    // We support multi-touch by tracking pointerId in activePointersRef.
    if (!imageLoaded) return;
    if (!activePointersRef.current.has(e.pointerId)) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    for (let cell of dataRef.current) {
      if (px >= cell.x && px < cell.x + gridDensity && py >= cell.y && py < cell.y + gridDensity) {
        playCellForPointer(cell, e.pointerId, e.clientX, e.clientY);
        break;
      }
    }
  };

  const handlePointerDown = (e) => {
    // prevent page scroll / gestures while interacting with the canvas
    try { e.preventDefault(); } catch (err) {}
    if (!imageLoaded) return;
    // register this active pointer
    activePointersRef.current.set(e.pointerId, { lastCellKey: null, note: null });
    // attempt to capture the pointer so we continue receiving events
    try {
      const tgt = e.currentTarget || e.target || canvasRef.current;
      if (tgt && typeof tgt.setPointerCapture === 'function') {
        try { tgt.setPointerCapture(e.pointerId); } catch (err) {}
      }
    } catch (err) {}

    handlePointerEvent(e);
  };

  const handlePointerUp = (e) => {
    // release any note associated with this pointer
    try {
      const state = activePointersRef.current.get(e.pointerId);
      if (state && state.note && synthRef.current) {
        // decrement holder count and schedule release with crossfade
        decNoteCount(state.note, false);
      }
    } catch (err) {}
    activePointersRef.current.delete(e.pointerId);
    try {
      const tgt = e.currentTarget || e.target || canvasRef.current;
      if (tgt && typeof tgt.releasePointerCapture === 'function') {
        try { tgt.releasePointerCapture(e.pointerId); } catch (err) {}
      }
    } catch (err) {}
    // if no pointers active, reset global mouse-like state
    if (activePointersRef.current.size === 0) {
      lastCellRef.current = null;
      mouseDownRef.current = false;
    }
  };

  const handlePointerCancel = (e) => {
    // treat cancel like an up to ensure notes are released
    try { handlePointerUp(e); } catch (err) {}
  };

  const handleLostPointerCapture = (e) => {
    // fallback for lost capture: ensure we release any note for this pointer
    try { handlePointerUp(e); } catch (err) {}
  };

  // Touch event fallbacks for platforms that don't fully support PointerEvents
  const handleTouchStart = (e) => {
    try { e.preventDefault(); } catch (err) {}
    if (!imageLoaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const id = t.identifier;
      // register pointer-like state
      activePointersRef.current.set(id, { lastCellKey: null, note: null });
      // add visual marker
      try { touchMarkersRef.current.set(id, { x: t.clientX - rect.left, y: t.clientY - rect.top }); } catch (e) {}
      const px = t.clientX - rect.left;
      const py = t.clientY - rect.top;

      for (let cell of dataRef.current) {
        if (px >= cell.x && px < cell.x + gridDensity && py >= cell.y && py < cell.y + gridDensity) {
          playCellForPointer(cell, id, t.clientX, t.clientY);
          break;
        }
      }
    }
    // redraw overlay to show markers
    try { drawGrid(); } catch (e) {}
  };

  const handleTouchMove = (e) => {
    try { e.preventDefault(); } catch (err) {}
    if (!imageLoaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const id = t.identifier;
      const px = t.clientX - rect.left;
      const py = t.clientY - rect.top;
      try { touchMarkersRef.current.set(id, { x: px, y: py }); } catch (e) {}

      for (let cell of dataRef.current) {
        if (px >= cell.x && px < cell.x + gridDensity && py >= cell.y && py < cell.y + gridDensity) {
          playCellForPointer(cell, id, t.clientX, t.clientY);
          break;
        }
      }
    }
    try { drawGrid(); } catch (e) {}
  };

  const handleTouchEnd = (e) => {
    try { e.preventDefault(); } catch (err) {}
    if (!imageLoaded) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const id = t.identifier;
      try {
        const state = activePointersRef.current.get(id);
        if (state && state.note && synthRef.current) {
          decNoteCount(state.note, false);
        }
      } catch (err) {}
      activePointersRef.current.delete(id);
      try { touchMarkersRef.current.delete(id); } catch (e) {}
    }

    if (activePointersRef.current.size === 0) {
      lastCellRef.current = null;
      mouseDownRef.current = false;
    }
    try { drawGrid(); } catch (e) {}
  };

  const handleTouchCancel = (e) => {
    try { handleTouchEnd(e); } catch (err) {}
  };

  // Attach non-passive native touch listeners to ensure preventDefault() works
  // and we receive move events on platforms where React's synthetic handlers
  // may be passive or otherwise interfered with by the browser.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const start = (ev) => handleTouchStart(ev);
    const move = (ev) => handleTouchMove(ev);
    const end = (ev) => handleTouchEnd(ev);
    const cancel = (ev) => handleTouchCancel(ev);

    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end, { passive: false });
    canvas.addEventListener('touchcancel', cancel, { passive: false });

    return () => {
      try {
        canvas.removeEventListener('touchstart', start);
        canvas.removeEventListener('touchmove', move);
        canvas.removeEventListener('touchend', end);
        canvas.removeEventListener('touchcancel', cancel);
      } catch (e) {}
    };
  }, [imageLoaded]);

  // Stronger fallback: document-level non-passive listeners so gestures
  // are captured even if some ancestor steals them. This is a last-resort
  // fallback and will only be attached when the component mounts.
  useEffect(() => {
    const dstart = (ev) => handleTouchStart(ev);
    const dmove = (ev) => handleTouchMove(ev);
    const dend = (ev) => handleTouchEnd(ev);
    const dcancel = (ev) => handleTouchCancel(ev);

    document.addEventListener('touchstart', dstart, { passive: false });
    document.addEventListener('touchmove', dmove, { passive: false });
    document.addEventListener('touchend', dend, { passive: false });
    document.addEventListener('touchcancel', dcancel, { passive: false });

    return () => {
      try {
        document.removeEventListener('touchstart', dstart);
        document.removeEventListener('touchmove', dmove);
        document.removeEventListener('touchend', dend);
        document.removeEventListener('touchcancel', dcancel);
      } catch (e) {}
    };
  }, []);

  // Clear pending release timers and any held notes on unmount to avoid
  // dangling timers or sounds after component is removed.
  useEffect(() => {
    return () => {
      try {
        for (const t of releaseTimersRef.current.values()) {
          try { clearTimeout(t); } catch (e) {}
        }
        releaseTimersRef.current.clear();

        for (const note of activeNotesRef.current.keys()) {
          try { safeTriggerRelease(synthRef.current, note); } catch (e) {}
        }
        activeNotesRef.current.clear();

        activePointersRef.current.clear();
        lastCellRef.current = null;
        mouseDownRef.current = false;
      } catch (e) {}
    };
  }, []);

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
                background : "transparent",
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
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerEvent}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handleLostPointerCapture}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          draggable={false}
          onContextMenu={(e) => { try { e.preventDefault(); } catch (err) {} }}
          style={{
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            WebkitUserDrag: 'none',
            overscrollBehavior: 'none'
          }}
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