import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Device } from 'mediasoup-client';
import io from 'socket.io-client';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Bot, NutOff as BotOff, FileText, Download, Users, Settings, Share2, Copy, Check, X, MoreVertical, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';
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
  isVideoEnabled?: boolean;
  isAudioEnabled?: boolean;
}

const MediasoupMeeting: React.FC<MediasoupMeetingProps> = ({ roomName, displayName, onLeave }) => {
  const socketRef = useRef<any>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
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
  const [showParticipants, setShowParticipants] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [meetingSummary, setMeetingSummary] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [producers, setProducers] = useState<Map<string, any>>(new Map());
  const [consumers, setConsumers] = useState<Map<string, any>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<string>('Connecting...');
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [producerToPeer, setProducerToPeer] = useState<Map<string, string>>(new Map());
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pinnedParticipant, setPinnedParticipant] = useState<string | null>(null);

  // Calculate grid layout based on participant count
  const getGridLayout = useCallback(() => {
    const totalParticipants = peers.size + 1; // +1 for local participant
    
    if (totalParticipants === 1) {
      return { cols: 1, rows: 1, aspectRatio: '16/9' };
    } else if (totalParticipants === 2) {
      return { cols: 2, rows: 1, aspectRatio: '16/9' };
    } else if (totalParticipants <= 4) {
      return { cols: 2, rows: 2, aspectRatio: '16/9' };
    } else if (totalParticipants <= 6) {
      return { cols: 3, rows: 2, aspectRatio: '16/9' };
    } else if (totalParticipants <= 9) {
      return { cols: 3, rows: 3, aspectRatio: '16/9' };
    } else if (totalParticipants <= 12) {
      return { cols: 4, rows: 3, aspectRatio: '16/9' };
    } else {
      return { cols: 4, rows: 4, aspectRatio: '16/9' };
    }
  }, [peers.size]);

  const gridLayout = getGridLayout();

  // Initialize socket connection
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
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
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
            
            // Wait for transport connected event
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
            
            // Wait for produced event
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

        // Start producing after send transport is ready
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
            
            // Wait for transport connected event
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

        // Start producing after both transports are ready
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
      setLocalStream(stream);

      // Debug: log tracks
      console.log('Local stream tracks:', stream.getTracks());
      console.log('Video tracks:', stream.getVideoTracks());
      console.log('Audio tracks:', stream.getAudioTracks());

      // Produce audio and video
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      console.log('audioTrack:', audioTrack);
      console.log('videoTrack:', videoTrack);

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
      } else if (!videoTrack) {
        console.warn('No video track found in local stream');
      } else if (!sendTransportRef.current) {
        console.warn('sendTransportRef.current is not ready for video');
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
    const { id, producerId, kind, rtpParameters, peerId: explicitPeerId } = data;
    console.log('Consuming:', data);

    try {
      if (!recvTransportRef.current) {
        console.error('Receive transport not ready');
        return;
      }

      // Force flush debug logs to the window for inspection
      (window as any).__debug_producerToPeer = Array.from(producerToPeer.entries());
      (window as any).__debug_peers = Array.from(peers.entries());
      (window as any).__debug_producers = Array.from(producers.entries());
      (window as any).__debug_consumed_data = data;

      const consumer = await recvTransportRef.current.consume({
        id,
        producerId,
        kind,
        rtpParameters,
      });

      console.log('Consumer created:', consumer.id);
      setConsumers(prev => new Map(prev.set(id, consumer)));

      socketRef.current.emit('resumeConsumer', { consumerId: id });

      const stream = new MediaStream([consumer.track]);

      // Try to get peerId from data, fallback to mapping
      let peerId = explicitPeerId;
      if (!peerId) {
        peerId = findPeerByProducerId(producerId);
      }
      if (!peerId) {
        // Print a single warning, but now you can inspect the debug info in the browser console
        console.warn('Could not find peerId for producerId:', producerId, 'Inspect window.__debug_producerToPeer, window.__debug_peers, window.__debug_producers, window.__debug_consumed_data');
        return;
      }

      setRemoteStreams(prev => {
        const newStreams = new Map(prev);
        const existing = newStreams.get(peerId);
        if (existing) {
          existing.addTrack(consumer.track);
        } else {
          newStreams.set(peerId, stream);
        }
        return newStreams;
      });

      setTimeout(() => {
        const videoEl = document.getElementById(`remote-video-${peerId}`) as HTMLVideoElement;
        const audioEl = document.getElementById(`remote-audio-${peerId}`) as HTMLAudioElement;

        if (kind === 'video' && videoEl) {
          console.log(`Setting video stream for peer ${peerId}`);
          videoEl.srcObject = stream;
          videoEl.play().catch(console.error);
        }

        if (kind === 'audio' && audioEl) {
          console.log(`Setting audio stream for peer ${peerId}`);
          audioEl.srcObject = stream;
          audioEl.play().catch(console.error);
        }
      }, 500);

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

  // Update producerToPeer mapping when receiving producers
  const handleProducers = (producers: any[]) => {
    console.log('Received existing producers:', producers);
    // Defensive: If producers is empty, do nothing
    if (!producers || producers.length === 0) return;
    setProducerToPeer(prev => {
      const map = new Map(prev);
      producers.forEach(({ peerId, producerId }) => {
        if (peerId && producerId) map.set(producerId, peerId);
      });
      return map;
    });
    producers.forEach(({ peerId, producerId, kind }) => {
      if (peerId && producerId) {
        console.log(`Consuming existing producer: ${producerId} (${kind}) from peer: ${peerId}`);
        consume(producerId, peerId);
      }
    });
  };

  const handleExistingProducers = (producers: any[]) => {
    console.log('Received existing producers:', producers);
    if (!producers || producers.length === 0) return;
    setProducerToPeer(prev => {
      const map = new Map(prev);
      producers.forEach(({ peerId, producerId }) => {
        if (peerId && producerId) map.set(producerId, peerId);
      });
      return map;
    });
    producers.forEach(({ peerId, producerId, kind }) => {
      if (peerId && producerId) {
        console.log(`Consuming existing producer: ${producerId} (${kind}) from peer: ${peerId}`);
        consume(producerId, peerId);
      }
    });
  };

  const handleNewProducer = ({ peerId, producerId, kind }: any) => {
    console.log(`New producer: ${producerId} (${kind}) from peer: ${peerId}`);
    if (!peerId || !producerId) return;
    setProducerToPeer(prev => {
      const map = new Map(prev);
      map.set(producerId, peerId);
      return map;
    });
    consume(producerId, peerId);
  };

  const findPeerByProducerId = (producerId: string): string | null => {
    return producerToPeer.get(producerId) || null;
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
    setPeers(prev => new Map(prev.set(peerId, { 
      id: peerId, 
      displayName: peerDisplayName,
      isVideoEnabled: true,
      isAudioEnabled: true
    })));
    // Defensive: update mapping for all current producers if possible
    setProducerToPeer(prev => {
      const map = new Map(prev);
      // If you have a way to get all producerIds for this peer, add them here
      // Example: if (peerProducers[peerId]) peerProducers[peerId].forEach(pid => map.set(pid, peerId));
      return map;
    });
  };

  const handlePeerLeft = ({ peerId }: any) => {
    console.log(`Peer left: ${peerId}`);
    setPeers(prev => {
      const newPeers = new Map(prev);
      newPeers.delete(peerId);
      return newPeers;
    });
    
    // Clean up remote stream
    setRemoteStreams(prev => {
      const newStreams = new Map(prev);
      newStreams.delete(peerId);
      return newStreams;
    });

    // Clear pinned participant if they left
    if (pinnedParticipant === peerId) {
      setPinnedParticipant(null);
    }
  };

  const handleExistingPeers = (existingPeers: any[]) => {
    console.log('Existing peers:', existingPeers);
    const newPeers = new Map();
    existingPeers.forEach(peer => {
      newPeers.set(peer.id, {
        ...peer,
        isVideoEnabled: true,
        isAudioEnabled: true
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
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handlePinParticipant = (participantId: string) => {
    setPinnedParticipant(pinnedParticipant === participantId ? null : participantId);
  };

  // Debug: log when the video ref is set
  const handleLocalVideoRef = (el: HTMLVideoElement | null) => {
    localVideoRef.current = el;
    if (el) {
      console.log('localVideoRef set:', el);
      // Add a property for easier debugging in the browser console
      (window as any).__localVideoRef = el;
    } else {
      console.log('localVideoRef set: null');
    }
  };

  // Ensure video element updates when localStream or isVideoEnabled changes
  useEffect(() => {
    const interval = setInterval(() => {
      const videoEl = localVideoRef.current;

      if (videoEl && localStream && isVideoEnabled) {
        console.log('Delayed assignment of localStream to video element');

        videoEl.srcObject = localStream;
        videoEl.muted = true;

        videoEl.onloadedmetadata = () => {
          videoEl.play().then(() => {
            console.log('localVideoRef play() success');
          }).catch((err) => {
            console.error('localVideoRef play() error', err);
          });
        };

        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [localStream, isVideoEnabled]);

  // Add handleLeave function
  const handleLeave = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    onLeave();
  };

  // Render participant video component
  const renderParticipantVideo = (participant: { id: string; displayName: string }, isLocal = false) => {
    const isPinned = pinnedParticipant === participant.id;
    const totalParticipants = peers.size + 1;
    
    return (
      <motion.div
        key={participant.id}
        layout
        className={`relative bg-gray-900 rounded-lg overflow-hidden group ${
          totalParticipants === 1 ? 'w-full h-full' : ''
        } ${isPinned && totalParticipants > 1 ? 'col-span-2 row-span-2' : ''}`}
        style={{
          aspectRatio: gridLayout.aspectRatio,
          minHeight: totalParticipants === 1 ? '100%' : '200px'
        }}
        whileHover={{ scale: totalParticipants > 1 ? 1.02 : 1 }}
        transition={{ duration: 0.2 }}
      >
        {/* Video Element */}
        {isLocal ? (
          <video
            ref={handleLocalVideoRef}
            autoPlay
            muted
            playsInline
            className={`w-full h-full object-cover ${!isVideoEnabled ? 'hidden' : ''}`}
          />
        ) : (
          <>
            <video
              id={`remote-video-${participant.id}`}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <audio
              id={`remote-audio-${participant.id}`}
              autoPlay
              playsInline
            />
          </>
        )}

        {/* Video Off Placeholder */}
        {(!isVideoEnabled && isLocal) && (
          <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-white">
                  {participant.displayName.charAt(0).toUpperCase()}
                </span>
              </div>
              <VideoOff className="w-6 h-6 text-gray-400 mx-auto" />
            </div>
          </div>
        )}

        {/* Participant Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-white font-medium text-sm">
                {participant.displayName}
                {isLocal && ' (You)'}
              </span>
              {!isLocal && (
                <div className="flex items-center space-x-1">
                  {/* Audio indicator */}
                  <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                    <Mic className="w-2 h-2 text-white" />
                  </div>
                </div>
              )}
            </div>

            {/* Participant Controls */}
            {totalParticipants > 1 && (
              <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handlePinParticipant(participant.id)}
                  className="p-1 bg-black/40 rounded hover:bg-black/60 transition-colors"
                  title={isPinned ? 'Unpin' : 'Pin participant'}
                >
                  {isPinned ? (
                    <Minimize2 className="w-3 h-3 text-white" />
                  ) : (
                    <Maximize2 className="w-3 h-3 text-white" />
                  )}
                </button>
                <button
                  className="p-1 bg-black/40 rounded hover:bg-black/60 transition-colors"
                  title="More options"
                >
                  <MoreVertical className="w-3 h-3 text-white" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Connection Quality Indicator */}
        <div className="absolute top-2 right-2">
          <div className="flex space-x-1">
            <div className="w-1 h-3 bg-green-500 rounded-full"></div>
            <div className="w-1 h-3 bg-green-500 rounded-full"></div>
            <div className="w-1 h-3 bg-green-500 rounded-full"></div>
          </div>
        </div>
      </motion.div>
    );
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="glass-panel rounded-2xl p-8 max-w-md mx-auto text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <h3 className="text-xl font-bold text-white mb-2">Connecting to Meeting...</h3>
          <p className="text-gray-300 mb-4">{connectionStatus}</p>
          <div className="text-sm text-gray-400">
            <p>Room: <span className="font-medium text-white">{roomName}</span></p>
            <p>Name: <span className="font-medium text-white">{displayName}</span></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col overflow-hidden">
      {/* Meeting Header */}
      <div className="bg-gray-800/90 backdrop-blur-sm border-b border-gray-700 p-4 flex-shrink-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-semibold text-white">
              {roomName}
            </h1>
            <div className="flex items-center space-x-2 text-sm text-gray-300">
              <Users className="w-4 h-4" />
              <span>{peers.size + 1} participants</span>
            </div>
            {isAIEnabled && (
              <div className="flex items-center space-x-2 px-3 py-1 bg-blue-500/20 rounded-full">
                <div className={`w-2 h-2 rounded-full ${isTranscribing ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                <span className="text-xs text-blue-400 font-medium">
                  {isTranscribing ? 'AI Recording' : 'AI Ready'}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* AI Toggle */}
            <Button
              onClick={toggleAI}
              variant={isAIEnabled ? "premium" : "secondary"}
              size="sm"
              className="flex items-center space-x-2"
            >
              {isAIEnabled ? <Bot className="w-4 h-4" /> : <BotOff className="w-4 h-4" />}
              <span className="hidden sm:inline">{isAIEnabled ? 'AI On' : 'AI Off'}</span>
            </Button>

            {/* Transcript Toggle */}
            {isAIEnabled && (
              <Button
                onClick={() => setShowTranscript(!showTranscript)}
                variant="secondary"
                size="sm"
                className="flex items-center space-x-2"
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Transcript</span>
              </Button>
            )}

            {/* Participants */}
            <Button
              onClick={() => setShowParticipants(!showParticipants)}
              variant="secondary"
              size="sm"
              className="flex items-center space-x-2"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">{peers.size + 1}</span>
            </Button>

            {/* Invite Others */}
            <Button
              onClick={() => setShowInviteModal(true)}
              variant="secondary"
              size="sm"
              className="flex items-center space-x-2"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Invite</span>
            </Button>

            {/* Fullscreen */}
            <Button
              onClick={toggleFullscreen}
              variant="secondary"
              size="sm"
              className="p-2"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>

            {/* Leave Meeting */}
            <Button
              onClick={handleLeave}
              variant="secondary"
              size="sm"
              className="flex items-center space-x-2 bg-red-500/20 border-red-500/50 hover:bg-red-500/30"
            >
              <PhoneOff className="w-4 h-4 text-red-400" />
              <span className="hidden sm:inline text-red-400">Leave</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Meeting Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Grid */}
        <div className="flex-1 p-4">
          <div 
            className={`h-full gap-4 ${
              gridLayout.cols === 1 ? 'flex items-center justify-center' : 
              `grid grid-cols-${gridLayout.cols} grid-rows-${gridLayout.rows} auto-rows-fr`
            }`}
          >
            {/* Local Video */}
            {renderParticipantVideo({ id: 'local', displayName }, true)}

            {/* Remote Videos */}
            {Array.from(peers.values()).map((peer) => 
              renderParticipantVideo(peer, false)
            )}
          </div>
        </div>

        {/* Side Panels */}
        <AnimatePresence>
          {(showTranscript || showNotes || showParticipants) && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="bg-gray-800 border-l border-gray-700 flex flex-col"
            >
              {/* Panel Header */}
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white">
                    {showTranscript ? 'Live Transcript' : 
                     showNotes ? 'AI Notes' : 
                     'Participants'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowTranscript(false);
                      setShowNotes(false);
                      setShowParticipants(false);
                    }}
                    className="text-gray-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {showParticipants && (
                  <div className="space-y-3">
                    {/* Local participant */}
                    <div className="flex items-center space-x-3 p-3 bg-gray-700/50 rounded-lg">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">
                          {displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-medium">{displayName} (You)</p>
                        <p className="text-gray-400 text-xs">Host</p>
                      </div>
                      <div className="flex items-center space-x-1">
                        {isAudioEnabled ? (
                          <Mic className="w-4 h-4 text-green-500" />
                        ) : (
                          <MicOff className="w-4 h-4 text-red-500" />
                        )}
                        {isVideoEnabled ? (
                          <Video className="w-4 h-4 text-green-500" />
                        ) : (
                          <VideoOff className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    </div>

                    {/* Remote participants */}
                    {Array.from(peers.values()).map((peer) => (
                      <div key={peer.id} className="flex items-center space-x-3 p-3 bg-gray-700/50 rounded-lg">
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-bold">
                            {peer.displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium">{peer.displayName}</p>
                          <p className="text-gray-400 text-xs">Participant</p>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Mic className="w-4 h-4 text-green-500" />
                          <Video className="w-4 h-4 text-green-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {showTranscript && (
                  <div className="space-y-3">
                    {transcript.map((entry) => (
                      <div key={entry.id} className="p-3 bg-gray-700/50 rounded-lg">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-white text-sm">{entry.speaker}</span>
                          <span className="text-xs text-gray-400">
                            {entry.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300">{entry.text}</p>
                      </div>
                    ))}
                    
                    {transcript.length === 0 && (
                      <div className="text-center text-gray-400 py-8">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Transcript will appear here when AI is listening</p>
                      </div>
                    )}
                  </div>
                )}

                {showNotes && (
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <div key={note.id} className="p-3 bg-gray-700/50 rounded-lg">
                        <div className="flex justify-between items-start mb-1">
                          <span className={`text-xs px-2 py-1 rounded ${
                            note.type === 'auto' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                          }`}>
                            {note.type === 'auto' ? 'AI Generated' : 'Manual'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {note.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300">{note.content}</p>
                      </div>
                    ))}
                    
                    {notes.length === 0 && (
                      <div className="text-center text-gray-400 py-8">
                        <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>AI will automatically take notes during the meeting</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Controls */}
      <div className="bg-gray-800/90 backdrop-blur-sm border-t border-gray-700 p-4 flex-shrink-0">
        <div className="flex justify-center items-center space-x-4">
          <button
            onClick={toggleAudio}
            className={`p-4 rounded-full transition-all ${
              !isAudioEnabled 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {isAudioEnabled ? (
              <Mic className="w-6 h-6 text-white" />
            ) : (
              <MicOff className="w-6 h-6 text-white" />
            )}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-4 rounded-full transition-all ${
              !isVideoEnabled 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {isVideoEnabled ? (
              <Video className="w-6 h-6 text-white" />
            ) : (
              <VideoOff className="w-6 h-6 text-white" />
            )}
          </button>

          <button
            onClick={handleLeave}
            className="p-4 rounded-full bg-red-500 hover:bg-red-600 transition-all"
          >
            <PhoneOff className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>

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
                  <h2 className="text-xl font-bold text-white">Invite Others</h2>
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Room Name
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={roomName}
                        readOnly
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white"
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
                    <label className="block text-sm font-medium text-white mb-2">
                      Meeting Link
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={`${window.location.origin}/meetings?room=${encodeURIComponent(roomName)}`}
                        readOnly
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm"
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

                  <div className="text-xs text-gray-400">
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