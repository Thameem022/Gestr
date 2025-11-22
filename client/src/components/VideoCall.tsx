import { useEffect, useRef, useState } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import { useTranscription } from '../hooks/useTranscription';

interface VideoCallProps {
  roomId: string;
  signalingUrl: string;
  onLeave: () => void;
}

export default function VideoCall({ roomId, signalingUrl, onLeave }: VideoCallProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  
  const { localStream, remoteStream, error, disconnect } = useWebRTC({
    roomId,
    signalingUrl,
    onConnectionChange: (connected) => setIsConnected(connected),
    onRemoteConnectionChange: (connected) => setRemoteConnected(connected),
  });

  const { transcriptions, clearTranscriptions, isAvailable: isTranscriptionAvailable } = useTranscription({
    localStream,
    remoteStream,
    enabled: true,
  });

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
        <div className="bg-gray-800 rounded-lg p-4 mb-4 flex items-center justify-between">
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
            </div>
          </div>
          <button
            onClick={handleLeave}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Leave Room
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <strong>Error: </strong>{error}
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

        {/* Transcription Section */}
        <div className="mt-4 bg-gray-800 rounded-lg overflow-hidden shadow-2xl">
          <div className="bg-gray-700 px-4 py-2 flex items-center justify-between">
            <h3 className="text-white font-medium">Transcription</h3>
            {transcriptions.length > 0 && (
              <button
                onClick={clearTranscriptions}
                className="text-sm text-gray-300 hover:text-white transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="p-4 max-h-64 overflow-y-auto">
            {!isTranscriptionAvailable ? (
              <div className="text-gray-400 text-sm text-center py-4">
                Speech recognition is not available in this browser. Please use Chrome or Edge for transcription.
              </div>
            ) : transcriptions.length === 0 ? (
              <div className="text-gray-400 text-sm text-center py-4">
                Transcripts will appear here as you speak...
              </div>
            ) : (
              <div className="space-y-3">
                {transcriptions.map((transcript) => (
                  <div
                    key={transcript.id}
                    className={`p-3 rounded-lg ${
                      transcript.speaker === 'local'
                        ? 'bg-blue-900 bg-opacity-30 border-l-4 border-blue-500'
                        : 'bg-purple-900 bg-opacity-30 border-l-4 border-purple-500'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-gray-300">
                        {transcript.speaker === 'local' ? 'You' : 'Remote Peer'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {transcript.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-white text-sm">{transcript.text}</p>
                  </div>
                ))}
              </div>
            )}
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

