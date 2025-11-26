
import React, { useEffect, useRef, useState } from 'react';
import ChordLooper from './ChordLooper';
import ButtonGrid from './ButtonGrid';
import * as Tone from 'tone';
import { settingsData } from './SettingsNavigator';

export default function Ending() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    const gapRow = 20; // gap between rows
    const gapCol = 64; // gap between columns

    return(
        <div style = { {  height: "100%", overflow: "hidden", position : "relative", background : "", width : width, height : height, display : "flex", justifyContent : "center", alignItems : "center" } }>
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
        return () => {
            if (samplerRef.current) {
                try { samplerRef.current.dispose(); } catch (e) {}
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

        // Use the octave directly from the settings data (ignore brightness)
        const octave = parseInt(map.octave || '3', 10) || 3;
        const note = `${map.note}${octave}`;
        if (samplerRef.current && ready) {
            try {
                // play note — sampler supports polyphony, and each button has its own sampler
                samplerRef.current.triggerAttackRelease(note, '1n');
                if (typeof onPlayed === 'function') onPlayed(note);
            } catch (err) {
                console.warn('play error', err);
            }
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