import React, { useRef, useState, useEffect } from 'react';
import * as Tone from 'tone';

// DrumLooper: plays a repeating 4-step beat: hihat, hihat, snare, hihat
export default function DrumLooper({ bpm = 120 }) {
  const hiHatRef = useRef(null);
  const snareRef = useRef(null);
  const partRef = useRef(null);
  const playingRef = useRef(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    // Create lightweight per-looper instruments
    hiHatRef.current = new Tone.MetalSynth({
      frequency: 1200,
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
    }).toDestination();

    snareRef.current = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
    }).toDestination();

    // do not set Transport bpm here; parent TempoControl manages it

    return () => {
      try {
        if (partRef.current) {
          partRef.current.stop();
          partRef.current.dispose();
          partRef.current = null;
        }
      } catch (e) {}
      try { if (hiHatRef.current) hiHatRef.current.dispose(); } catch (e) {}
      try { if (snareRef.current) snareRef.current.dispose(); } catch (e) {}
    };
  }, []);

  // keep Transport bpm in sync when parent updates bpm prop
  useEffect(() => {
    try { Tone.Transport.bpm.rampTo(bpm, 0.5); } catch (e) { try { Tone.Transport.bpm.value = bpm; } catch (e) {} }
  }, [bpm]);

  const startLoop = async () => {
    if (playingRef.current) return;
    await Tone.start();

    // pattern positions within a 1-bar loop (Bar:Beat:Sixteenths):
    // place each hit exactly on the quarter-note beats so the measure is
    // [beat0, beat1, beat2, beat3] => hihat, hihat, snare, hihat
    const events = [
      ['0:0:0', 'hihat'],
      ['0:1:0', 'hihat'],
      ['0:2:0', 'snare'],
      ['0:3:0', 'hihat'],
    ];

    const part = new Tone.Part((time, sound) => {
      try {
        if (sound === 'hihat') {
          if (hiHatRef.current) hiHatRef.current.triggerAttackRelease('C6', '16n', time);
        } else if (sound === 'snare') {
          if (snareRef.current) snareRef.current.triggerAttackRelease('16n', time);
        }
      } catch (e) {
        console.warn('Drum play error', e);
      }
    }, events);

    part.loop = true;
    // set loop to one measure so the timing of '2n' falls correctly
    part.loopEnd = '1m';
    partRef.current = part;

    // start the part slightly in the future so scheduling is reliable
    const now = Tone.now();
    const when = now + 0.02;
    part.start(when);

    if (Tone.Transport.state !== 'started') {
      try {
        Tone.Transport.start(when);
      } catch (e) {
        try { Tone.Transport.start(); } catch (e) {}
      }
    }

    playingRef.current = true;
    setPlaying(true);
  };

  const stopLoop = () => {
    try {
      if (partRef.current) {
        partRef.current.stop();
        partRef.current.dispose();
        partRef.current = null;
      }
    } catch (e) {}
    playingRef.current = false;
    setPlaying(false);
  };

  const toggle = () => {
    if (!playingRef.current) startLoop();
    else stopLoop();
  };

  return (
    <div style={{ position: 'absolute', bottom: 0, right: 220, zIndex: 9999 }}>
      <button
        onClick={toggle}
        style={{
          width: '160px',
          height: '160px',
          background: playing ? '#e74c3c' : '#27ae60',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
        }}
      >
        {playing ? 'Stop Beat' : 'Play Beat'}
      </button>
      {/* BPM control is managed globally via TempoControl in Ending.jsx */}
    </div>
  );
}
