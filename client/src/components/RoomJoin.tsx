import { useState } from 'react';

interface RoomJoinProps {
  onJoin: (roomId: string, signalingUrl: string) => void;
}

export default function RoomJoin({ onJoin }: RoomJoinProps) {
  const [roomId, setRoomId] = useState('');
  const [signalingUrl, setSignalingUrl] = useState('ws://localhost:8080/ws');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim() && signalingUrl.trim()) {
      onJoin(roomId.trim(), signalingUrl.trim());
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">
          WebRTC Video Call
        </h1>
        <p className="text-gray-600 mb-6 text-center">
          Enter a room ID to join or create a new room
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="signalingUrl" className="block text-sm font-medium text-gray-700 mb-1">
              Signaling Server URL
            </label>
            <input
              id="signalingUrl"
              type="text"
              value={signalingUrl}
              onChange={(e) => setSignalingUrl(e.target.value)}
              placeholder="ws://localhost:8080/ws or wss://your-ngrok-url.ngrok.io/ws"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Use ngrok URL (wss://) for cross-network calls
            </p>
          </div>
          
          <div>
            <label htmlFor="roomId" className="block text-sm font-medium text-gray-700 mb-1">
              Room ID
            </label>
            <input
              id="roomId"
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room ID"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              required
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 shadow-lg hover:shadow-xl"
          >
            Join Room
          </button>
        </form>
        
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800 font-medium mb-1">Quick Start:</p>
          <ol className="text-xs text-blue-700 list-decimal list-inside space-y-1">
            <li>Start the server: <code className="bg-blue-100 px-1 rounded">cd server && npm run dev</code></li>
            <li>Expose with ngrok: <code className="bg-blue-100 px-1 rounded">ngrok http 8080</code></li>
            <li>Use the ngrok wss:// URL above</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

