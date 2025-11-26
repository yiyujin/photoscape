import React, { useEffect, useRef, useState } from 'react';

// WebCamThumbnail
// - displays a live webcam video preview
// - fixed width: 100px, height auto to preserve aspect ratio
// - handles permissions and cleanup

export default function WebCamThumbnail() {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let mounted = true;
        async function start() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                streamRef.current = stream;
                if (!mounted) return;
                const v = videoRef.current;
                if (v) {
                    v.srcObject = stream;
                    v.play().catch(() => {});
                }
            } catch (err) {
                console.warn('WebCamThumbnail: getUserMedia error', err);
                setError(err.message || String(err));
            }
        }
        start();

        return () => {
            mounted = false;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
            const v = videoRef.current;
            if (v) {
                try { v.srcObject = null; } catch (e) {}
            }
        };
    }, []);

    return (
        <div style = { {position : "fixed", zIndex : 999, width : "100vw", height : "100vh", display : "flex", alignItems : "center", justifyContent : "flex-end", top : 0, left : 0, pointerEvents : "none" } }>
            { error ? (
                <div>
                    Camera error
                </div>
            ) : (
                <video
                    ref = { videoRef }
                    muted
                    playsInline
                    style={{ width: '200px', height: 'auto', display: 'block', objectFit: 'cover', paddingRight : '200px'}}
                />
            )}
        </div>
    );
}