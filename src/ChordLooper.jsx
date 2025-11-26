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
    if (!synthRef.current) {
      synthRef.current = new Tone.Sampler({
        urls: {
          C4: 'C4.mp3',
          'D#4': 'Ds4.mp3',
          'F#4': 'Fs4.mp3',
          A4: 'A4.mp3',
        },
        baseUrl: 'https://tonejs.github.io/audio/salamander/'
      }).toDestination();
    }

    const chord1 = ['Bb3', 'D4', 'F4'];
    const chord2 = ['A3', 'C4', 'F4'];
    const chord3 = ['Bb3', 'D3', 'F4'];
    const chord4 = ['G3', 'Bb3', 'Eb4'];

    const events = [
      ['0', chord1],
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

    // If Transport is already running we want the first chord to play immediately.
    // Instead of restarting the Transport (which could affect other audio),
    // trigger the first chord manually right away, and schedule the Part to
    // continue looping from the current transport position.
    if (Tone.Transport.state === 'started') {
      // schedule the part to start at the next measure boundary of the transport
      const nextMeasure = Tone.Transport.seconds + 0.01;
      part.start(nextMeasure);
      // trigger chord1 immediately so user hears the first measure now
      try { synthRef.current.triggerAttackRelease(chord1, '1m', Tone.now()); } catch (e) {}
    } else {
      // transport not running: start the Part at time 0 and start the transport
      part.start(0);
      try { Tone.Transport.start(); } catch (e) {}
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
    // Keep the Transport running (do not stop it here) to avoid interfering
    // with other scheduled audio; callers can stop Transport if needed.
  }

  async function toggle() {
    const shouldPlay = !playingRef.current;
    // flip native ref first so repeated clicks are reliable
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
        position : "absolute",
        bottom : 0,
        right : 0,
        width : "200px",
        height : "200px",
        background : "transparent",
        zIndex: 9999,
      }}
    >
      {/* {playing ? 'Stop Chords' : 'Play Chords'} */}
    </button>
  );
}
