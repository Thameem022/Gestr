import { useEffect, useRef, useState } from 'react';

interface UseSpeechToTextOptions {
  apiKey: string;
  enabled: boolean;
  isActive: boolean; // Whether transcription is actively running
  onTranscription: (text: string) => void;
  modelId?: string; // Optional model_id, defaults to a common STT model
}

export function useSpeechToText({
  apiKey,
  enabled,
  isActive,
  onTranscription,
  modelId = 'scribe_v1', // Default model - adjust based on your ElevenLabs plan
}: UseSpeechToTextOptions) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!enabled || !apiKey || !isActive) {
      // Clean up if disabled or not active
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
      audioChunksRef.current = [];
      setIsProcessing(false);
      return;
    }

    let mounted = true;

    const init = async () => {
      try {
        console.log('STT: Initializing speech-to-text...');
        setIsProcessing(true);
        setError(null);

        // Get separate audio stream for STT (not WebRTC)
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (!mounted) {
          audioStream.getTracks().forEach(track => track.stop());
          return;
        }

        console.log('STT: Audio stream obtained');
        audioStreamRef.current = audioStream;

        // Use MediaRecorder for more reliable audio capture
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
          ? 'audio/webm' 
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm'; // fallback

        const mediaRecorder = new MediaRecorder(audioStream, {
          mimeType: mimeType,
        });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0 && mounted && enabled && isActive) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onerror = (event) => {
          console.error('STT: MediaRecorder error:', event);
          if (mounted) {
            setError('MediaRecorder error occurred');
          }
        };

        // Start recording
        mediaRecorder.start(1000); // Collect data every 1 second
        console.log('STT: MediaRecorder started');

        // Send audio chunks to ElevenLabs API periodically
        const CHUNK_DURATION_MS = 3000; // Send every 3 seconds

        intervalRef.current = setInterval(async () => {
          if (!mounted || !enabled || !isActive || audioChunksRef.current.length === 0) {
            return;
          }

          try {
            const chunks = [...audioChunksRef.current];
            audioChunksRef.current = []; // Clear chunks

            if (chunks.length === 0) {
              return;
            }

            // Combine chunks into a single blob
            const audioBlob = new Blob(chunks, { type: mimeType });
            console.log('STT: Sending audio to ElevenLabs, size:', audioBlob.size, 'bytes');

            // Send to ElevenLabs API
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');
            formData.append('model_id', modelId);
            formData.append('language_code', 'eng'); // Restrict to English only

            const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
              method: 'POST',
              headers: {
                'xi-api-key': apiKey,
              },
              body: formData,
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error('STT: ElevenLabs API error:', response.status, errorText);
              throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            console.log('STT: Received transcription:', data);
            
            if (data.text && data.text.trim() && mounted) {
              console.log('STT: Calling onTranscription with:', data.text.trim());
              onTranscription(data.text.trim());
            } else {
              console.log('STT: No text in response or empty');
            }
          } catch (err) {
            console.error('STT: Speech-to-text error:', err);
            if (mounted) {
              setError(err instanceof Error ? err.message : 'Speech-to-text failed');
            }
          }
        }, CHUNK_DURATION_MS);

        setIsProcessing(false);
        console.log('STT: Initialization complete');

      } catch (err) {
        console.error('STT: Error initializing speech-to-text:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize speech-to-text');
          setIsProcessing(false);
        }
      }
    };

    init();

    return () => {
      mounted = false;
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }

      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }

      audioChunksRef.current = [];
    };
  }, [enabled, apiKey, isActive, onTranscription, modelId]);

  return { isProcessing, error };
}

