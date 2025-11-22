import { useEffect, useRef, useState } from 'react';

interface TranscriptionEntry {
  id: string;
  speaker: 'local' | 'remote';
  text: string;
  timestamp: Date;
}

interface UseTranscriptionOptions {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  enabled?: boolean;
}

// Extend Window interface for Web Speech API
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export function useTranscription({
  localStream,
  remoteStream,
  enabled = true,
}: UseTranscriptionOptions) {
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const localRecognitionRef = useRef<any>(null);
  const remoteRecognitionRef = useRef<any>(null);
  const localAudioContextRef = useRef<AudioContext | null>(null);
  const remoteAudioContextRef = useRef<AudioContext | null>(null);
  const localMediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const remoteMediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Check if Speech Recognition is available
  const isSpeechRecognitionAvailable = () => {
    return (
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition)
    );
  };

  // Create transcription entry
  const addTranscription = (speaker: 'local' | 'remote', text: string) => {
    if (!text.trim()) return;
    
    setTranscriptions((prev) => [
      ...prev,
      {
        id: `transcript-${Date.now()}-${Math.random()}`,
        speaker,
        text: text.trim(),
        timestamp: new Date(),
      },
    ]);
  };

  // Setup local transcription
  useEffect(() => {
    if (!enabled || !localStream || !isSpeechRecognitionAvailable()) {
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Only add final transcripts
      if (finalTranscript.trim()) {
        addTranscription('local', finalTranscript);
        finalTranscript = '';
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
      // Restart recognition if stream is still active
      if (localStream && localStream.active) {
        try {
          recognition.start();
        } catch (e) {
          console.error('Error restarting recognition:', e);
        }
      }
    };

    try {
      recognition.start();
      localRecognitionRef.current = recognition;
    } catch (e) {
      console.error('Error starting local recognition:', e);
    }

    return () => {
      if (localRecognitionRef.current) {
        try {
          localRecognitionRef.current.stop();
        } catch (e) {
          // Ignore errors on cleanup
        }
        localRecognitionRef.current = null;
      }
    };
  }, [localStream, enabled]);

  // Setup remote transcription
  // Note: Web Speech API works with microphone input, not MediaStreams directly
  // For remote audio, we create a hidden audio element and attempt transcription
  // In production, consider using cloud services (Google Cloud Speech-to-Text, AWS Transcribe)
  useEffect(() => {
    if (!enabled || !remoteStream || !isSpeechRecognitionAvailable()) {
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let finalTranscript = '';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript.trim()) {
          addTranscription('remote', finalTranscript);
          finalTranscript = '';
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Remote speech recognition error:', event.error);
      };

      recognition.onend = () => {
        // Restart recognition if stream is still active
        if (remoteStream && remoteStream.active) {
          try {
            recognition.start();
          } catch (e) {
            console.error('Error restarting remote recognition:', e);
          }
        }
      };

      // Create hidden audio element to play remote stream
      // This helps with audio routing, though Web Speech API may still use default mic
      const audioElement = document.createElement('audio');
      audioElement.srcObject = remoteStream;
      audioElement.autoplay = true;
      audioElement.style.display = 'none';
      document.body.appendChild(audioElement);

      try {
        recognition.start();
        remoteRecognitionRef.current = recognition;
      } catch (e) {
        console.warn('Remote recognition may have limitations. For production, use a cloud transcription service.');
      }

      // Cleanup function
      return () => {
        if (audioElement && audioElement.parentNode) {
          audioElement.parentNode.removeChild(audioElement);
        }
        
        if (remoteRecognitionRef.current) {
          try {
            remoteRecognitionRef.current.stop();
          } catch (e) {
            // Ignore errors on cleanup
          }
          remoteRecognitionRef.current = null;
        }
        
        if (remoteAudioContextRef.current) {
          remoteAudioContextRef.current.close();
          remoteAudioContextRef.current = null;
        }
        
        if (remoteMediaStreamSourceRef.current) {
          remoteMediaStreamSourceRef.current.disconnect();
          remoteMediaStreamSourceRef.current = null;
        }
      };
    } catch (e) {
      console.error('Error setting up remote transcription:', e);
    }
  }, [remoteStream, enabled]);

  const clearTranscriptions = () => {
    setTranscriptions([]);
  };

  return {
    transcriptions,
    clearTranscriptions,
    isAvailable: isSpeechRecognitionAvailable(),
  };
}

