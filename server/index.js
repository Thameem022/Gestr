import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const app = express();

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// In-memory rooms: roomId -> Set of WebSocket connections
const rooms = new Map();

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection attempt from:', req.socket.remoteAddress);
  let currentRoom = null;
  let userId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'join':
          // Leave previous room if any
          if (currentRoom) {
            leaveRoom(currentRoom, ws, userId);
          }
          
          currentRoom = data.roomId;
          userId = data.userId || `user-${Date.now()}`;
          
          // Join new room
          if (!rooms.has(currentRoom)) {
            rooms.set(currentRoom, new Set());
          }
          rooms.get(currentRoom).add(ws);
          
          // Send confirmation
          ws.send(JSON.stringify({
            type: 'joined',
            roomId: currentRoom,
            userId: userId
          }));
          
          // Notify other peers in room
          broadcastToRoom(currentRoom, ws, {
            type: 'peer-joined',
            userId: userId
          });
          
          console.log(`User ${userId} joined room ${currentRoom}`);
          break;
          
        case 'offer':
        case 'answer':
        case 'ice-candidate':
        case 'transcription':
          // Forward signaling messages to other peers in the room
          if (currentRoom) {
            broadcastToRoom(currentRoom, ws, {
              ...data,
              from: userId
            });
          }
          break;
          
        case 'leave':
          if (currentRoom) {
            leaveRoom(currentRoom, ws, userId);
            currentRoom = null;
          }
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      leaveRoom(currentRoom, ws, userId);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  // Log successful connection
  console.log('WebSocket connection established');
});

function leaveRoom(roomId, ws, userId) {
  const room = rooms.get(roomId);
  if (room) {
    room.delete(ws);
    
    // Notify other peers
    if (userId) {
      broadcastToRoom(roomId, ws, {
        type: 'peer-left',
        from: userId
      });
    }
    
    // Clean up empty rooms
    if (room.size === 0) {
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
    } else {
      console.log(`User left room ${roomId}, ${room.size} remaining`);
    }
  }
}

function broadcastToRoom(roomId, senderWs, message) {
  const room = rooms.get(roomId);
  if (room) {
    room.forEach((ws) => {
      if (ws !== senderWs && ws.readyState === 1) { // 1 = OPEN
        ws.send(JSON.stringify(message));
      }
    });
  }
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`Health check: http://localhost:${PORT}/healthz`);
});

