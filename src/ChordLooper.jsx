import React, { useRef, useState, useEffect } from 'react';
import * as Tone from 'tone';

// Independent chord looper button (placed in Ending). Acts as a switch: each
// press flips playback state immediately (uses a ref to avoid async races).
export default function ChordLooper() {
  const synthRef = useRef(null);
  const partRef = useRef(null);
  const playingRef = useRef(false);
  const [playing, setPlaying] = useState(false);

  async function startLoop() {
    await Tone.start();

    // Load sampler once
    if (!synthRef.current) {
      const sampler = new Tone.Sampler({
        urls: {
          C4: 'C4.mp3',
          'D#4': 'Ds4.mp3',
          'F#4': 'Fs4.mp3',
          A4: 'A4.mp3',
        },
        baseUrl: 'https://tonejs.github.io/audio/salamander/'
      }).toDestination();

      await sampler.loaded;  // important
      synthRef.current = sampler;
    }

    const chord1 = ['Bb3', 'D4', 'F4'];
    const chord2 = ['A3', 'C4', 'F4'];
    const chord3 = ['Bb3', 'D3', 'F4'];
    const chord4 = ['G3', 'Bb3', 'Eb4'];

    // FIX: schedule first chord slightly after measure start
    const events = [
      ['0:0:1', chord1], // <-- prevents Tone from dropping the first event
      ['1m', chord2],
      ['2m', chord3],
      ['3m', chord4],
    ];

    const part = new Tone.Part((time, chord) => {
      try {
        synthRef.current.triggerAttackRelease(chord, '1m', time);
      } catch (e) {
        console.warn('Chord play error', e);
      }
    }, events);

    part.loop = true;
    part.loopEnd = '4m';
    partRef.current = part;

    // Start from top always
    if (Tone.Transport.state === 'started') {
      part.start(Tone.now(), 0);
    } else {
      part.start(0);
      Tone.Transport.start();
    }
  }

  function stopLoop() {
    try {
      if (partRef.current) {
        partRef.current.stop();
        partRef.current.dispose();
        partRef.current = null;
      }
    } catch (e) {}
  }

  async function toggle() {
    const shouldPlay = !playingRef.current;

    playingRef.current = shouldPlay;
    setPlaying(shouldPlay);

    if (shouldPlay) {
      await startLoop();
    } else {
      stopLoop();
    }
  }

  // cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (partRef.current) {
          partRef.current.stop();
          partRef.current.dispose();
          partRef.current = null;
        }
      } catch (e) {}
      try {
        if (synthRef.current) {
          synthRef.current.dispose();
          synthRef.current = null;
        }
      } catch (e) {}
    };
  }, []);

  return (
    <button
      onClick={toggle}
      style={{
        position: "absolute",
        bottom: 0,
        right: 0,
        width: "200px",
        height: "200px",
        zIndex: 9999,
      }}
    >
      {playing ? 'Stop Chords' : 'Play Chords'}
    </button>
  );
}
