import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Device } from 'mediasoup-client';
import io from 'socket.io-client';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Bot, NutOff as BotOff, FileText, Download, Users, Settings, Share2, Copy, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassCard from './ui/GlassCard';
import Button from './ui/Button';

const VITE_AI_API_URL = import.meta.env.VITE_AI_API_URL;
const VITE_API_URL = import.meta.env.VITE_API_URL;
const VITE_MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL;
const VITE_WORKSPACE_API_URL = import.meta.env.VITE_WORKSPACE_API_URL;
const VITE_APP_URL = import.meta.env.VITE_APP_URL;
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL;

interface MediasoupMeetingProps {
  roomName: string;
  displayName: string;
  onLeave: () => void;
}

interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  timestamp: Date;
}

interface Note {
  id: string;
  content: string;
  timestamp: Date;
  type: 'auto' | 'manual';
}

interface Peer {
  id: string;
  displayName: string;
  videoElement?: HTMLVideoElement;
  audioElement?: HTMLAudioElement;
  hasVideo: boolean;
  hasAudio: boolean;
}

const MediasoupMeeting: React.FC<MediasoupMeetingProps> = ({ roomName, displayName, onLeave }) => {
  const socketRef = useRef<any>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAIEnabled, setIsAIEnabled] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const [showTranscript, setShowTranscript] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [meetingSummary, setMeetingSummary] = useState<string | null>(null);
  const [producers, setProducers] = useState<Map<string, any>>(new Map());
  const [consumers, setConsumers] = useState<Map<string, any>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<string>('Connecting...');
  const [copied, setCopied] = useState(false);

  // Calculate grid layout based on participant count
  const getGridLayout = useCallback((participantCount: number) => {
    if (participantCount === 1) {
      return { cols: 1, rows: 1, className: 'grid-cols-1' };
    } else if (participantCount === 2) {
      return { cols: 2, rows: 1, className: 'grid-cols-2' };
    } else if (participantCount <= 4) {
      return { cols: 2, rows: 2, className: 'grid-cols-2' };
    } else if (participantCount <= 6) {
      return { cols: 3, rows: 2, className: 'grid-cols-3' };
    } else if (participantCount <= 9) {
      return { cols: 3, rows: 3, className: 'grid-cols-3' };
    } else {
      return { cols: 4, rows: Math.ceil(participantCount / 4), className: 'grid-cols-4' };
    }
  }, []);

  const totalParticipants = peers.size + 1; // +1 for local user
  const gridLayout = getGridLayout(totalParticipants);

  // Initialize socket connection and MediaSoup
  useEffect(() => {
    console.log('Initializing Mediasoup meeting...');
    setConnectionStatus('Connecting to server...');
    
    socketRef.current = io(`${VITE_MEDIA_API_URL}`, {
      transports: ['websocket', 'polling']
    });
    
    socketRef.current.on('connect', () => {
      console.log('Connected to mediasoup server');
      setConnectionStatus('Joining room...');
      joinRoom();
    });

    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from mediasoup server');
      setConnectionStatus('Disconnected');
      setIsConnected(false);
    });

    socketRef.current.on('connect_error', (error: any) => {
      console.error('Connection error:', error);
      setConnectionStatus('Connection failed');
    });

    // Socket event handlers
    socketRef.current.on('routerRtpCapabilities', handleRouterRtpCapabilities);
    socketRef.current.on('webRtcTransportCreated', handleTransportCreated);
    socketRef.current.on('transportConnected', handleTransportConnected);
    socketRef.current.on('produced', handleProduced);
    socketRef.current.on('consumed', handleConsumed);
    socketRef.current.on('consumerResumed', handleConsumerResumed);
    socketRef.current.on('producers', handleProducers);
    socketRef.current.on('existingProducers', handleExistingProducers);
    socketRef.current.on('newProducer', handleNewProducer);
    socketRef.current.on('peerJoined', handlePeerJoined);
    socketRef.current.on('peerLeft', handlePeerLeft);
    socketRef.current.on('existingPeers', handleExistingPeers);
    socketRef.current.on('consumerClosed', handleConsumerClosed);
    socketRef.current.on('cannotConsume', handleCannotConsume);
    socketRef.current.on('error', handleError);

    return () => {
      console.log('Cleaning up Mediasoup meeting...');
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [roomName, displayName]);

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const results = Array.from(event.results);
        const finalTranscript = results
          .filter((result: any) => result.isFinal)
          .map((result: any) => result[0].transcript)
          .join(' ');

        if (finalTranscript.trim()) {
          const newEntry: TranscriptEntry = {
            id: Date.now().toString(),
            speaker: displayName || 'You',
            text: finalTranscript.trim(),
            timestamp: new Date()
          };
          
          setTranscript(prev => [...prev, newEntry]);
          
          // Auto-generate notes for significant content
          if (finalTranscript.length > 30) {
            generateAutoNotes(finalTranscript, displayName || 'You');
          }
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
      };

      recognitionRef.current.onend = () => {
        if (isTranscribing && isAIEnabled) {
          setTimeout(() => {
            if (recognitionRef.current && isTranscribing) {
              recognitionRef.current.start();
            }
          }, 1000);
        }
      };
    }
  }, [displayName, isTranscribing, isAIEnabled]);

  const joinRoom = () => {
    console.log(`Joining room: ${roomName} as ${displayName}`);
    socketRef.current.emit('join-room', {
      roomId: roomName,
      displayName: displayName
    });
  };

  const handleRouterRtpCapabilities = async (rtpCapabilities: any) => {
    try {
      console.log('Received router RTP capabilities');
      setConnectionStatus('Initializing device...');
      
      deviceRef.current = new Device();
      await deviceRef.current.load({ routerRtpCapabilities: rtpCapabilities });
      console.log('Device loaded successfully');
      
      setConnectionStatus('Creating transports...');
      await createTransports();
      
    } catch (error) {
      console.error('Error handling router RTP capabilities:', error);
      setConnectionStatus('Failed to initialize device');
    }
  };

  const createTransports = async () => {
    console.log('Creating WebRTC transports...');
    
    // Create send transport
    socketRef.current.emit('createWebRtcTransport', { direction: 'send' });
    
    // Create receive transport
    socketRef.current.emit('createWebRtcTransport', { direction: 'recv' });
  };

  const handleTransportCreated = async (data: any) => {
    const { id, iceParameters, iceCandidates, dtlsParameters, direction } = data;
    console.log(`Transport created: ${id} (${direction})`);
    
    try {
      if (direction === 'send' && !sendTransportRef.current) {
        console.log('Creating send transport');
        sendTransportRef.current = deviceRef.current!.createSendTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
        });

        sendTransportRef.current.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
          try {
            console.log('Connecting send transport');
            socketRef.current.emit('connectTransport', {
              transportId: id,
              dtlsParameters,
            });
            
            const connectPromise = new Promise((resolve) => {
              const handler = (data: any) => {
                if (data.transportId === id) {
                  socketRef.current.off('transportConnected', handler);
                  resolve(data);
                }
              };
              socketRef.current.on('transportConnected', handler);
            });
            
            await connectPromise;
            callback();
          } catch (error) {
            console.error('Send transport connect error:', error);
            errback(error);
          }
        });

        sendTransportRef.current.on('produce', async (parameters: any, callback: any, errback: any) => {
          try {
            console.log('Producing:', parameters.kind);
            socketRef.current.emit('produce', {
              transportId: id,
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
            });
            
            const producePromise = new Promise((resolve) => {
              socketRef.current.once('produced', resolve);
            });
            
            const data: any = await producePromise;
            callback({ id: data.id });
          } catch (error) {
            console.error('Produce error:', error);
            errback(error);
          }
        });

        sendTransportRef.current.on('connectionstatechange', (state: string) => {
          console.log('Send transport connection state:', state);
        });

        if (recvTransportRef.current) {
          await startProducing();
        }

      } else if (direction === 'recv' && !recvTransportRef.current) {
        console.log('Creating receive transport');
        recvTransportRef.current = deviceRef.current!.createRecvTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
        });

        recvTransportRef.current.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
          try {
            console.log('Connecting receive transport');
            socketRef.current.emit('connectTransport', {
              transportId: id,
              dtlsParameters,
            });
            
            const connectPromise = new Promise((resolve) => {
              const handler = (data: any) => {
                if (data.transportId === id) {
                  socketRef.current.off('transportConnected', handler);
                  resolve(data);
                }
              };
              socketRef.current.on('transportConnected', handler);
            });
            
            await connectPromise;
            callback();
          } catch (error) {
            console.error('Receive transport connect error:', error);
            errback(error);
          }
        });

        recvTransportRef.current.on('connectionstatechange', (state: string) => {
          console.log('Receive transport connection state:', state);
        });

        if (sendTransportRef.current) {
          await startProducing();
        }
      }
    } catch (error) {
      console.error('Error creating transport:', error);
      setConnectionStatus('Failed to create transport');
    }
  };

  const startProducing = async () => {
    try {
      setConnectionStatus('Getting user media...');
      console.log('Getting user media...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
      });
      
      console.log('Got user media stream', stream);
      localStreamRef.current = stream;

      // Set local video immediately
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.autoplay = true;
        localVideoRef.current.playsInline = true;
        
        try {
          await localVideoRef.current.play();
          console.log('Local video playing successfully');
        } catch (playError) {
          console.error('Error playing local video:', playError);
        }
      }

      // Produce audio and video
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      if (audioTrack && sendTransportRef.current) {
        console.log('Producing audio track');
        const audioProducer = await sendTransportRef.current.produce({ track: audioTrack });
        setProducers(prev => new Map(prev.set('audio', audioProducer)));
        
        audioProducer.on('trackended', () => {
          console.log('Audio track ended');
        });
      }

      if (videoTrack && sendTransportRef.current) {
        console.log('Producing video track');
        const videoProducer = await sendTransportRef.current.produce({ track: videoTrack });
        setProducers(prev => new Map(prev.set('video', videoProducer)));
        
        videoProducer.on('trackended', () => {
          console.log('Video track ended');
        });
      }

      setConnectionStatus('Connected');
      setIsConnected(true);

    } catch (error) {
      console.error('Error starting production:', error);
      setConnectionStatus('Media access denied');
    }
  };

  const handleTransportConnected = (data: any) => {
    console.log('Transport connected:', data.transportId);
  };

  const handleProduced = (data: any) => {
    console.log('Producer created:', data.id);
  };

  const handleConsumed = async (data: any) => {
    const { id, producerId, kind, rtpParameters, peerId } = data;
    console.log('Consuming:', { id, producerId, kind, peerId });

    try {
      if (!recvTransportRef.current) {
        console.error('Receive transport not ready');
        return;
      }

      const consumer = await recvTransportRef.current.consume({
        id,
        producerId,
        kind,
        rtpParameters,
      });

      console.log('Consumer created:', consumer.id, 'for peer:', peerId);
      setConsumers(prev => new Map(prev.set(id, consumer)));

      // Resume the consumer immediately
      socketRef.current.emit('resumeConsumer', { consumerId: id });

      // Create stream and update peer state
      const stream = new MediaStream([consumer.track]);
      
      // Update peer with stream info
      setPeers(prev => {
        const newPeers = new Map(prev);
        const existingPeer = newPeers.get(peerId) || {
          id: peerId,
          displayName: `User ${peerId.slice(0, 8)}`,
          hasVideo: false,
          hasAudio: false
        };

        if (kind === 'video') {
          existingPeer.hasVideo = true;
          // Create video element for this peer if it doesn't exist
          if (!existingPeer.videoElement) {
            const videoElement = document.createElement('video');
            videoElement.autoplay = true;
            videoElement.playsInline = true;
            videoElement.muted = false;
            videoElement.style.width = '100%';
            videoElement.style.height = '100%';
            videoElement.style.objectFit = 'cover';
            existingPeer.videoElement = videoElement;
          }
          
          existingPeer.videoElement.srcObject = stream;
          existingPeer.videoElement.play().catch(console.error);
          console.log(`Set video stream for peer ${peerId}`);
        } else if (kind === 'audio') {
          existingPeer.hasAudio = true;
          // Create audio element for this peer if it doesn't exist
          if (!existingPeer.audioElement) {
            const audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            audioElement.playsInline = true;
            existingPeer.audioElement = audioElement;
          }
          
          existingPeer.audioElement.srcObject = stream;
          existingPeer.audioElement.play().catch(console.error);
          console.log(`Set audio stream for peer ${peerId}`);
        }

        newPeers.set(peerId, existingPeer);
        return newPeers;
      });

      consumer.on('transportclose', () => {
        console.log('Consumer transport closed');
        consumer.close();
        setConsumers(prev => {
          const map = new Map(prev);
          map.delete(id);
          return map;
        });
      });

    } catch (error) {
      console.error('Error consuming:', error);
    }
  };

  const handleProducers = (producers: any[]) => {
    console.log('Received existing producers:', producers);
    if (!producers || producers.length === 0) return;
    
    producers.forEach(({ peerId, producerId, kind }) => {
      if (peerId && producerId) {
        console.log(`Consuming existing producer: ${producerId} (${kind}) from peer: ${peerId}`);
        consume(producerId, peerId);
      }
    });
  };

  const handleExistingProducers = (producers: any[]) => {
    console.log('Received existing producers:', producers);
    handleProducers(producers);
  };

  const handleNewProducer = ({ peerId, producerId, kind }: any) => {
    console.log(`New producer: ${producerId} (${kind}) from peer: ${peerId}`);
    if (!peerId || !producerId) return;
    consume(producerId, peerId);
  };

  const handleConsumerResumed = (data: any) => {
    console.log('Consumer resumed:', data.consumerId);
  };

  const consume = (producerId: string, peerId: string) => {
    if (!recvTransportRef.current || !deviceRef.current) {
      console.error('Cannot consume: transport or device not ready');
      return;
    }

    console.log(`Requesting to consume producer: ${producerId} from peer: ${peerId}`);
    socketRef.current.emit('consume', {
      transportId: recvTransportRef.current.id,
      producerId,
      rtpCapabilities: deviceRef.current.rtpCapabilities,
    });
  };

  const handlePeerJoined = ({ peerId, displayName: peerDisplayName }: any) => {
    console.log(`Peer joined: ${peerId} (${peerDisplayName})`);
    setPeers(prev => {
      const newPeers = new Map(prev);
      const existingPeer = newPeers.get(peerId) || {
        id: peerId,
        displayName: peerDisplayName,
        hasVideo: false,
        hasAudio: false
      };
      
      newPeers.set(peerId, existingPeer);
      return newPeers;
    });
  };

  const handlePeerLeft = ({ peerId }: any) => {
    console.log(`Peer left: ${peerId}`);
    setPeers(prev => {
      const newPeers = new Map(prev);
      const peer = newPeers.get(peerId);
      if (peer) {
        // Clean up video and audio elements
        if (peer.videoElement) {
          peer.videoElement.srcObject = null;
        }
        if (peer.audioElement) {
          peer.audioElement.srcObject = null;
        }
      }
      newPeers.delete(peerId);
      return newPeers;
    });
  };

  const handleExistingPeers = (existingPeers: any[]) => {
    console.log('Existing peers:', existingPeers);
    const newPeers = new Map();
    existingPeers.forEach(peer => {
      newPeers.set(peer.id, {
        ...peer,
        hasVideo: false,
        hasAudio: false
      });
    });
    setPeers(newPeers);
  };

  const handleConsumerClosed = ({ consumerId }: any) => {
    console.log('Consumer closed:', consumerId);
    setConsumers(prev => {
      const newConsumers = new Map(prev);
      newConsumers.delete(consumerId);
      return newConsumers;
    });
  };

  const handleCannotConsume = ({ producerId }: any) => {
    console.log('Cannot consume producer:', producerId);
  };

  const handleError = (error: any) => {
    console.error('Socket error:', error);
    setConnectionStatus(`Error: ${error.message || 'Unknown error'}`);
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAI = async () => {
    if (!isAIEnabled) {
      try {
        setIsAIEnabled(true);
        startTranscription();
      } catch (error) {
        alert('Microphone access is required for AI features.');
        console.error('Microphone access denied:', error);
      }
    } else {
      setIsAIEnabled(false);
      stopTranscription();
    }
  };

  const startTranscription = () => {
    if (recognitionRef.current && !isTranscribing) {
      setIsTranscribing(true);
      recognitionRef.current.start();
    }
  };

  const stopTranscription = () => {
    if (recognitionRef.current && isTranscribing) {
      setIsTranscribing(false);
      recognitionRef.current.stop();
    }
  };

  const generateAutoNotes = async (text: string, speaker: string) => {
    try {
      setIsProcessing(true);
      const response = await fetch(`${VITE_AI_API_URL}/api/meetings/auto-notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          text,
          speaker,
          userId: 'meeting-user'
        })
      });

      const data = await response.json();
      
      if (data.success && data.notes) {
        const newNote: Note = {
          id: Date.now().toString(),
          content: data.notes,
          timestamp: new Date(),
          type: 'auto'
        };
        setNotes(prev => [...prev, newNote]);
      }
    } catch (error) {
      console.error('Auto notes generation failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateMeetingSummary = async () => {
    if (transcript.length === 0) {
      alert('No transcript available to summarize.');
      return;
    }

    try {
      setIsProcessing(true);
      const response = await fetch(`${VITE_AI_API_URL}/api/meetings/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          transcript: transcript.map(t => `${t.speaker}: ${t.text}`).join('\n'),
          participants: Array.from(peers.values()).map(p => p.displayName),
          duration: Math.round((new Date().getTime() - (transcript[0]?.timestamp.getTime() || Date.now())) / 60000)
        })
      });

      const data = await response.json();
      
      if (data.success && data.summary) {
        setMeetingSummary(data.summary);
      }
    } catch (error) {
      console.error('Summary generation failed:', error);
      alert('Failed to generate meeting summary. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTranscript = () => {
    const transcriptText = transcript
      .map(entry => `[${entry.timestamp.toLocaleTimeString()}] ${entry.speaker}: ${entry.text}`)
      .join('\n');
    
    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-transcript-${roomName}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadNotes = () => {
    const notesText = notes
      .map(note => `[${note.timestamp.toLocaleTimeString()}] ${note.type.toUpperCase()}: ${note.content}`)
      .join('\n\n');
    
    const blob = new Blob([notesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-notes-${roomName}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyMeetingLink = async () => {
    const meetingLink = `${window.location.origin}/meetings?room=${encodeURIComponent(roomName)}`;
    try {
      await navigator.clipboard.writeText(meetingLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy meeting link:', error);
    }
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent(`Join my video meeting: ${roomName}`);
    const body = encodeURIComponent(`Hi! 

I'd like to invite you to join my video meeting.

Meeting Room: ${roomName}
Meeting Link: ${window.location.origin}/meetings?room=${encodeURIComponent(roomName)}

To join:
1. Click the link above or go to ${window.location.origin}/meetings
2. Click "Join Meeting"
3. Enter the room name: ${roomName}
4. Enter your name and join!

See you there!`);
    
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleLeave = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    onLeave();
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="glass-panel rounded-2xl p-8 max-w-md mx-auto text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gold-text border-t-transparent rounded-full mx-auto mb-4"></div>
          <h3 className="text-xl font-bold text-primary mb-2">Connecting to Meeting...</h3>
          <p className="text-secondary mb-4">{connectionStatus}</p>
          <div className="text-sm text-secondary">
            <p>Room: <span className="font-medium text-primary">{roomName}</span></p>
            <p>Name: <span className="font-medium text-primary">{displayName}</span></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-primary relative">
      {/* Video Grid - Full screen */}
      <div className="flex-1 p-4">
        <div 
          className={`h-full w-full grid gap-4 ${gridLayout.className}`}
          style={{
            gridAutoRows: totalParticipants === 1 ? '1fr' : 'minmax(200px, 1fr)'
          }}
        >
          {/* Local Video */}
          <motion.div
            layout
            className="relative glass-panel rounded-lg overflow-hidden bg-gray-900"
            style={{ aspectRatio: '16/9' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
              style={{
                display: isVideoEnabled ? 'block' : 'none',
              }}
            />
            {!isVideoEnabled && (
              <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-gold-silver flex items-center justify-center mx-auto mb-2">
                    <span className="text-white text-xl font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-gray-400 text-sm">Camera Off</span>
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 glass-panel px-3 py-1 rounded-full text-sm">
              <span className="text-primary font-medium">{displayName} (You)</span>
            </div>
            <div className="absolute top-2 right-2 flex space-x-1">
              {!isAudioEnabled && (
                <div className="glass-panel p-1 rounded-full bg-red-500/20">
                  <MicOff className="w-3 h-3 text-red-400" />
                </div>
              )}
              {!isVideoEnabled && (
                <div className="glass-panel p-1 rounded-full bg-red-500/20">
                  <VideoOff className="w-3 h-3 text-red-400" />
                </div>
              )}
            </div>
          </motion.div>

          {/* Remote Videos */}
          {Array.from(peers.values()).map((peer, index) => (
            <motion.div
              key={peer.id}
              layout
              className="relative glass-panel rounded-lg overflow-hidden bg-gray-900"
              style={{ aspectRatio: '16/9' }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              {peer.hasVideo && peer.videoElement && (
                <div 
                  ref={(el) => {
                    if (el && peer.videoElement && !el.contains(peer.videoElement)) {
                      el.appendChild(peer.videoElement);
                    }
                  }}
                  className="w-full h-full"
                />
              )}
              {peer.hasAudio && peer.audioElement && (
                <div 
                  ref={(el) => {
                    if (el && peer.audioElement && !el.contains(peer.audioElement)) {
                      el.appendChild(peer.audioElement);
                    }
                  }}
                  className="hidden"
                />
              )}
              {!peer.hasVideo && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-gold-silver flex items-center justify-center mx-auto mb-2">
                      <span className="text-white text-xl font-bold">
                        {peer.displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-gray-400 text-sm">Camera Off</span>
                  </div>
                </div>
              )}
              <div className="absolute bottom-2 left-2 glass-panel px-3 py-1 rounded-full text-sm">
                <span className="text-primary font-medium">{peer.displayName}</span>
              </div>
              <div className="absolute top-2 right-2 flex space-x-1">
                {!peer.hasAudio && (
                  <div className="glass-panel p-1 rounded-full bg-red-500/20">
                    <MicOff className="w-3 h-3 text-red-400" />
                  </div>
                )}
                {!peer.hasVideo && (
                  <div className="glass-panel p-1 rounded-full bg-red-500/20">
                    <VideoOff className="w-3 h-3 text-red-400" />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Floating Controls - Bottom Center */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <div className="glass-panel rounded-full p-4 flex items-center space-x-4 shadow-2xl">
          <button
            onClick={toggleAudio}
            className={`p-3 rounded-full transition-all ${
              !isAudioEnabled ? 'bg-red-500/20 border-red-500/50' : 'glass-panel-hover'
            }`}
          >
            {isAudioEnabled ? (
              <Mic className="w-5 h-5 text-primary" />
            ) : (
              <MicOff className="w-5 h-5 text-red-400" />
            )}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full transition-all ${
              !isVideoEnabled ? 'bg-red-500/20 border-red-500/50' : 'glass-panel-hover'
            }`}
          >
            {isVideoEnabled ? (
              <Video className="w-5 h-5 text-primary" />
            ) : (
              <VideoOff className="w-5 h-5 text-red-400" />
            )}
          </button>

          <button
            onClick={toggleAI}
            className={`p-3 rounded-full transition-all ${
              isAIEnabled ? 'bg-gradient-gold-silver text-white' : 'glass-panel-hover'
            }`}
          >
            {isAIEnabled ? <Bot className="w-5 h-5" /> : <BotOff className="w-5 h-5 text-primary" />}
          </button>

          <button
            onClick={() => setShowInviteModal(true)}
            className="p-3 rounded-full glass-panel-hover"
          >
            <Share2 className="w-5 h-5 text-primary" />
          </button>

          <button
            onClick={handleLeave}
            className="p-3 rounded-full bg-red-500/20 border-red-500/50 hover:bg-red-500/30"
          >
            <PhoneOff className="w-5 h-5 text-red-400" />
          </button>
        </div>
      </div>

      {/* Floating AI Features - Top Right */}
      {isAIEnabled && (
        <div className="absolute top-6 right-6 z-50 flex space-x-2">
          {transcript.length > 0 && (
            <Button
              onClick={() => setShowTranscript(!showTranscript)}
              variant="secondary"
              size="sm"
              className="glass-panel"
            >
              <FileText className="w-4 h-4 mr-2" />
              Transcript ({transcript.length})
            </Button>
          )}
          
          {notes.length > 0 && (
            <Button
              onClick={() => setShowNotes(!showNotes)}
              variant="secondary"
              size="sm"
              className="glass-panel"
            >
              <FileText className="w-4 h-4 mr-2" />
              Notes ({notes.length})
            </Button>
          )}
        </div>
      )}

      {/* AI Status Indicator - Top Left */}
      {isAIEnabled && (
        <div className="absolute top-6 left-6 glass-panel px-3 py-2 rounded-lg z-40">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isTranscribing ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-sm text-primary font-medium">
              {isTranscribing ? 'AI Listening' : 'AI Ready'}
            </span>
          </div>
        </div>
      )}

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 glass-panel px-3 py-2 rounded-lg z-40">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-gold-text border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-primary">Processing...</span>
          </div>
        </div>
      )}

      {/* Transcript Panel */}
      <AnimatePresence>
        {showTranscript && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            className="absolute top-0 right-0 w-96 h-full glass-panel border-l silver-border flex flex-col z-30"
          >
            <div className="p-4 border-b silver-border">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-primary">Live Transcript</h3>
                <div className="flex space-x-2">
                  <Button
                    onClick={downloadTranscript}
                    variant="ghost"
                    size="sm"
                    disabled={transcript.length === 0}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={() => setShowTranscript(false)}
                    variant="ghost"
                    size="sm"
                  >
                    ×
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {transcript.map((entry) => (
                <div key={entry.id} className="glass-panel p-3 rounded-lg">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-primary text-sm">{entry.speaker}</span>
                    <span className="text-xs text-secondary">
                      {entry.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-secondary">{entry.text}</p>
                </div>
              ))}
              
              {transcript.length === 0 && (
                <div className="text-center text-secondary py-8">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Transcript will appear here when AI is listening</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes Panel */}
      <AnimatePresence>
        {showNotes && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            className="absolute top-0 right-0 w-96 h-full glass-panel border-l silver-border flex flex-col z-30"
          >
            <div className="p-4 border-b silver-border">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-primary">AI Notes</h3>
                <div className="flex space-x-2">
                  <Button
                    onClick={generateMeetingSummary}
                    variant="ghost"
                    size="sm"
                    disabled={transcript.length === 0 || isProcessing}
                  >
                    <Bot className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={downloadNotes}
                    variant="ghost"
                    size="sm"
                    disabled={notes.length === 0}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={() => setShowNotes(false)}
                    variant="ghost"
                    size="sm"
                  >
                    ×
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Meeting Summary */}
              {meetingSummary && (
                <div className="glass-panel p-4 rounded-lg border-gold-border">
                  <h4 className="font-bold text-primary mb-2 flex items-center">
                    <Bot className="w-4 h-4 mr-2" />
                    Meeting Summary
                  </h4>
                  <p className="text-sm text-secondary whitespace-pre-wrap">{meetingSummary}</p>
                </div>
              )}

              {/* Auto Notes */}
              {notes.map((note) => (
                <div key={note.id} className="glass-panel p-3 rounded-lg">
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-xs px-2 py-1 rounded ${
                      note.type === 'auto' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                    }`}>
                      {note.type === 'auto' ? 'AI Generated' : 'Manual'}
                    </span>
                    <span className="text-xs text-secondary">
                      {note.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-secondary">{note.content}</p>
                </div>
              ))}
              
              {notes.length === 0 && (
                <div className="text-center text-secondary py-8">
                  <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>AI will automatically take notes during the meeting</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invite Others Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md"
            >
              <GlassCard className="p-8" goldBorder>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold gradient-gold-silver">Invite Others</h2>
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="text-secondary hover:text-primary"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Room Name
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={roomName}
                        readOnly
                        className="flex-1 glass-panel rounded-lg px-4 py-3 text-primary bg-gray-500/10"
                      />
                      <Button
                        onClick={() => navigator.clipboard.writeText(roomName)}
                        variant="ghost"
                        size="sm"
                        className="px-3"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Meeting Link
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={`${window.location.origin}/meetings?room=${encodeURIComponent(roomName)}`}
                        readOnly
                        className="flex-1 glass-panel rounded-lg px-4 py-3 text-primary bg-gray-500/10 text-sm"
                      />
                      <Button
                        onClick={copyMeetingLink}
                        variant="ghost"
                        size="sm"
                        className="px-3"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button
                      onClick={shareViaEmail}
                      variant="secondary"
                      className="w-full justify-start"
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Share via Email
                    </Button>
                  </div>

                  <div className="text-xs text-secondary">
                    Share the room name or link with others so they can join your meeting.
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MediasoupMeeting;