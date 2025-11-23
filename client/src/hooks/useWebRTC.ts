import { useEffect, useRef, useState } from 'react';

interface UseWebRTCOptions {
  roomId: string;
  signalingUrl: string;
  onConnectionChange?: (connected: boolean) => void;
  onRemoteConnectionChange?: (connected: boolean) => void;
  onTranscriptionReceived?: (text: string, from: string) => void;
  onASLLetterReceived?: (letter: string, confidence: number, from: string, accumulatedText?: string) => void;
}

export function useWebRTC({
  roomId,
  signalingUrl,
  onConnectionChange,
  onRemoteConnectionChange,
  onTranscriptionReceived,
  onASLLetterReceived,
}: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // STUN servers (Google's free STUN)
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  const disconnect = () => {
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setError(null);
    onConnectionChange?.(false);
    onRemoteConnectionChange?.(false);
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Get user media - VIDEO ONLY (no audio for WebRTC)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);

        // Create WebSocket connection
        console.log('Attempting to connect to:', signalingUrl);
        const ws = new WebSocket(signalingUrl);
        wsRef.current = ws;

        // Set connection timeout
        const connectionTimeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            console.error('WebSocket connection timeout');
            setError(`Connection timeout. Check if server is running at ${signalingUrl}`);
            ws.close();
            onConnectionChange?.(false);
          }
        }, 10000); // 10 second timeout

        ws.onopen = () => {
          console.log('WebSocket connected successfully');
          clearTimeout(connectionTimeout);
          onConnectionChange?.(true);
          setError(null);
          
          // Join room
          ws.send(JSON.stringify({
            type: 'join',
            roomId,
            userId: `user-${Date.now()}`,
          }));
        };

        ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          clearTimeout(connectionTimeout);
          const errorMsg = signalingUrl.startsWith('wss://') 
            ? `Failed to connect to signaling server. Check:\n1. Is ngrok running?\n2. Is the URL correct? (${signalingUrl})\n3. Does the URL end with /ws?`
            : `Failed to connect to signaling server. Check:\n1. Is the server running on port 8080?\n2. Is the URL correct? (${signalingUrl})\n3. Does the URL end with /ws?`;
          setError(errorMsg);
          onConnectionChange?.(false);
        };

        ws.onclose = (event) => {
          console.log('WebSocket closed', event.code, event.reason);
          clearTimeout(connectionTimeout);
          onConnectionChange?.(false);
          
          // Only show error if it wasn't a clean close and no error was already set
          if (event.code !== 1000 && event.code !== 1001 && event.code !== 1006) {
            // Don't override existing error messages
            setError(prev => prev || `Connection closed unexpectedly (code: ${event.code}). ${event.reason || 'Check if server is running.'}`);
          }
        };

        // Create peer connection
        const pc = new RTCPeerConnection(iceServers);
        pcRef.current = pc;

        // Add only video tracks to peer connection (skip audio)
        stream.getTracks().forEach(track => {
          if (track.kind === 'video') {
            pc.addTrack(track, stream);
          }
        });

        // Handle remote stream
        pc.ontrack = (event) => {
          console.log('Received remote track');
          if (mounted) {
            setRemoteStream(event.streams[0]);
            onRemoteConnectionChange?.(true);
          }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'ice-candidate',
              candidate: event.candidate,
            }));
          }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
          console.log('Connection state:', pc.connectionState);
          if (pc.connectionState === 'connected') {
            onRemoteConnectionChange?.(true);
          } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            onRemoteConnectionChange?.(false);
          }
        };

        // Handle signaling messages
        ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case 'joined':
                console.log('Joined room:', data.roomId);
                // If we're the first in the room, create offer
                // Otherwise, wait for offer from the other peer
                break;

              case 'peer-joined':
                console.log('Peer joined, creating offer');
                // Create offer when peer joins
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                ws.send(JSON.stringify({
                  type: 'offer',
                  offer: offer,
                }));
                break;

              case 'offer':
                console.log('Received offer');
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                ws.send(JSON.stringify({
                  type: 'answer',
                  answer: answer,
                }));
                break;

              case 'answer':
                console.log('Received answer');
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                break;

              case 'ice-candidate':
                console.log('Received ICE candidate');
                if (data.candidate) {
                  await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
                break;

              case 'peer-left':
                console.log('Peer left');
                setRemoteStream(null);
                onRemoteConnectionChange?.(false);
                break;

              case 'transcription':
                console.log('Received transcription:', data.text);
                if (onTranscriptionReceived) {
                  onTranscriptionReceived(data.text, data.from || 'Unknown');
                }
                break;

              case 'asl-letter':
                // Handle ASL letter messages (both individual letters and send actions)
                console.log('Received ASL letter message:', data);
                if (onASLLetterReceived) {
                  // If action is 'send', prioritize accumulatedText; otherwise use letter
                  const textToDisplay = data.action === 'send' && data.accumulatedText 
                    ? data.accumulatedText 
                    : (data.accumulatedText || data.letter);
                  
                  if (textToDisplay && textToDisplay.trim().length > 0) {
                    console.log('Calling onASLLetterReceived with:', textToDisplay);
                    onASLLetterReceived(
                      data.letter || '',
                      data.confidence || 0,
                      data.from || 'Unknown',
                      data.accumulatedText || data.letter // Pass accumulated text if available
                    );
                  } else {
                    console.log('Skipping ASL message - no text to display');
                  }
                }
                break;

              case 'error':
                setError(data.message || 'Unknown error');
                break;
            }
          } catch (err) {
            console.error('Error handling message:', err);
            setError('Failed to process signaling message');
          }
        };
      } catch (err) {
        console.error('Error initializing WebRTC:', err);
        setError(err instanceof Error ? err.message : 'Failed to access camera/microphone');
        onConnectionChange?.(false);
      }
    };

    init();

    return () => {
      mounted = false;
      disconnect();
    };
  }, [roomId, signalingUrl]);

  return {
    localStream,
    remoteStream,
    error,
    disconnect,
    wsRef, // Expose WebSocket for sending messages
  };
}

