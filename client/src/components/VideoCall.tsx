import { useEffect, useRef, useState } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import { useSpeechToText } from '../hooks/useSpeechToText';

interface Transcription {
  text: string;
  from: string;
  timestamp: number;
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
  const [sttEnabled, setSttEnabled] = useState(false);
  const [sttActive, setSttActive] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('scribe_v1');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  
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
      }]);
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
    enabled: sttEnabled && apiKey.length > 0,
    isActive: sttActive,
    onTranscription: handleTranscription,
    modelId: modelId,
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
                {sttEnabled && (
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${sttActive ? (sttProcessing ? 'bg-green-500 animate-pulse' : 'bg-green-500') : 'bg-gray-500'}`}></div>
                    <span className="text-sm text-gray-300">
                      STT: {sttActive ? (sttProcessing ? 'Listening...' : 'Active') : 'Stopped'}
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
          <div className="flex items-center gap-3 pt-3 border-t border-gray-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sttEnabled}
                onChange={(e) => {
                  setSttEnabled(e.target.checked);
                  if (e.target.checked) {
                    setShowApiKeyInput(true);
                  } else {
                    setShowApiKeyInput(false);
                    setApiKey('');
                    setSttActive(false); // Stop transcription when disabled
                  }
                }}
                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
              />
              <span className="text-sm text-gray-300">Enable Speech-to-Text</span>
            </label>

            {showApiKeyInput && (
              <div className="flex items-center gap-2 flex-1 max-w-3xl">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter ElevenLabs API Key"
                  className="flex-1 px-3 py-1.5 bg-gray-700 text-white rounded text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder="Model ID"
                  className="w-40 px-3 py-1.5 bg-gray-700 text-white rounded text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
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
                {sttError && (
                  <span className="text-xs text-red-400 whitespace-nowrap">{sttError}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 whitespace-pre-line">
            <strong>Error: </strong>
            <div className="mt-1">{error}</div>
            <div className="mt-2 text-sm">
              <strong>Debugging steps:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Check browser console (F12) for detailed errors</li>
                <li>Verify server is running: <code className="bg-red-200 px-1 rounded">cd server && npm run dev</code></li>
                <li>If using ngrok, verify it's running: <code className="bg-red-200 px-1 rounded">ngrok http 8080</code></li>
                <li>Check the signaling URL format: should be <code className="bg-red-200 px-1 rounded">ws://localhost:8080/ws</code> or <code className="bg-red-200 px-1 rounded">wss://your-url.ngrok.io/ws</code></li>
              </ul>
            </div>
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

        {/* Transcriptions Display */}
        <div className="mt-4 bg-gray-800 rounded-lg overflow-hidden shadow-xl">
          <div className="bg-gray-700 px-4 py-2 flex items-center justify-between">
            <h3 className="text-white font-medium">Transcriptions</h3>
            {transcriptions.length > 0 && (
              <button
                onClick={() => setTranscriptions([])}
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
                
                return (
                  <div
                    key={index}
                    className={`flex flex-col ${isFromMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      isFromMe 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-gray-700 text-gray-100'
                    }`}>
                      <div className="text-xs font-semibold mb-1 opacity-80">
                        {isFromMe ? 'You' : transcription.from} • {time}
                      </div>
                      <div className="text-sm">{transcription.text}</div>
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

