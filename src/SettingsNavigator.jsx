import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";

// SettingsNavigator
// - holds an array of settings (image, ambient, colorToMap)
// - displays current image and mapping
// - plays ambient audio via HTMLAudioElement
// - exposes optional onChange(setting, index) callback so other components (ripple, audio) can react

const data = [
  {
    img: "/img0.jpg",
    ambient: "/img0.mp3",
    instrument: 'piano',
    colorToMap: {
      red: { note: "Bb", octave: "3", brightness: 0.2 },
      green: { note: "D", octave: "4", brightness: 0.5 },
      blue: { note: "F", octave: "4", brightness: 0.8 },
    },
  },
  {
    img: "/img1.jpg",
    ambient: "/img1.mp3",
    colorToMap: {
      red: { note: "A", octave: "3", brightness: 0.1 },
      green: { note: "C", octave: "4", brightness: 0.6 },
      blue: { note: "F", octave: "4", brightness: 0.4 },
    },
  },
  {
    img: "/img2.jpg",
    ambient: "/img2.mp3",
    instrument: 'sine',
    colorToMap: {
      red: { note: "G", octave: "3", brightness: 0.3 },
      green: { note: "Bb", octave: "3", brightness: 0.45 },
      blue: { note: "D", octave: "4", brightness: 0.7 },
    },
  },
  {
    img: "/img3.jpg",
    ambient: "/img3.mp3",
    instrument: 'metal',
    colorToMap: {
      red: { note: "G", octave: "3", brightness: 0.6 },
      green: { note: "Bb", octave: "3", brightness: 0.25 },
      blue: { note: "Eb", octave: "4", brightness: 0.9 },
    },
  },
];

export const settingsData = data;

function SettingsNavigatorInternal( { onChange, ambientPlaying = false } = {}) {
  const [index, setIndex] = useState(0);
  const imgRef = useRef(null);
  const audioRef = useRef(null);
  const startedRef = useRef(false); // whether ambient playback was started by prop

  useEffect(() => {
    // no cleanup required here (parent manages audio)
    return () => {};
  }, []);

  useEffect(() => {
    const setting = data[index];

    // notify parent (optional)
    if (typeof onChange === "function") onChange(setting, index);

    // update image preview
    if (imgRef.current) imgRef.current.src = setting.img;

    // If we've already started ambient playback due to ambientPlaying, do not
    // stop or replace the currently-playing audio when navigating settings.
    if (startedRef.current) {
      return;
    }

    // stop previous audio if any (we only recreate when index changes)
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch (e) {}
      audioRef.current = null;
    }

    // create ambient audio (loop). Only create a new Audio when the selected index changes.
    if (setting.ambient) {
      const a = new Audio(setting.ambient);
      a.loop = true;
      a.volume = 0.5;
      // Do not auto-play here; playback should be triggered by explicit user gesture
      // or when `ambientPlaying` is observed below.
      audioRef.current = a;
    }

    return () => {
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch (e) {}
        audioRef.current = null;
      }
    };
  }, [index, onChange]);

  // listen for external next/prev commands (imperative control)
  useEffect(() => {
    const onNext = () => {
      // reset any started ambient so parent can re-trigger for the new setting
      try {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
      } catch (e) {}
      startedRef.current = false;
      setIndex((i) => (i + 1) % data.length);
      window.dispatchEvent(new CustomEvent('SettingsNavigator.nextPressed'));
    };
    const onPrev = () => setIndex((i) => (i - 1 + data.length) % data.length);
    window.addEventListener('SettingsNavigator.next', onNext);
    window.addEventListener('SettingsNavigator.prev', onPrev);
    return () => {
      window.removeEventListener('SettingsNavigator.next', onNext);
      window.removeEventListener('SettingsNavigator.prev', onPrev);
    };
  }, []);

  // Start ambient playback when `ambientPlaying` becomes true. Only start once
  // (on the first rising edge) and then consider ambient started so we don't
  // repeatedly restart on prop fluctuations.
  useEffect(() => {
    if (ambientPlaying && !startedRef.current) {
      const current = data[index];
      // If audio instance doesn't exist yet (edge case), create it from current setting
      if (!audioRef.current && current && current.ambient) {
        const a = new Audio(current.ambient);
        a.loop = true;
        a.volume = 0.5;
        audioRef.current = a;
      }

      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(() => {
          // play may be blocked by browser; still mark started so we don't retry repeatedly
        });
      }

      startedRef.current = true;
    }
  }, [ambientPlaying, index]);

  // Note: ambient playback is controlled by the Play/Pause button below.

  function handleNext() {
    // stop any currently-created ambient and allow new ambient to be created
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    } catch (e) {}
    startedRef.current = false;
    setIndex((i) => (i + 1) % data.length);
    window.dispatchEvent(new CustomEvent('SettingsNavigator.nextPressed'));
  }

  function handlePrev() {
    setIndex((i) => (i - 1 + data.length) % data.length);
  }

  function toggleAudio() {
    if (!audioRef.current) return;
    if (audioRef.current.paused) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }

  // Allow left/right arrow keys to navigate settings
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = data[index];

  return (
    <div>
      {/* <div style={{ display: "flex", gap: 24 }}>
        <div>
          <div style={{ width: 480, height: 320, background: "#000", border: "1px solid #444" }}>
              <img
                ref={imgRef}
                alt={`setting-${index}`}
                src={current.img}
                style={{ objectFit: "cover", width: "100%", height: "100%" }}
              />
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button onClick={handlePrev}>Prev</button>
            <button onClick={handleNext}>Next</button>
            <button onClick={toggleAudio}>Play/Pause Ambient</button>
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>Setting {index + 1} / {data.length}</strong>
          </div>
          <div style={{ marginBottom: 8 }}>Ambient: <code>{current.ambient}</code></div>

          <table style={{ borderCollapse: "collapse", minWidth: 240 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 6 }}>Color</th>
                <th style={{ textAlign: "left", padding: 6 }}>Note</th>
                <th style={{ textAlign: "left", padding: 6 }}>Octave</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(current.colorToMap).map(([color, map]) => (
                <tr key={color}>
                  <td style={{ padding: 6 }}>{color}</td>
                  <td style={{ padding: 6 }}>{map.note}</td>
                  <td style={{ padding: 6 }}>{map.octave}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div> */}
    </div>
  );
}

// Expose imperative next/prev via forwardRef so parent can control navigation
const SettingsNavigator = forwardRef((props, ref) => {
  const internalRef = useRef(null);

  // Keep a local instance of the component state via a child ref pattern
  // We'll render the internal component and capture its setIndex via imperative handle
  // To avoid duplicating logic, re-use the internal component by mounting it and
  // providing an imperative API that proxies to the internal setIndex through events.

  // Instead of complex proxying, we'll implement imperative methods that emit
  // Custom events on window which the internal component listens to. This keeps
  // the existing code largely unchanged while providing a control surface.

  useImperativeHandle(ref, () => ({
    next() {
      window.dispatchEvent(new CustomEvent('SettingsNavigator.next'));
    },
    prev() {
      window.dispatchEvent(new CustomEvent('SettingsNavigator.prev'));
    }
  }));

  return <SettingsNavigatorInternal {...props} ref={internalRef} />;
});

export default SettingsNavigator;
