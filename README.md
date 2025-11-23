# WebRTC Video Call App

A minimal but production-ready React + Node.js WebRTC video call application that enables two laptops on different networks to stream live video/audio to each other using peer-to-peer connections.

## 🎯 Features

- **P2P Video Streaming**: Video-only WebRTC (no audio transmission)
- **Speech-to-Text**: Optional ElevenLabs integration for real-time transcriptions
- **Cross-Network Support**: Works between different networks using ngrok tunneling
- **Real-time Signaling**: WebSocket-based signaling server for WebRTC negotiation
- **Modern UI**: Built with React, TypeScript, and Tailwind CSS
- **STUN Support**: Uses Google's free STUN servers for NAT traversal

## 🧩 Tech Stack

### Frontend
- React 18 + Vite
- TypeScript
- Tailwind CSS
- Native WebRTC APIs

### Backend
- Node.js + Express
- WebSocket (ws library)
- In-memory room management

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- ngrok (for cross-network calls)
- Two devices with cameras
- ElevenLabs API key (optional, for speech-to-text feature)

### Installation

1. **Clone and install dependencies:**

```bash
# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
```

2. **Setup ElevenLabs API Key (Optional, for Speech-to-Text):**

```bash
# Copy the example env file
cd client
cp .env.example .env

# Edit .env and add your ElevenLabs API key
# VITE_ELEVENLABS_API_KEY=your_api_key_here
```

### Running the Application

#### Step 1: Start the Signaling Server

```bash
cd server
npm run dev
```

The server will start on `http://localhost:8080` with:
- Health check: `http://localhost:8080/healthz`
- WebSocket endpoint: `ws://localhost:8080/ws`

#### Step 2: Expose Server with ngrok (for cross-network calls)

In a new terminal:

```bash
ngrok http 8080
```

Copy the **WSS URL** (e.g., `wss://abc123.ngrok.io/ws`) - you'll need this for the frontend.

> **Note**: For local testing on the same network, you can use `ws://localhost:8080/ws` directly.

#### Step 3: Start the Frontend

In a new terminal:

```bash
cd client
npm run dev
```

The frontend will start on `http://localhost:3000`

### Using the App

1. **On Both Laptops:**
   - Open `http://localhost:3000`
   - Enter the ngrok WSS URL (e.g., `wss://abc123.ngrok.io/ws`)
   - Enter a room ID (e.g., `room-123`)
   - Click "Join Room"
   - Allow camera permissions (video only, no audio)

2. **Video Call:**
   - Both users should see each other's video streams
   - The connection is peer-to-peer (video doesn't go through the server)
   - **Note**: Audio is NOT transmitted via WebRTC (video-only call)

3. **Speech-to-Text (Optional):**
   - Either laptop can enable Speech-to-Text
   - Toggle "Enable Speech-to-Text" checkbox
   - **API Key Setup:**
     - Option 1: Add to `.env` file (recommended)
       - Copy `client/.env.example` to `client/.env`
       - Add your API key: `VITE_ELEVENLABS_API_KEY=your_key_here`
     - Option 2: Enter manually in the UI (if not in .env)
   - Click "Start Transcription" button
   - Start speaking - transcriptions will appear on both laptops
   - Transcriptions are sent via WebSocket (not WebRTC)

## 📁 Project Structure

```
Gestr/
├── server/                 # Backend signaling server
│   ├── index.js           # Express + WebSocket server
│   └── package.json
├── client/                 # Frontend React app
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── RoomJoin.tsx
│   │   │   └── VideoCall.tsx
│   │   ├── hooks/         # Custom hooks
│   │   │   └── useWebRTC.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
└── README.md
```

## 🔧 Configuration

### Backend

- **Port**: Default `8080` (set via `PORT` environment variable)
- **WebSocket Path**: `/ws`
- **Health Check**: `/healthz`

### Frontend

- **Port**: Default `3000` (configured in `vite.config.ts`)
- **Signaling URL**: Entered by user in the UI

### WebRTC

- **STUN Servers**: Google's free STUN servers
  - `stun:stun.l.google.com:19302`
  - `stun:stun1.l.google.com:19302`
- **TURN**: Not included (can be added later for restrictive NATs)

## 🌐 Network Requirements

- **HTTPS/WSS**: Required for camera/microphone access in browsers
- **ngrok**: Provides HTTPS/WSS tunnel for cross-network calls
- **Firewall**: Ensure WebRTC ports are not blocked (typically UDP 1024-65535)

## 🐛 Troubleshooting

### Camera/Microphone Not Working
- Ensure you're using HTTPS/WSS (not HTTP/WS)
- Check browser permissions
- Try a different browser (Chrome/Firefox recommended)

### Connection Fails
- Verify ngrok is running and URL is correct
- Check that both users are using the same signaling URL and room ID
- Check browser console for errors
- Ensure firewall allows WebRTC traffic

### No Video/Audio
- Check that both peers have joined the same room
- Verify STUN servers are accessible
- For restrictive NATs, consider adding TURN servers

## 📝 Development

### Backend Scripts
- `npm run dev` - Start with nodemon (auto-reload)
- `npm start` - Start production server

### Frontend Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## 🔒 Security Notes

- This is a minimal implementation for demonstration
- In production, consider:
  - Authentication/authorization
  - Rate limiting
  - Input validation
  - TURN server for restrictive networks
  - HTTPS certificates

## 📄 License

MIT
