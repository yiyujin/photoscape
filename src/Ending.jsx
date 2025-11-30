
import React, { useEffect, useRef, useState } from 'react';
import ChordLooper from './ChordLooper';
import DrumLooper from './DrumLooper';
import TempoControl from './TempoControl';
import ButtonGrid from './ButtonGrid';
import * as Tone from 'tone';
import { settingsData } from './SettingsNavigator';

export default function Ending() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const gapRow = 20; // gap between rows
    const gapCol = 64; // gap between columns

    return(
        <div style = { { overflow: "hidden", position : "relative", background : "", width : width, height : height, display : "flex", justifyContent : "center", alignItems : "center" } }>
            {/* <TempoControl bpm={bpm} onChange={handleBpmChange} /> */}
            {/* <img src = "/ending.jpg" style={{zIndex : -1, position: 'absolute', width: width, height: height }}/> */}
                        
            <ButtonGrid rows = { 4}  cols = { 3 } gapRow={gapRow} gapCol={gapCol}>
                { Array.from({ length: 12 }).map((_, i) => (
                    <PlayButton key={i} index={i} onPlayed={(n) => {
                        const el = document.getElementById('last-note');
                        if (el) el.textContent = n;
                    }} />
                ))}
            </ButtonGrid>
            
            <ChordLooper />
            {/* <DrumLooper bpm={bpm} /> */}
    
        </div>
        
    )
}

function PlayButton({ index, onPlayed }) {
    const samplerRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [active, setActive] = useState(false);
    const activeTimeoutRef = useRef(null);

    useEffect(() => {
        // Create a sampler once per button (lightweight); alternatively reuse a shared sampler
        const entryIndex = Math.floor(index / 3);
        const entry = settingsData[entryIndex] || {};
        const instr = (entry.instrument || 'piano').toLowerCase();

        if (instr === 'piano') {
            samplerRef.current = new Tone.Sampler({
                urls: {
                    C4: 'C4.mp3',
                    'D#4': 'Ds4.mp3',
                    'F#4': 'Fs4.mp3',
                    A4: 'A4.mp3',
                },
                baseUrl: 'https://tonejs.github.io/audio/salamander/',
            }).toDestination();
            Tone.loaded().then(() => setReady(true));

        } else if (instr === 'pluck' || instr === 'guitar') {
            samplerRef.current = new Tone.PluckSynth().toDestination();
            setReady(true);

        } else if (instr === 'sine') {
            samplerRef.current = new Tone.Synth({ oscillator: { type: 'sine' } }).toDestination();
            setReady(true);

        } else if (instr === 'fm') {
            samplerRef.current = new Tone.FMSynth().toDestination();
            setReady(true);

        } else if (instr === 'am') {
            samplerRef.current = new Tone.AMSynth().toDestination();
            setReady(true);

        } else if (instr === 'mono') {
            samplerRef.current = new Tone.MonoSynth().toDestination();
            setReady(true);

        } else if (instr === 'duo') {
            samplerRef.current = new Tone.DuoSynth().toDestination();
            setReady(true);

        } else if (instr === 'poly') {
            samplerRef.current = new Tone.PolySynth(Tone.Synth).toDestination();
            setReady(true);

        } else if (instr === 'metal') {
            samplerRef.current = new Tone.MetalSynth().toDestination();
            setReady(true);

        } else if (instr === 'membrane') {
            samplerRef.current = new Tone.MembraneSynth().toDestination();
            setReady(true);

        } else if (instr === 'pingpong-drum') {
            // Create a ping-pong delay and connect a snare-like NoiseSynth to it
            try {
                const pingPong = new Tone.PingPongDelay('4n', 0.2).toDestination();
                const snare = new Tone.NoiseSynth({
                    noise: { type: 'white' },
                    envelope: { attack: 0.001, decay: 0.2, sustain: 0 }
                }).connect(pingPong);
                samplerRef.current = snare;
                // attach effect ref for cleanup
                samplerRef.current._effect = pingPong;
                setReady(true);
            } catch (e) {
                console.warn('Failed to create pingpong-drum', e);
                samplerRef.current = new Tone.NoiseSynth().toDestination();
                setReady(true);
            }

        } else if (instr === 'noise') {
            samplerRef.current = new Tone.NoiseSynth({ noise: { type: 'white' } }).toDestination();
            setReady(true);

        } else if (instr === 'drums-sampler') {
            // Use Tone.Players for named one-shot drum samples (keys can be arbitrary names)
            // Preflight the sample URLs to detect 404s or non-audio responses which
            // commonly cause "Unable to decode audio data" errors.
            const drumBase = '/drums/';
            const samples = {
                kick: 'kick.wav',
                snare: 'snare.wav',
                hihat: 'hihat.wav',
            };
            const urls = Object.fromEntries(Object.entries(samples).map(([k, f]) => [k, drumBase + f]));

            // Check each URL first
            Promise.all(Object.values(urls).map(async (u) => {
                try {
                    const res = await fetch(u, { method: 'HEAD' });
                    if (!res.ok) throw new Error(`${u} returned ${res.status}`);
                    const ct = res.headers.get('content-type') || '';
                    if (!ct.startsWith('audio')) console.warn(`Warning: ${u} served with content-type ${ct}`);
                    return u;
                } catch (err) {
                    // Try full GET as some static hosts don't support HEAD
                    const res2 = await fetch(u);
                    if (!res2.ok) throw new Error(`${u} returned ${res2.status}`);
                    const ct2 = res2.headers.get('content-type') || '';
                    if (!ct2.startsWith('audio')) console.warn(`Warning: ${u} served with content-type ${ct2}`);
                    return u;
                }
            })).then(() => {
                samplerRef.current = new Tone.Players(urls, () => {
                    setReady(true);
                }).toDestination();
            }).catch((err) => {
                console.error('Failed to preload drum samples:', err);
                // still create Players with the urls so attempts will surface errors in console
                try {
                    samplerRef.current = new Tone.Players(urls, () => { setReady(true); }).toDestination();
                } catch (e) {
                    console.error('Failed to create Tone.Players', e);
                }
            });

        } else if (instr === 'player') {
            samplerRef.current = new Tone.Player('/samples/one-shot.wav', () => {
                setReady(true);
            }).toDestination();

        } else {
            // fallback: generic synth
            samplerRef.current = new Tone.Synth().toDestination();
            setReady(true);
        }
        return () => {
            if (samplerRef.current) {
                try {
                    // dispose effect if present
                    if (samplerRef.current._effect && typeof samplerRef.current._effect.dispose === 'function') {
                        try { samplerRef.current._effect.dispose(); } catch (e) {}
                    }
                    samplerRef.current.dispose();
                } catch (e) {}
            }
        };
    }, []);

    const handleStart = async (e) => {
        try { if (e && e.preventDefault) e.preventDefault(); } catch (e) {}
        // visual feedback: set active (opacity 1.0) briefly
        setActive(true);
        if (activeTimeoutRef.current) clearTimeout(activeTimeoutRef.current);
        activeTimeoutRef.current = setTimeout(() => setActive(false), 700);
        // user gesture — ensure AudioContext started
        await Tone.start();
        // map index -> data entry and color
        const entryIndex = Math.floor(index / 3);
        const colorIdx = index % 3; // 0:red,1:green,2:blue
        const colors = ['red', 'green', 'blue'];
        const entry = settingsData[entryIndex];
        if (!entry) return;
        const colorKey = colors[colorIdx];
        const map = entry.colorToMap[colorKey];
        if (!map) return;

        // Determine instrument for this button (from the same entry)
        const instr = (entry.instrument || 'piano').toLowerCase();

        if (!samplerRef.current || !ready) return;

            try {
                if (instr === 'drums-sampler') {
                    // For Players, expect map.note or map.sample to contain the sample key (e.g. 'kick')
                    const sampleKey = (map.sample || map.note || '').toString();
                    const players = samplerRef.current;
                    if (players) {
                        if (typeof players.get === 'function') {
                            const player = players.get(sampleKey);
                            if (player && typeof player.start === 'function') player.start();
                            else console.warn('Drum sample not found on Players:', sampleKey);
                        } else if (typeof players.player === 'function') {
                            // fallback API
                            try { players.player(sampleKey).start(); } catch (e) { console.warn(e); }
                        } else {
                            console.warn('Players API not available for drums-sampler');
                        }
                    }
                    if (typeof onPlayed === 'function') onPlayed(sampleKey);
                    return;
                }

                if (instr === 'pingpong-drum') {
                    // play the snare-like noise synth connected to ping-pong delay
                    const snare = samplerRef.current;
                    if (snare && typeof snare.triggerAttackRelease === 'function') {
                        // snare uses a short noise pulse; duration '16n' or '32n' works
                        snare.triggerAttackRelease('16n');
                        if (typeof onPlayed === 'function') onPlayed('snare');
                        return;
                    } else {
                        console.warn('pingpong-drum instrument not ready');
                        return;
                    }
                }

            if (instr === 'player') {
                // single Player instance
                try { samplerRef.current.start(); } catch (e) { console.warn(e); }
                if (typeof onPlayed === 'function') onPlayed('player');
                return;
            }

            // melodic instruments: compute a note name
            const octave = parseInt(map.octave || '3', 10) || 3;
            const note = `${map.note}${octave}`;

            if (instr === 'pluck' || instr === 'guitar') {
                if (typeof samplerRef.current.pluck === 'function') samplerRef.current.pluck(note);
                else samplerRef.current.triggerAttackRelease(note, '1n');
                if (typeof onPlayed === 'function') onPlayed(note);
                return;
            }

            // default melodic play (Sampler, Synths)
            if (typeof samplerRef.current.triggerAttackRelease === 'function') {
                samplerRef.current.triggerAttackRelease(note, '1n');
            } else if (typeof samplerRef.current.triggerAttack === 'function') {
                samplerRef.current.triggerAttack(note);
                // schedule release shortly after for safety
                try { setTimeout(() => { try { samplerRef.current.triggerRelease(note); } catch (e) {} }, 600); } catch (e) {}
            } else if (typeof samplerRef.current.pluck === 'function') {
                samplerRef.current.pluck(note);
            } else {
                console.warn('Unknown instrument API for play', instr);
            }
            if (typeof onPlayed === 'function') onPlayed(note);
        } catch (err) {
            console.warn('play error', err);
        }
    };
    useEffect(() => {
        return () => {
            if (activeTimeoutRef.current) clearTimeout(activeTimeoutRef.current);
        };
    }, []);

    return (
        <button
            onPointerDown={handleStart}
            onTouchStart={handleStart}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handleStart(); } }}
            style={{
                padding: '12px 18px',
                background: 'transparent',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                width: '100px',
                height: '100px',
                opacity: active ? 1.0 : 0.5,
                transition: 'opacity 160ms ease',
                backgroundImage : `url(/buttons/${index}.png)`,
                touchAction: 'none',
                userSelect: 'none',
            }}
        >
        </button>
    );
}