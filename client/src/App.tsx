import { useState } from 'react';
import RoomJoin from './components/RoomJoin';
import VideoCall from './components/VideoCall';

function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [signalingUrl, setSignalingUrl] = useState<string>('');

  const handleJoin = (room: string, url: string) => {
    setRoomId(room);
    setSignalingUrl(url);
  };

  const handleLeave = () => {
    setRoomId(null);
    setSignalingUrl('');
  };

  return (
    <div className="min-h-screen">
      {!roomId ? (
        <RoomJoin onJoin={handleJoin} />
      ) : (
        <VideoCall roomId={roomId} signalingUrl={signalingUrl} onLeave={handleLeave} />
      )}
    </div>
  );
}

export default App;

