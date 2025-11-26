import React, { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';

export default function Test(){
  const canvasRef = useRef(null);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  
  const synthRef = useRef(null);

  const dataRef = useRef([]);
  const activeAnimationsRef = useRef([]);
  
  const mouseIsPressed = useRef(false);
  const animationFrameRef = useRef(null);

  // Musical scale mapping: C D E F G A B -> red orange yellow green blue navy purple
  // We'll use C major scale notes for different colors
  const colorToNoteMap = {
    red: ['C', 'E', 'G', 'C'], // C major chord notes
    green: ['E', 'G', 'B', 'E'], // E minor chord notes  
    blue: ['G', 'B', 'D', 'G'], // G major chord notes
  };

  useEffect(() => {
    // Initialize Tone.js synth
    synthRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.02,
        decay: 0.3,
        sustain: 0.2,
        release: 1,
      },
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

  const startAudio = async () => {
    await Tone.start();
    setIsAudioReady(true);
  };

  const getDominantColor = (r, g, b) => {
    const threshold = 10;
    const diffRG = Math.abs(r - g);
    const diffGB = Math.abs(g - b);
    const diffBR = Math.abs(b - r);

    if (diffRG < threshold && diffGB < threshold && diffBR < threshold) {
      return 'white';
    }

    const strongestColor = Math.max(r, g, b);
    if (strongestColor === r) return 'red';
    if (strongestColor === g) return 'green';
    return 'blue';
  };

  const playNote = (r, g, b, x, y, width, height) => {
    const dominantColor = getDominantColor(r, g, b);
    
    if (dominantColor === 'white' || !colorToNoteMap[dominantColor]) return;

    // Map Y position to octave (higher = lower pitch, lower = higher pitch)
    const octave = Math.floor(4 + (1 - y / height) * 2); // octaves 4-6
    
    // Map X position to note within the color's chord
    const noteIndex = Math.floor((x / width) * colorToNoteMap[dominantColor].length);
    const note = colorToNoteMap[dominantColor][noteIndex];
    
    // Play the note
    const fullNote = `${note}${octave}`;
    synthRef.current.triggerAttackRelease(fullNote, '8n');
  };

  const getNoteForCell = (r, g, b, x, y, width, height) => {
    const dominantColor = getDominantColor(r, g, b);
    
    if (dominantColor === 'white' || !colorToNoteMap[dominantColor]) return null;

    const octave = Math.floor(4 + (1 - y / height) * 2);
    const noteIndex = Math.floor((x / width) * colorToNoteMap[dominantColor].length);
    const note = colorToNoteMap[dominantColor][noteIndex];
    
    return `${note}${octave}`;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = 960;
    const height = 640;
    const gridDensity = 20;

    // Create sample image data (gradient for demo)
    const imageData = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        // Create a colorful gradient pattern
        imageData.data[i] = (x / width) * 255; // R
        imageData.data[i + 1] = (y / height) * 255; // G
        imageData.data[i + 2] = ((x + y) / (width + height)) * 255; // B
        imageData.data[i + 3] = 255; // A
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Sample colors into grid
    dataRef.current = [];
    for (let y = 0; y < height; y += gridDensity) {
      for (let x = 0; x < width; x += gridDensity) {
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        dataRef.current.push({
          x,
          y,
          r: pixel[0],
          g: pixel[1],
          b: pixel[2],
          a: pixel[3],
        });
      }
    }

    console.log('Data cells:', dataRef.current.length);
    console.log('Show grid:', showGrid);

    const draw = () => {
      // Redraw base image
      ctx.putImageData(imageData, 0, 0);

      // Draw and update animations
      const animations = activeAnimationsRef.current;
      for (let i = animations.length - 1; i >= 0; i--) {
        const a = animations[i];
        a.t += 0.01;
        const dy = -a.t * 100;

        ctx.save();
        ctx.translate(a.x + gridDensity / 2, a.y + gridDensity / 2 + dy);

        const strongestColor = Math.max(a.r, a.g, a.b);
        let brightnessR, brightnessG, brightnessB;
        const sf = 0.5;

        if (strongestColor === a.r) {
          brightnessR = 255;
          brightnessG = a.g * sf;
          brightnessB = a.b * sf;
        } else if (strongestColor === a.g) {
          brightnessG = 255;
          brightnessR = a.r * sf;
          brightnessB = a.b * sf;
        } else {
          brightnessB = 255;
          brightnessR = a.r * sf;
          brightnessG = a.g * sf;
        }

        ctx.globalCompositeOperation = 'lighter';
        
        ctx.fillStyle = `rgba(255, 0, 0, ${brightnessR / 255})`;
        ctx.fillRect(Math.sin((a.rand + a.t * 600) * Math.PI / 180) * 10, 0, a.rs, a.rs);
        
        ctx.fillStyle = `rgba(0, 255, 0, ${brightnessG / 255})`;
        ctx.fillRect(Math.sin((a.rand * 2 + a.t * 600) * Math.PI / 180) * 10, -a.rs * 0.5, a.rs, a.rs);
        
        ctx.fillStyle = `rgba(0, 0, 255, ${brightnessB / 255})`;
        ctx.fillRect(Math.sin((a.rand * 3 + a.t * 600) * Math.PI / 180) * 10, -a.rs, a.rs, a.rs);

        ctx.restore();

        a.rs -= a.rs * 0.1;

        if (a.rs < 0.01) {
          animations.splice(i, 1);
        }
      }

      // Draw grid info LAST so it's on top
      if (showGrid) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 10px monospace';
        
        dataRef.current.forEach(cell => {
          // Draw grid cell outline
          ctx.strokeRect(cell.x, cell.y, gridDensity, gridDensity);
          
          const note = getNoteForCell(cell.r, cell.g, cell.b, cell.x, cell.y, width, height);
          const dominantColor = getDominantColor(cell.r, cell.g, cell.b);
          
          if (note) {
            // Draw note label with background
            const textWidth = ctx.measureText(note).width;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.fillRect(cell.x + 1, cell.y + 1, textWidth + 4, 12);
            
            // Color code the text
            if (dominantColor === 'red') ctx.fillStyle = '#ffaaaa';
            else if (dominantColor === 'green') ctx.fillStyle = '#aaffaa';
            else if (dominantColor === 'blue') ctx.fillStyle = '#aaaaff';
            else ctx.fillStyle = 'white';
            
            ctx.fillText(note, cell.x + 3, cell.y + 10);
          }
        });
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [showGrid]);

  const handleMouseDown = (e) => {
    if (!isAudioReady) return;
    mouseIsPressed.current = true;
    handleMouseMove(e);
  };

  const handleMouseUp = () => {
    mouseIsPressed.current = false;
  };

  const handleMouseMove = (e) => {
    if (!mouseIsPressed.current || !isAudioReady) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const gridDensity = 20;

    for (let i = 0; i < dataRef.current.length; i++) {
      const cell = dataRef.current[i];
      const depthData = 1 + (cell.y / 640) * 1.5;

      if (
        mouseX >= cell.x &&
        mouseX < cell.x + gridDensity &&
        mouseY >= cell.y &&
        mouseY < cell.y + gridDensity
      ) {
        // Play note
        playNote(cell.r, cell.g, cell.b, cell.x, cell.y, 960, 640);

        // Add animation
        activeAnimationsRef.current.push({
          x: cell.x,
          y: cell.y,
          r: cell.r,
          g: cell.g,
          b: cell.b,
          t: 0,
          rs: 8 * depthData,
          rand: Math.random() * 100,
        });
        break;
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white mb-2">RGB Musical Canvas</h1>
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
                onClick={() => {
                  console.log('Toggling grid to:', !showGrid);
                  setShowGrid(!showGrid);
                }}
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
      <canvas
        ref={canvasRef}
        width={960}
        height={640}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseUp}
        className="border-2 border-gray-700 cursor-crosshair"
        style={{ cursor: isAudioReady ? 'crosshair' : 'not-allowed' }}
      />
    </div>
  );
};