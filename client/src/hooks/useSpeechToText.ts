import { useEffect, useRef, useState } from 'react';

interface UseSpeechToTextOptions {
  apiKey: string;
  enabled: boolean;
  onTranscription: (text: string) => void;
  modelId?: string; // Optional model_id, defaults to a common STT model
}

export function useSpeechToText({
  apiKey,
  enabled,
  onTranscription,
  modelId = 'eleven_turbo_v2_5', // Default model - adjust based on your ElevenLabs plan
}: UseSpeechToTextOptions) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);

  useEffect(() => {
    if (!enabled || !apiKey) {
      // Clean up if disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
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

        audioStreamRef.current = audioStream;

        // Create AudioContext to capture audio
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(audioStream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (!mounted || !enabled) return;
          
          const inputData = e.inputBuffer.getChannelData(0);
          audioChunksRef.current.push(new Float32Array(inputData));
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        // Send audio chunks to ElevenLabs API periodically
        const CHUNK_DURATION_MS = 3000; // Send every 3 seconds

        intervalRef.current = setInterval(async () => {
          if (!mounted || !enabled || audioChunksRef.current.length === 0) return;

          try {
            const chunks = [...audioChunksRef.current];
            audioChunksRef.current = []; // Clear chunks

            // Convert Float32Array chunks to WAV format
            const wavBlob = convertToWav(chunks, audioContext.sampleRate);

            // Send to ElevenLabs API
            const formData = new FormData();
            formData.append('audio', wavBlob, 'audio.wav');
            formData.append('model_id', modelId);

            const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
              method: 'POST',
              headers: {
                'xi-api-key': apiKey,
              },
              body: formData,
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            if (data.text && data.text.trim() && mounted) {
              onTranscription(data.text.trim());
            }
          } catch (err) {
            console.error('Speech-to-text error:', err);
            if (mounted) {
              setError(err instanceof Error ? err.message : 'Speech-to-text failed');
            }
          }
        }, CHUNK_DURATION_MS);

      } catch (err) {
        console.error('Error initializing speech-to-text:', err);
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
      
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }

      audioChunksRef.current = [];
    };
  }, [enabled, apiKey, onTranscription]);

  return { isProcessing, error };
}

// Helper function to convert Float32Array to WAV blob
function convertToWav(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  
  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);
  
  // Convert audio data
  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const sample = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return new Blob([buffer], { type: 'audio/wav' });
}

