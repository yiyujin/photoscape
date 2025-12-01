import React, { useEffect, useRef, useState } from 'react';
import ChordLooper from './ChordLooper';
import ButtonGrid from './ButtonGrid';
import * as Tone from 'tone';
import { settingsData } from './SettingsNavigator';

export default function Ending() {
    // Ensure audio context is unlocked on first user gesture while on Ending
    const [audioUnlocked, setAudioUnlocked] = useState(false);
    useEffect(() => {
        const unlock = async (e) => {
            try { if (e && e.preventDefault) e.preventDefault(); } catch (e) {}
            try {
                await Tone.start();
                // notify any PlayButtons to prime themselves
                try { document.dispatchEvent(new CustomEvent('AudioUnlocked')); } catch (e) {}
                setAudioUnlocked(true);
            } catch (err) {}
        };

        document.addEventListener('pointerdown', unlock, { once: true, capture: true });
        document.addEventListener('touchstart', unlock, { once: true, passive: false, capture: true });

        return () => {
            try { document.removeEventListener('pointerdown', unlock, { capture: true }); } catch (e) {}
            try { document.removeEventListener('touchstart', unlock, { capture: true }); } catch (e) {}
        };
    }, []);

    const gapRow = 20; // 20
    const gapCol = 20; // 64 
    const bgRef = useRef(null);
    const [bgPlaying, setBgPlaying] = useState(false);

    return(
        <div style={{
            justifyContent : "center",
            width : "960px",
            height : "640px",
            // background : "red",
            overflow: "hidden",
            position : "relative",
            display : "flex",
            alignItems : "center"
        }}>
            <ButtonGrid rows={4} cols={3} gapRow={gapRow} gapCol={gapCol}>
                {/* Manual loader for touch devices: if automatic unlock didn't happen, allow user to tap here to enable audio */}
                {!audioUnlocked && (
                    <div style={{ position: 'absolute', right: 8, top: 8, zIndex: 999 }}>
                        <button onClick={async (e) => {
                            try { if (e && e.preventDefault) e.preventDefault(); } catch (err) {}
                            try { await Tone.start(); } catch (err) {}
                            try { document.dispatchEvent(new CustomEvent('AudioUnlocked')); } catch (e) {}
                            setAudioUnlocked(true);
                        }} style={{ 
                            fontSize: 14, cursor: 'pointer',
                            width : "960px",
                            height : "640px",
                            // background : "red",
                            background : "transparent"
                        }}>
                            {/* Manually Load Audio */}
                        </button>
                    </div>
                )}
                { Array.from({ length: 9 }).map((_, i) => (
                    <PlayButton
                        key={i}
                        index={i}
                        onPlayed={(n) => {
                            const el = document.getElementById('last-note');
                            if (el) el.textContent = n;
                        }}
                    />
                ))}
            </ButtonGrid>
            
            {/* MP3 BUTTON */}
            <div style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 1000 }}>
                <button
                    onPointerDown={async (e) => {
                        try { if (e && e.preventDefault) e.preventDefault(); } catch (err) {}
                        try {
                            if (!bgRef.current) {
                                bgRef.current = new Audio('/bg.mp3');
                                bgRef.current.loop = false;
                                bgRef.current.preload = 'auto';
                                bgRef.current.addEventListener('ended', () => setBgPlaying(false));
                            }
                            // restart if already played
                            bgRef.current.currentTime = 0;
                            await bgRef.current.play();
                            setBgPlaying(true);
                        } catch (err) {
                            console.warn('bg play failed', err);
                        }
                    }}
                    style={{
                        width : "200px",
                        height : "200px",
                        background : "transparent"
                     }}
                    disabled={bgPlaying}
                >
                    {/* {bgPlaying ? 'Playing…' : 'Play bg.mp3'} */}
                </button>
            </div>
        </div>
    );
}

function PlayButton({ index, onPlayed }) {
    const samplerRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [active, setActive] = useState(false);
    const activeTimeoutRef = useRef(null);

    // PRIMING FUNCTION (Solution C)
    const prime = () => {
        const inst = samplerRef.current;
        if (!inst) return;
        try {
            if (inst.triggerAttackRelease) {
                inst.triggerAttackRelease("C0", 0.001, Tone.now());
            } else if (inst.start) {
                inst.start();
                inst.stop("+0.01");
            }
        } catch (e) {}
    };

    useEffect(() => {
        const entryIndex = Math.floor(index / 3);
        const entry = settingsData[entryIndex] || {};
        const instr = (entry.instrument || 'piano').toLowerCase();

        if (instr === 'sine') {
            samplerRef.current = new Tone.Synth({
                oscillator: { type: 'sine' }
            }).toDestination();
            setReady(true);
            prime();        // PRIME IMMEDIATELY (Solution C)

        } else {
            samplerRef.current = new Tone.Sampler({
                urls: {
                    C4: 'C4.mp3',
                    'D#4': 'Ds4.mp3',
                    'F#4': 'Fs4.mp3',
                    A4: 'A4.mp3',
                },
                baseUrl: 'https://tonejs.github.io/audio/salamander/',
            }).toDestination();

            Tone.loaded().then(() => {
                setReady(true);
                prime();    // PRIME AFTER LOADING (Solution C)
            });
        }

        return () => {
            if (samplerRef.current) {
                try {
                    if (samplerRef.current._effect && typeof samplerRef.current._effect.dispose === 'function') {
                        try { samplerRef.current._effect.dispose(); } catch (e) {}
                    }
                    samplerRef.current.dispose();
                } catch (e) {}
            }
            try { document.removeEventListener('AudioUnlocked', prime); } catch (e) {}
        };
    }, []);

    useEffect(() => {
        // Listen for explicit unlock event and attempt to prime when it happens
        const onUnlock = () => {
            try { prime(); } catch (e) {}
        };
        document.addEventListener('AudioUnlocked', onUnlock);
        return () => document.removeEventListener('AudioUnlocked', onUnlock);
    }, []);

    const handleStart = async (e) => {
        try { if (e && e.preventDefault) e.preventDefault(); } catch (e) {}

        setActive(true);
        if (activeTimeoutRef.current) clearTimeout(activeTimeoutRef.current);
        activeTimeoutRef.current = setTimeout(() => setActive(false), 700);

        await Tone.start();

        const entryIndex = Math.floor(index / 3);
        const colorIdx = index % 3;
        const colors = ['red', 'green', 'blue'];
        const entry = settingsData[entryIndex];
        if (!entry) return;

        const colorKey = colors[colorIdx];
        const map = entry.colorToMap[colorKey];
        if (!map) return;

        if (!samplerRef.current || !ready) return;

        const octave = parseInt(map.octave || '3', 10) || 3;
        const note = `${map.note}${octave}`;

        try {
            const instr = (entry.instrument || 'piano').toLowerCase();

            if (instr === 'sine') {
                samplerRef.current.triggerAttackRelease(note, '1n');
                if (onPlayed) onPlayed(note);
                return;
            }

            // piano sampler
            if (samplerRef.current.triggerAttackRelease) {
                samplerRef.current.triggerAttackRelease(note, '1n');
            } else if (samplerRef.current.triggerAttack) {
                samplerRef.current.triggerAttack(note);
                setTimeout(() => {
                    try { samplerRef.current.triggerRelease(note); } catch (e) {}
                }, 600);
            }

            if (onPlayed) onPlayed(note);

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
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStart(e); }}
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
        />
    );
}
