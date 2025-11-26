import { useEffect, useRef } from 'react';

export default function MirrorVideo() {
  const videoRef = useRef(null);

  useEffect(() => {
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      } catch (err) {
        console.error('Camera access error:', err);
      }
    }
    initCamera();
  }, []);

  return (
    <video
      ref={videoRef}
      width={640}
      height={480}
      autoPlay
      muted
      playsInline
      style={{
        transform: 'scaleX(-1)',
        border: '2px solid #555',
        borderRadius: '8px',
      }}
    />
  );
}
