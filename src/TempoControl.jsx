import React from 'react';

export default function TempoControl({ bpm = 120, onChange }) {
  return (
    <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.9)', padding: 8, borderRadius: 6 }}>
      <label style={{ fontSize: 12, marginRight: 8 }}>BPM</label>
      <input
        type="number"
        value={bpm}
        onChange={(e) => onChange(Number(e.target.value) || 60)}
        style={{ width: 80 }}
      />
    </div>
  );
}
