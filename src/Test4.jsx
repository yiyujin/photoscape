import React, { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';

export default function RGBMusicalCanvas() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const overlayRef2 = useRef(null);
  const videoRef = useRef(null);

  const [isAudioReady, setIsAudioReady] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);

  const synthRef = useRef(null);
  const sandboxRef = useRef(null);
  const dataRef = useRef([]);
  const activeAnimationsRef = useRef([]);
  const handsRef = useRef([]);
  const handPoseRef = useRef(null);
  const animationStartedRef = useRef(false);

  const width = 960;
  const height = 640;
  const gridDensity = 20;

  const colorToNoteMap = {
    red: ['C', 'E', 'G', 'C'],
    green: ['E', 'G', 'B', 'E'],
    blue: ['G', 'B', 'D', 'G']
  };

  useEffect(() => {
    // Load ml5.js from CDN
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/ml5@1/dist/ml5.js';
    script.async = true;
    script.onload = () => {
      console.log('ml5.js loaded');
      initHandpose();
    };
    document.body.appendChild(script);

    synthRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.2, release: 1 }
    }).toDestination();
    synthRef.current.volume.value = -8;

    return () => {
      if (synthRef.current) synthRef.current.dispose();
      document.body.removeChild(script);
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const initHandpose = async () => {
    if (window.ml5) {
      handPoseRef.current = await window.ml5.handPose();
      setModelLoaded(true);
      console.log('Handpose model loaded');
    }
  };

  const loadImageFromPublic = () => {
    const img = new Image();
    img.onload = () => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(img, 0, 0, width, height);

      const data = [];
      for (let y = 0; y < height; y += gridDensity) {
        for (let x = 0; x < width; x += gridDensity) {
          const pixel = tempCtx.getImageData(x, y, 1, 1).data;
          data.push({ x, y, r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] });
        }
      }
      dataRef.current = data;
      setImageLoaded(true);
    };
    img.src = '/img.jpg';
  };

  const getDominantColor = (r, g, b) => {
    const threshold = 10;
    if (Math.abs(r - g) < threshold && Math.abs(g - b) < threshold && Math.abs(b - r) < threshold) return 'white';
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
    if (note && synthRef.current) synthRef.current.triggerAttackRelease(note, '8n');
  };

  const startAudio = async () => {
    await Tone.start();
    setIsAudioReady(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width, height, facingMode: 'user' },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise(resolve => {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            resolve();
          };
        });

        if (handPoseRef.current) {
          handPoseRef.current.detectStart(videoRef.current, results => {
            handsRef.current = results;
          });
        }
      }
    } catch (err) {
      console.error('Webcam error:', err);
    }

    if (!animationStartedRef.current) {
      animationStartedRef.current = true;
      startAnimation();
    }
  };

  const startAnimation = () => {
    const animate = () => {
      const particleCanvas = overlayRef2.current;
      if (!particleCanvas) return;
      const ctx = particleCanvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);

      // Draw particles
      for (let i = activeAnimationsRef.current.length - 1; i >= 0; i--) {
        const a = activeAnimationsRef.current[i];
        a.t += 0.01;
        const dy = -a.t * 100;

        ctx.save();
        ctx.translate(a.x, a.y + dy);

        const strongest = Math.max(a.r, a.g, a.b);
        let br = 0, bg = 0, bb = 0;
        const sf = 0.5;
        if (strongest === a.r) { br = 255; bg = a.g * sf; bb = a.b * sf; }
        else if (strongest === a.g) { bg = 255; br = a.r * sf; bb = a.b * sf; }
        else { bb = 255; br = a.r * sf; bg = a.g * sf; }

        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,0,0,${br/255})`;
        ctx.fillRect(Math.sin(a.rand + a.t * 600) * 10, 0, a.rs, a.rs);

        ctx.fillStyle = `rgba(0,255,0,${bg/255})`;
        ctx.fillRect(Math.sin(a.rand * 2 + a.t * 600) * 10, -a.rs*0.5, a.rs, a.rs);

        ctx.fillStyle = `rgba(0,0,255,${bb/255})`;
        ctx.fillRect(Math.sin(a.rand * 3 + a.t * 600) * 10, -a.rs, a.rs, a.rs);

        ctx.restore();

        a.rs -= a.rs * 0.1;
        if (a.rs < 0.01) activeAnimationsRef.current.splice(i,1);
      }

      // Check hand collision
      if (handsRef.current.length > 0 && dataRef.current.length > 0) {
        const hand = handsRef.current[0];
        let indexTip = hand.keypoints?.[8] || hand.landmarks?.[8];
        if (indexTip) {
          const videoEl = videoRef.current;
          const videoW = videoEl.videoWidth || width;
          const videoH = videoEl.videoHeight || height;

          const canvasX = width - (indexTip.x / videoW) * width;
          const canvasY = (indexTip.y / videoH) * height;

          // Draw index finger
          ctx.fillStyle = 'rgba(255 ,255, 255, 0.8)';
          ctx.beginPath();
          ctx.arc(canvasX, canvasY, 8, 0, Math.PI*2);
          ctx.fill();

          // Trigger animations and sound
          for (let cell of dataRef.current) {
            if (canvasX >= cell.x && canvasX < cell.x + gridDensity &&
                canvasY >= cell.y && canvasY < cell.y + gridDensity) {

              playNote(cell.r, cell.g, cell.b, cell.x + gridDensity/2, cell.y + gridDensity/2);

              const depthData = 1 + (cell.y/height)*1.5;
              activeAnimationsRef.current.push({
                x: cell.x + gridDensity/2,
                y: cell.y + gridDensity/2,
                r: cell.r, g: cell.g, b: cell.b,
                t: 0,
                rs: 8 * depthData,
                rand: Math.random()*100
              });

              if (activeAnimationsRef.current.length > 100) activeAnimationsRef.current.shift();
              break;
            }
          }
        }
      }

      requestAnimationFrame(animate);
    };

    animate();
  };

  useEffect(() => { loadImageFromPublic(); }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4" style = { { position : "relative"} }>
      <video ref={videoRef} width={160} height={120} autoPlay muted playsInline
        style={{ position:'fixed', bottom:'0', right:'0', border:'2px solid black', borderRadius:8, transform:'scaleX(-1)', zIndex:9999 }}
      />

      <div className="mb-4 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Photo Play</h1>
        {!isAudioReady && imageLoaded && modelLoaded && (
          <button
            onClick={startAudio}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
          >
            Start Audio & Webcam
          </button>
        )}
      </div>

      <div style={{ position:'relative' }}>
        <canvas ref={canvasRef} width={width} height={height} style={{ border:'2px solid gray', zIndex:1, backgroundImage : "url(./img.jpg)", backgroundPosition : "center", backgroundSize : "cover" }} />
        <canvas ref={overlayRef2} width={width} height={height} style={{ position:'absolute', top:0,left:0, zIndex:2, pointerEvents:'none' }} />
        <canvas ref={overlayRef} width={width} height={height} style={{ position:'absolute', top:0,left:0, zIndex:3, pointerEvents:'none' }} />
      </div>
    </div>
  );
}
