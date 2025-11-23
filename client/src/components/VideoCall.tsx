import { useEffect, useRef, useState, useCallback } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useASLRecognition } from '../hooks/useASLRecognition';

interface Transcription {
  text: string;
  from: string;
  timestamp: number;
  type?: 'text' | 'asl';
  confidence?: number;
}

interface VideoCallProps {
  roomId: string;
  signalingUrl: string;
  onLeave: () => void;
}

export default function VideoCall({ roomId, signalingUrl, onLeave }: VideoCallProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const transcriptionsEndRef = useRef<HTMLDivElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [sttActive, setSttActive] = useState(false);
  // Load API key from .env file, fallback to empty string if not set
  const envApiKey = import.meta.env.VITE_ELEVENLABS_API_KEY || '';
  const apiKey = envApiKey; // Use API key from .env only
  const modelId = 'scribe_v1'; // Fixed model ID
  
  // ASL letter accumulation state
  const [accumulatedASLText, setAccumulatedASLText] = useState('');
  const [latestASLLetter, setLatestASLLetter] = useState<string | null>(null);
  const [latestASLConfidence, setLatestASLConfidence] = useState<number>(0);
  const lastLetterRef = useRef<string | null>(null);
  const letterStabilityRef = useRef<number>(0);
  
  const { localStream, remoteStream, error, disconnect, wsRef } = useWebRTC({
    roomId,
    signalingUrl,
    onConnectionChange: (connected) => setIsConnected(connected),
    onRemoteConnectionChange: (connected) => setRemoteConnected(connected),
    onTranscriptionReceived: (text, from) => {
      setTranscriptions(prev => [...prev, {
        text,
        from,
        timestamp: Date.now(),
        type: 'text',
      }]);
    },
    onASLLetterReceived: (letter, confidence, from, accumulatedText) => {
      // If accumulated text is provided (from send action), show the full accumulated text
      // Otherwise, if it's just a letter, show the letter
      const displayText = accumulatedText || letter;
      
      // Only add if there's actual text to display
      if (displayText && displayText.trim().length > 0) {
        setTranscriptions(prev => [...prev, {
          text: displayText,
          from,
          timestamp: Date.now(),
          type: 'asl',
          confidence: confidence || 1.0,
        }]);
      }
    },
  });

  // Handle transcription from STT
  const handleTranscription = (text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'transcription',
        text: text,
      }));
      
      // Also add to local transcriptions
      setTranscriptions(prev => [...prev, {
        text,
        from: 'You',
        timestamp: Date.now(),
      }]);
    }
  };

  const { isProcessing: sttProcessing, error: sttError } = useSpeechToText({
    apiKey,
    enabled: apiKey.length > 0, // Always enabled if API key exists
    isActive: sttActive,
    onTranscription: handleTranscription,
    modelId: modelId,
  });

  // Get server URL from signaling URL (convert ws:// to http:// or wss:// to https://)
  const serverUrl = signalingUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
  
  // Handle ASL letter detection with accumulation logic
  // Use useCallback to prevent the function from changing on every render
  const handleASLLetter = useCallback((letter: string, confidence: number) => {
    // Only accept letters with confidence above threshold (similar to public/app.js)
    const CONFIDENCE_THRESHOLD = 0.55; // 55% confidence threshold
    const STABILITY_COUNT = 2; // Letter must appear 2 times to be accepted
    
    if (confidence < CONFIDENCE_THRESHOLD) {
      return; // Ignore low confidence predictions
    }
    
    // Update latest letter display (always show current prediction)
    setLatestASLLetter(letter);
    setLatestASLConfidence(confidence);
    
    // Use functional updates to get current state
    setAccumulatedASLText(currentText => {
      // Check if same letter appears multiple times (stability check)
      if (letter === lastLetterRef.current) {
        letterStabilityRef.current += 1;
      } else {
        letterStabilityRef.current = 1;
        lastLetterRef.current = letter;
      }
      
      // Only add to accumulated text if letter is stable and it's a new letter
      if (letterStabilityRef.current >= STABILITY_COUNT) {
        // Only add if it's different from the last letter in accumulated text
        if (currentText.length === 0 || currentText[currentText.length - 1] !== letter) {
          const newText = currentText + letter;
          
          // Reset stability counter after adding to prevent immediate re-addition
          letterStabilityRef.current = 0;
          
          // Don't send automatically - only accumulate. User will click Send button.
          // Just update the accumulated text state
          
          return newText;
        }
      }
      
      return currentText; // Return unchanged if no update
    });
  }, [wsRef]);
  
  // Send accumulated ASL text to laptop 2 (with Gemini spelling correction)
  const sendASLText = async () => {
    if (!accumulatedASLText || accumulatedASLText.length === 0) {
      return;
    }
    
    console.log('Gemini: Correcting spelling for:', accumulatedASLText);
    
    try {
      // First, send to Gemini for spelling correction
      const response = await fetch(`${serverUrl}/api/gemini/correct-spelling`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: accumulatedASLText }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          // Rate limit error
          const retryAfter = errorData.retryAfter || 15;
          throw new Error(`Gemini API rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`);
        }
        throw new Error(errorData.message || errorData.error || 'Gemini spelling correction failed');
      }

      const result = await response.json();
      const correctedText = result.correctedText || accumulatedASLText;
      
      console.log('Gemini: Original:', accumulatedASLText, 'Corrected:', correctedText);
      
      // Send corrected text to laptop 2 via WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const message = {
          type: 'asl-letter',
          letter: '', // Empty for send action
          confidence: 0,
          accumulatedText: correctedText,
          originalText: accumulatedASLText, // Include original for reference
          action: 'send', // Indicate this is a send action
        };
        console.log('Gemini: Sending ASL text to laptop 2:', message);
        wsRef.current.send(JSON.stringify(message));
        
        // Add to local transcriptions (show corrected text)
        setTranscriptions(prev => [...prev, {
          text: correctedText,
          from: 'You',
          timestamp: Date.now(),
          type: 'asl',
          confidence: 1.0,
        }]);
        
        // Clear after sending
        clearASLText();
      }
    } catch (error) {
      console.error('Gemini: Error correcting spelling:', error);
      // If Gemini fails, send original text anyway
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const fallbackMessage = {
          type: 'asl-letter',
          letter: '',
          confidence: 0,
          accumulatedText: accumulatedASLText,
          action: 'send',
        };
        console.log('Gemini: Sending original text (fallback) to laptop 2:', fallbackMessage);
        wsRef.current.send(JSON.stringify(fallbackMessage));
        
        setTranscriptions(prev => [...prev, {
          text: accumulatedASLText,
          from: 'You',
          timestamp: Date.now(),
          type: 'asl',
          confidence: 1.0,
        }]);
        
        clearASLText();
      }
    }
  };
  
  // Clear accumulated ASL text
  const clearASLText = () => {
    setAccumulatedASLText('');
    setLatestASLLetter(null);
    setLatestASLConfidence(0);
    lastLetterRef.current = null;
    letterStabilityRef.current = 0;
  };

  // ASL recognition runs continuously when local stream is available
  const { isProcessing: aslProcessing, error: aslError, lastLetter, lastConfidence } = useASLRecognition({
    videoStream: localStream,
    enabled: !!localStream, // Enabled when video stream is available
    onLetterDetected: handleASLLetter,
    apiUrl: serverUrl,
  });

  // Auto-scroll transcriptions to bottom
  useEffect(() => {
    transcriptionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptions]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const handleLeave = () => {
    disconnect();
    onLeave();
  };

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-white text-xl font-semibold">Room: {roomId}</h2>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm text-gray-300">
                    Signaling: {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${remoteConnected ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                  <span className="text-sm text-gray-300">
                    Peer: {remoteConnected ? 'Connected' : 'Waiting...'}
                  </span>
                </div>
                {apiKey && (
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${sttActive ? (sttProcessing ? 'bg-green-500 animate-pulse' : 'bg-green-500') : 'bg-gray-500'}`}></div>
                    <span className="text-sm text-gray-300">
                      STT: {sttActive ? (sttProcessing ? 'Listening...' : 'Active') : 'Stopped'}
                    </span>
                  </div>
                )}
                {localStream && (
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${aslProcessing ? 'bg-blue-500 animate-pulse' : 'bg-blue-400'}`}></div>
                    <span className="text-sm text-gray-300">
                      ASL: {aslProcessing ? 'Processing...' : lastLetter ? `${lastLetter} (${(lastConfidence * 100).toFixed(0)}%)` : 'Ready'}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleLeave}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Leave Room
            </button>
          </div>

          {/* Speech-to-Text Controls */}
          {(envApiKey || apiKey) && (
            <div className="flex items-center gap-3 pt-3 border-t border-gray-700">
              <div className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${sttActive ? (sttProcessing ? 'bg-green-500 animate-pulse' : 'bg-green-500') : 'bg-gray-500'}`}></div>
                  <span className="text-sm text-gray-300">
                    Speech-to-Text: {sttActive ? (sttProcessing ? 'Listening...' : 'Active') : 'Stopped'}
                  </span>
                </div>
                {sttError && (
                  <span className="text-xs text-red-400 ml-2">{sttError}</span>
                )}
              </div>
              <button
                onClick={() => {
                  if (sttActive) {
                    setSttActive(false);
                  } else {
                    if (apiKey.length > 0) {
                      setSttActive(true);
                    }
                  }
                }}
                disabled={!apiKey || apiKey.length === 0}
                className={`px-4 py-1.5 rounded text-sm font-semibold transition-colors ${
                  sttActive
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : apiKey && apiKey.length > 0
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }`}
              >
                {sttActive ? '⏹ Stop' : '▶ Start'} Transcription
              </button>
            </div>
          )}
        </div>

        {/* Error Display */}
        {(error || aslError) && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 whitespace-pre-line">
            <strong>Error: </strong>
            <div className="mt-1">{error || aslError}</div>
            {error && (
              <div className="mt-2 text-sm">
                <strong>Debugging steps:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Check browser console (F12) for detailed errors</li>
                  <li>Verify server is running: <code className="bg-red-200 px-1 rounded">cd server && npm run dev</code></li>
                  <li>If using ngrok, verify it's running: <code className="bg-red-200 px-1 rounded">ngrok http 8080</code></li>
                  <li>Check the signaling URL format: should be <code className="bg-red-200 px-1 rounded">ws://localhost:8080/ws</code> or <code className="bg-red-200 px-1 rounded">wss://your-url.ngrok.io/ws</code></li>
                </ul>
              </div>
            )}
            {aslError && (
              <div className="mt-2 text-sm">
                <strong>ASL Recognition Error:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Ensure Python 3 is installed</li>
                  <li>Install dependencies: <code className="bg-red-200 px-1 rounded">pip install -r requirements.txt</code></li>
                  <li>Verify classifier_worker.py is in the server directory</li>
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Video Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Local Video */}
          <div className="bg-gray-800 rounded-lg overflow-hidden shadow-2xl">
            <div className="bg-gray-700 px-4 py-2">
              <h3 className="text-white font-medium">You</h3>
            </div>
            <div className="aspect-video bg-black relative">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!localStream && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <div className="text-4xl mb-2">📹</div>
                    <div>Requesting camera...</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Remote Video */}
          <div className="bg-gray-800 rounded-lg overflow-hidden shadow-2xl">
            <div className="bg-gray-700 px-4 py-2">
              <h3 className="text-white font-medium">Remote Peer</h3>
            </div>
            <div className="aspect-video bg-black relative">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              {!remoteStream && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <div className="text-4xl mb-2">👤</div>
                    <div>Waiting for peer to join...</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ASL Status Panel (Laptop 1 only) */}
        {localStream && (
          <div className="mt-4 bg-gray-800 rounded-lg overflow-hidden shadow-xl">
            <div className="bg-gray-700 px-4 py-2 flex items-center justify-between">
              <h3 className="text-white font-medium">ASL Recognition Status</h3>
              <div className="flex items-center gap-2">
                {accumulatedASLText && (
                  <>
                    <button
                      onClick={sendASLText}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
                    >
                      Send
                    </button>
                    <button
                      onClick={clearASLText}
                      className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm font-semibold rounded transition-colors"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="p-4 grid grid-cols-3 gap-4">
              <div className="bg-gray-700 rounded-lg p-3">
                <div className="text-xs text-gray-400 uppercase mb-1">Latest Letter</div>
                <div className="text-4xl font-bold text-blue-400 text-center">
                  {latestASLLetter || '--'}
                </div>
              </div>
              <div className="bg-gray-700 rounded-lg p-3">
                <div className="text-xs text-gray-400 uppercase mb-1">Confidence</div>
                <div className="text-2xl font-semibold text-blue-300 text-center">
                  {latestASLConfidence > 0 ? `${(latestASLConfidence * 100).toFixed(0)}%` : '--'}
                </div>
              </div>
              <div className="bg-gray-700 rounded-lg p-3 col-span-1">
                <div className="text-xs text-gray-400 uppercase mb-1">Accumulated Text</div>
                <div className="text-lg font-mono text-blue-200 break-words min-h-[2rem]">
                  {accumulatedASLText || 'Nothing yet'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Transcriptions Display */}
        <div className="mt-4 bg-gray-800 rounded-lg overflow-hidden shadow-xl">
          <div className="bg-gray-700 px-4 py-2 flex items-center justify-between">
            <h3 className="text-white font-medium">Transcriptions</h3>
            {transcriptions.length > 0 && (
              <button
                onClick={() => {
                  setTranscriptions([]);
                  clearASLText();
                }}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="h-48 overflow-y-auto p-4 space-y-3">
            {transcriptions.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <div className="text-2xl mb-2">💬</div>
                <p className="text-sm">No transcriptions yet</p>
                <p className="text-xs mt-1">Enable Speech-to-Text to start transcribing</p>
              </div>
            ) : (
              transcriptions.map((transcription, index) => {
                const isFromMe = transcription.from === 'You';
                const time = new Date(transcription.timestamp).toLocaleTimeString();
                const isASL = transcription.type === 'asl';
                
                return (
                  <div
                    key={index}
                    className={`flex flex-col ${isFromMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      isASL
                        ? isFromMe 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-blue-700 text-gray-100'
                        : isFromMe 
                          ? 'bg-purple-600 text-white' 
                          : 'bg-gray-700 text-gray-100'
                    }`}>
                      <div className="text-xs font-semibold mb-1 opacity-80 flex items-center gap-2">
                        <span>
                          {isFromMe ? 'You' : transcription.from} • {time}
                        </span>
                        {isASL && (
                          <span className="px-1.5 py-0.5 bg-black bg-opacity-30 rounded text-xs">
                            ASL
                          </span>
                        )}
                        {isASL && transcription.confidence && (
                          <span className="text-xs opacity-70">
                            {(transcription.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className={`text-sm ${isASL ? 'text-2xl font-bold' : ''}`}>
                        {transcription.text}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={transcriptionsEndRef} />
          </div>
        </div>

        {/* Instructions */}
        {!remoteConnected && (
          <div className="mt-4 bg-blue-900 bg-opacity-50 rounded-lg p-4 text-blue-100">
            <p className="text-sm">
              <strong>Waiting for another peer to join...</strong> Share the room ID "{roomId}" 
              and signaling URL with another person to start the call.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

