import { useEffect, useRef, useState } from 'react';

interface UseASLRecognitionOptions {
  videoStream: MediaStream | null;
  enabled: boolean;
  onLetterDetected: (letter: string, confidence: number) => void;
  apiUrl: string; // Server URL for ASL classification
}

export function useASLRecognition({
  videoStream,
  enabled,
  onLetterDetected,
  apiUrl,
}: UseASLRecognitionOptions) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLetter, setLastLetter] = useState<string | null>(null);
  const [lastConfidence, setLastConfidence] = useState<number>(0);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingRef = useRef(false);
  const onLetterDetectedRef = useRef(onLetterDetected);
  
  // Update ref when callback changes
  useEffect(() => {
    onLetterDetectedRef.current = onLetterDetected;
  }, [onLetterDetected]);

  useEffect(() => {
    if (!enabled || !videoStream) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsProcessing(false);
      return;
    }

    // Create hidden video element to capture frames
    const video = document.createElement('video');
    video.srcObject = videoStream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.display = 'none'; // Hide the video element
    videoRef.current = video;
    
    // Ensure video plays
    video.play().catch(err => {
      console.error('ASL: Error playing video:', err);
    });
    
    console.log('ASL: Video element created, stream tracks:', videoStream.getTracks().length);

    // Create canvas for frame capture
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    canvasRef.current = canvas;

    let mounted = true;

    const captureAndClassify = async () => {
      if (!mounted || !enabled || processingRef.current || !ctx) return;

      try {
        // Wait for video to be ready and playing
        if (video.readyState < 2 || video.paused) {
          if (video.paused) {
            await video.play().catch(() => {});
          }
          return;
        }

        processingRef.current = true;
        setIsProcessing(true);

        // Draw current video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert canvas to base64
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);

        console.log('ASL: Sending classification request to:', `${apiUrl}/api/asl/classify`);
        
        // Send to server for classification
        const response = await fetch(`${apiUrl}/api/asl/classify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image: imageBase64 }),
        });

        if (!response.ok) {
          throw new Error(`ASL classification failed: ${response.statusText}`);
        }

        const result = await response.json();
        
        console.log('ASL: Received result from server:', result);
        
        // Check mounted state before processing
        if (!mounted) {
          console.log('ASL: Component unmounted, skipping result');
          return;
        }
        
        if (result.letter && result.confidence) {
          setLastLetter(result.letter);
          setLastConfidence(result.confidence);
          
          console.log('ASL: Result valid, confidence:', result.confidence, 'threshold: 0.55');
          
          // Only call callback if confidence is above threshold (55%)
          if (result.confidence > 0.55) {
            console.log('ASL: Calling onLetterDetected callback with:', result.letter, result.confidence);
            // Check mounted again before callback and use ref to avoid stale closure
            if (mounted) {
              onLetterDetectedRef.current(result.letter, result.confidence);
            } else {
              console.log('ASL: Not mounted, skipping callback');
            }
          } else {
            console.log('ASL: Confidence too low, not calling callback');
          }
        } else {
          console.log('ASL: Invalid result:', { letter: result.letter, confidence: result.confidence });
        }
      } catch (err) {
        console.error('ASL recognition error:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'ASL recognition failed');
        }
      } finally {
        processingRef.current = false;
        setIsProcessing(false);
      }
    };

    // Start capturing frames periodically (every 1000ms for continuous recognition)
    // Reduced frequency to avoid overwhelming the worker during model loading
    intervalRef.current = setInterval(captureAndClassify, 1000);

    // Initial capture after video is ready
    video.addEventListener('loadedmetadata', () => {
      console.log('ASL: Video metadata loaded, readyState:', video.readyState);
      if (mounted) {
        // Wait a bit for video to actually start playing
        setTimeout(() => {
          if (mounted) {
            captureAndClassify();
          }
        }, 500);
      }
    });
    
    video.addEventListener('playing', () => {
      console.log('ASL: Video is playing');
    });
    
    video.addEventListener('error', (e) => {
      console.error('ASL: Video error:', e);
    });

    return () => {
      console.log('ASL: Cleanup function called, setting mounted = false');
      mounted = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      processingRef.current = false;
    };
  }, [enabled, videoStream, apiUrl]); // Removed onLetterDetected from dependencies to prevent re-runs

  return {
    isProcessing,
    error,
    lastLetter,
    lastConfidence,
  };
}

