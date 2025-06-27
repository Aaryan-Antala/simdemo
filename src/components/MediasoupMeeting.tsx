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
  videoStream?: MediaStream;
  audioStream?: MediaStream;
  hasVideo: boolean;
  hasAudio: boolean;
}

const MediasoupMeeting: React.FC<MediasoupMeetingProps> = ({ roomName, displayName, onLeave }) => {
  const socketRef = useRef<any>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  
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
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [producers, setProducers] = useState<Map<string, any>>(new Map());
  const [consumers, setConsumers] = useState<Map<string, any>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<string>('Connecting...');
  const [copied, setCopied] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // Enhanced logging function
  const addDebugLog = useCallback((message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage, data || '');
    setDebugLogs(prev => [...prev.slice(-50), logMessage]); // Keep last 50 logs
  }, []);

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

  // Initialize socket connection
  useEffect(() => {
    addDebugLog('🚀 Initializing Mediasoup meeting', { roomName, displayName, mediaApiUrl: VITE_MEDIA_API_URL });
    setConnectionStatus('Connecting to server...');
    
    socketRef.current = io(`${VITE_MEDIA_API_URL}`, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });
    
    socketRef.current.on('connect', () => {
      addDebugLog('✅ Connected to mediasoup server', { socketId: socketRef.current.id });
      setConnectionStatus('Joining room...');
      joinRoom();
    });

    socketRef.current.on('disconnect', (reason: string) => {
      addDebugLog('❌ Disconnected from mediasoup server', { reason });
      setConnectionStatus('Disconnected');
      setIsConnected(false);
    });

    socketRef.current.on('connect_error', (error: any) => {
      addDebugLog('🔥 Connection error', { error: error.message, stack: error.stack });
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
      addDebugLog('🧹 Cleaning up Mediasoup meeting');
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (localStream) {
        localStream.getTracks().forEach(track => {
          addDebugLog('🛑 Stopping local track', { kind: track.kind, id: track.id });
          track.stop();
        });
      }
      videoElementsRef.current.clear();
      audioElementsRef.current.clear();
    };
  }, [roomName, displayName, addDebugLog]);

  const joinRoom = () => {
    addDebugLog('🏠 Joining room', { roomName, displayName });
    socketRef.current.emit('join-room', {
      roomId: roomName,
      displayName: displayName
    });
  };

  const handleRouterRtpCapabilities = async (rtpCapabilities: any) => {
    try {
      addDebugLog('📡 Received router RTP capabilities', { 
        codecsCount: rtpCapabilities.codecs?.length,
        headerExtensionsCount: rtpCapabilities.headerExtensions?.length 
      });
      setConnectionStatus('Initializing device...');
      
      deviceRef.current = new Device();
      await deviceRef.current.load({ routerRtpCapabilities: rtpCapabilities });
      addDebugLog('✅ Device loaded successfully', { 
        canProduce: {
          audio: deviceRef.current.canProduce('audio'),
          video: deviceRef.current.canProduce('video')
        },
        rtpCapabilities: deviceRef.current.rtpCapabilities
      });
      
      setConnectionStatus('Creating transports...');
      await createTransports();
      
    } catch (error: any) {
      addDebugLog('🔥 Error handling router RTP capabilities', { error: error.message, stack: error.stack });
      setConnectionStatus('Failed to initialize device');
    }
  };

  const createTransports = async () => {
    addDebugLog('🚛 Creating WebRTC transports');
    
    // Create send transport
    addDebugLog('📤 Requesting send transport creation');
    socketRef.current.emit('createWebRtcTransport', { direction: 'send' });
    
    // Create receive transport
    addDebugLog('📥 Requesting receive transport creation');
    socketRef.current.emit('createWebRtcTransport', { direction: 'recv' });
  };

  const handleTransportCreated = async (data: any) => {
    const { id, iceParameters, iceCandidates, dtlsParameters, direction } = data;
    addDebugLog(`🚛 Transport created: ${direction}`, { 
      id, 
      iceParametersCount: iceParameters?.usernameFragment ? 1 : 0,
      iceCandidatesCount: iceCandidates?.length,
      dtlsRole: dtlsParameters?.role,
      dtlsFingerprints: dtlsParameters?.fingerprints?.length
    });
    
    try {
      if (direction === 'send' && !sendTransportRef.current) {
        addDebugLog('📤 Creating send transport on client');
        sendTransportRef.current = deviceRef.current!.createSendTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
        });

        sendTransportRef.current.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
          try {
            addDebugLog('🔗 Send transport connecting', { transportId: id, dtlsRole: dtlsParameters.role });
            socketRef.current.emit('connectTransport', {
              transportId: id,
              dtlsParameters,
            });
            
            const connectPromise = new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Transport connect timeout'));
              }, 10000);
              
              const handler = (data: any) => {
                if (data.transportId === id) {
                  clearTimeout(timeout);
                  socketRef.current.off('transportConnected', handler);
                  resolve(data);
                }
              };
              socketRef.current.on('transportConnected', handler);
            });
            
            await connectPromise;
            addDebugLog('✅ Send transport connected successfully');
            callback();
          } catch (error: any) {
            addDebugLog('🔥 Send transport connect error', { error: error.message });
            errback(error);
          }
        });

        sendTransportRef.current.on('produce', async (parameters: any, callback: any, errback: any) => {
          try {
            addDebugLog('🎬 Producing media', { 
              kind: parameters.kind,
              codecOptions: parameters.codecOptions,
              rtpParameters: {
                codecs: parameters.rtpParameters.codecs?.length,
                encodings: parameters.rtpParameters.encodings?.length
              }
            });
            
            socketRef.current.emit('produce', {
              transportId: id,
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
            });
            
            const producePromise = new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Produce timeout'));
              }, 10000);
              
              const handler = (data: any) => {
                clearTimeout(timeout);
                socketRef.current.off('produced', handler);
                resolve(data);
              };
              socketRef.current.on('produced', handler);
            });
            
            const result: any = await producePromise;
            addDebugLog('✅ Media produced successfully', { producerId: result.id, kind: parameters.kind });
            callback({ id: result.id });
          } catch (error: any) {
            addDebugLog('🔥 Produce error', { error: error.message, kind: parameters.kind });
            errback(error);
          }
        });

        sendTransportRef.current.on('connectionstatechange', (state: string) => {
          addDebugLog(`📤 Send transport connection state: ${state}`);
        });

        sendTransportRef.current.on('icestatechange', (state: string) => {
          addDebugLog(`📤 Send transport ICE state: ${state}`);
        });

        if (recvTransportRef.current) {
          await startProducing();
        }

      } else if (direction === 'recv' && !recvTransportRef.current) {
        addDebugLog('📥 Creating receive transport on client');
        recvTransportRef.current = deviceRef.current!.createRecvTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
        });

        recvTransportRef.current.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
          try {
            addDebugLog('🔗 Receive transport connecting', { transportId: id, dtlsRole: dtlsParameters.role });
            socketRef.current.emit('connectTransport', {
              transportId: id,
              dtlsParameters,
            });
            
            const connectPromise = new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Transport connect timeout'));
              }, 10000);
              
              const handler = (data: any) => {
                if (data.transportId === id) {
                  clearTimeout(timeout);
                  socketRef.current.off('transportConnected', handler);
                  resolve(data);
                }
              };
              socketRef.current.on('transportConnected', handler);
            });
            
            await connectPromise;
            addDebugLog('✅ Receive transport connected successfully');
            callback();
          } catch (error: any) {
            addDebugLog('🔥 Receive transport connect error', { error: error.message });
            errback(error);
          }
        });

        recvTransportRef.current.on('connectionstatechange', (state: string) => {
          addDebugLog(`📥 Receive transport connection state: ${state}`);
          if (state === 'failed') {
            addDebugLog('🔥 CRITICAL: Receive transport failed - checking network connectivity');
            // Log additional debugging info
            addDebugLog('🔍 Network debug info', {
              userAgent: navigator.userAgent,
              connection: (navigator as any).connection,
              onLine: navigator.onLine,
              mediaApiUrl: VITE_MEDIA_API_URL
            });
          }
        });

        recvTransportRef.current.on('icestatechange', (state: string) => {
          addDebugLog(`📥 Receive transport ICE state: ${state}`);
        });

        recvTransportRef.current.on('iceselectedtuplechange', (iceSelectedTuple: any) => {
          addDebugLog('📥 Receive transport ICE selected tuple changed', { iceSelectedTuple });
        });

        if (sendTransportRef.current) {
          await startProducing();
        }
      }
    } catch (error: any) {
      addDebugLog('🔥 Error creating transport', { error: error.message, direction, stack: error.stack });
      setConnectionStatus('Failed to create transport');
    }
  };

  const startProducing = async () => {
    try {
      setConnectionStatus('Getting user media...');
      addDebugLog('🎥 Getting user media');
      
      const constraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        },
      };
      
      addDebugLog('🎥 Requesting media with constraints', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      addDebugLog('✅ Got user media stream', { 
        streamId: stream.id,
        tracks: stream.getTracks().map(track => ({
          kind: track.kind,
          id: track.id,
          enabled: track.enabled,
          readyState: track.readyState,
          settings: track.getSettings()
        }))
      });
      
      setLocalStream(stream);

      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      if (audioTrack && sendTransportRef.current) {
        addDebugLog('🎵 Producing audio track', { 
          trackId: audioTrack.id,
          settings: audioTrack.getSettings(),
          constraints: audioTrack.getConstraints()
        });
        const audioProducer = await sendTransportRef.current.produce({ track: audioTrack });
        setProducers(prev => new Map(prev.set('audio', audioProducer)));
        
        audioProducer.on('trackended', () => {
          addDebugLog('🛑 Audio track ended');
        });

        audioProducer.on('transportclose', () => {
          addDebugLog('🛑 Audio producer transport closed');
        });
      }

      if (videoTrack && sendTransportRef.current) {
        addDebugLog('📹 Producing video track', { 
          trackId: videoTrack.id,
          settings: videoTrack.getSettings(),
          constraints: videoTrack.getConstraints()
        });
        const videoProducer = await sendTransportRef.current.produce({ track: videoTrack });
        setProducers(prev => new Map(prev.set('video', videoProducer)));
        
        videoProducer.on('trackended', () => {
          addDebugLog('🛑 Video track ended');
        });

        videoProducer.on('transportclose', () => {
          addDebugLog('🛑 Video producer transport closed');
        });
      }

      setConnectionStatus('Connected');
      setIsConnected(true);
      addDebugLog('🎉 Successfully connected and producing media');

    } catch (error: any) {
      addDebugLog('🔥 Error starting production', { error: error.message, stack: error.stack });
      setConnectionStatus('Media access denied');
    }
  };

  // Effect to handle local video stream attachment
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      addDebugLog('📺 Attaching local stream to video element', { 
        streamId: localStream.id,
        videoElement: !!localVideoRef.current
      });
      const videoElement = localVideoRef.current;
      
      videoElement.srcObject = localStream;
      videoElement.muted = true;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            addDebugLog('✅ Local video playing successfully', {
              videoWidth: videoElement.videoWidth,
              videoHeight: videoElement.videoHeight,
              duration: videoElement.duration
            });
          })
          .catch(error => {
            addDebugLog('🔥 Local video play failed', { error: error.message });
          });
      }
    }
  }, [localStream, addDebugLog]);

  const handleTransportConnected = (data: any) => {
    addDebugLog('✅ Transport connected confirmation', data);
  };

  const handleProduced = (data: any) => {
    addDebugLog('✅ Producer created confirmation', data);
  };

  const handleConsumed = async (data: any) => {
    const { id, producerId, kind, rtpParameters, peerId } = data;
    addDebugLog(`🍽️ Consuming media`, { 
      consumerId: id, 
      producerId, 
      kind, 
      peerId,
      rtpParameters: {
        codecs: rtpParameters.codecs?.length,
        encodings: rtpParameters.encodings?.length
      }
    });

    try {
      if (!recvTransportRef.current) {
        addDebugLog('🔥 Receive transport not ready for consuming');
        return;
      }

      const consumer = await recvTransportRef.current.consume({
        id,
        producerId,
        kind,
        rtpParameters,
      });

      addDebugLog(`✅ Consumer created successfully`, { 
        consumerId: consumer.id, 
        peerId,
        track: {
          id: consumer.track.id,
          kind: consumer.track.kind,
          enabled: consumer.track.enabled,
          readyState: consumer.track.readyState,
          settings: consumer.track.getSettings()
        }
      });
      
      setConsumers(prev => new Map(prev.set(id, consumer)));

      // Resume the consumer immediately
      addDebugLog(`▶️ Resuming consumer`, { consumerId: id });
      socketRef.current.emit('resumeConsumer', { consumerId: id });

      // Create stream and update peer state
      const stream = new MediaStream([consumer.track]);
      addDebugLog(`🌊 Created stream for peer`, { 
        peerId, 
        streamId: stream.id,
        kind,
        trackCount: stream.getTracks().length
      });
      
      // Update peer with stream info
      setPeers(prev => {
        const newPeers = new Map(prev);
        const existingPeer = newPeers.get(peerId);
        
        const peer: Peer = {
          id: peerId,
          displayName: existingPeer?.displayName || `User ${peerId.slice(0, 8)}`,
          hasVideo: existingPeer?.hasVideo || false,
          hasAudio: existingPeer?.hasAudio || false,
          videoStream: existingPeer?.videoStream,
          audioStream: existingPeer?.audioStream
        };

        if (kind === 'video') {
          peer.videoStream = stream;
          peer.hasVideo = true;
          addDebugLog(`📹 Updated peer with video stream`, { peerId, streamId: stream.id });
        } else if (kind === 'audio') {
          peer.audioStream = stream;
          peer.hasAudio = true;
          addDebugLog(`🎵 Updated peer with audio stream`, { peerId, streamId: stream.id });
        }

        newPeers.set(peerId, peer);
        return newPeers;
      });

      consumer.on('transportclose', () => {
        addDebugLog('🛑 Consumer transport closed', { consumerId: consumer.id, peerId });
        consumer.close();
        setConsumers(prev => {
          const map = new Map(prev);
          map.delete(id);
          return map;
        });
      });

      consumer.on('producerclose', () => {
        addDebugLog('🛑 Consumer producer closed', { consumerId: consumer.id, peerId });
        consumer.close();
        setConsumers(prev => {
          const map = new Map(prev);
          map.delete(id);
          return map;
        });
      });

    } catch (error: any) {
      addDebugLog('🔥 Error consuming media', { error: error.message, consumerId: id, peerId, stack: error.stack });
    }
  };

  const handleProducers = (producers: any[]) => {
    addDebugLog('📋 Received existing producers list', { count: producers.length, producers });
    if (!producers || producers.length === 0) return;
    
    producers.forEach(({ peerId, producerId, kind }) => {
      if (peerId && producerId) {
        addDebugLog(`🔄 Consuming existing producer`, { producerId, kind, peerId });
        consume(producerId, peerId);
      }
    });
  };

  const handleExistingProducers = (producers: any[]) => {
    addDebugLog('📋 Received existing producers on join', { count: producers.length });
    handleProducers(producers);
  };

  const handleNewProducer = ({ peerId, producerId, kind }: any) => {
    addDebugLog(`🆕 New producer available`, { peerId, producerId, kind });
    if (!peerId || !producerId) return;
    consume(producerId, peerId);
  };

  const handleConsumerResumed = (data: any) => {
    addDebugLog('▶️ Consumer resumed successfully', data);
  };

  const consume = (producerId: string, peerId: string) => {
    if (!recvTransportRef.current || !deviceRef.current) {
      addDebugLog('🔥 Cannot consume: transport or device not ready', { 
        hasRecvTransport: !!recvTransportRef.current,
        hasDevice: !!deviceRef.current
      });
      return;
    }

    addDebugLog(`🍽️ Requesting to consume producer`, { producerId, peerId });
    socketRef.current.emit('consume', {
      transportId: recvTransportRef.current.id,
      producerId,
      rtpCapabilities: deviceRef.current.rtpCapabilities,
    });
  };

  const handlePeerJoined = ({ peerId, displayName: peerDisplayName }: any) => {
    addDebugLog(`👋 Peer joined`, { peerId, displayName: peerDisplayName });
    setPeers(prev => {
      const newPeers = new Map(prev);
      const existingPeer = newPeers.get(peerId);
      
      newPeers.set(peerId, {
        id: peerId,
        displayName: peerDisplayName,
        hasVideo: existingPeer?.hasVideo || false,
        hasAudio: existingPeer?.hasAudio || false,
        videoStream: existingPeer?.videoStream,
        audioStream: existingPeer?.audioStream
      });
      
      return newPeers;
    });
  };

  const handlePeerLeft = ({ peerId }: any) => {
    addDebugLog(`👋 Peer left`, { peerId });
    
    // Clean up video and audio elements for this peer
    const videoElement = videoElementsRef.current.get(peerId);
    if (videoElement) {
      addDebugLog(`🧹 Cleaning up video element for peer`, { peerId });
      videoElement.srcObject = null;
      videoElementsRef.current.delete(peerId);
    }
    
    const audioElement = audioElementsRef.current.get(peerId);
    if (audioElement) {
      addDebugLog(`🧹 Cleaning up audio element for peer`, { peerId });
      audioElement.srcObject = null;
      audioElementsRef.current.delete(peerId);
    }
    
    setPeers(prev => {
      const newPeers = new Map(prev);
      newPeers.delete(peerId);
      return newPeers;
    });
  };

  const handleExistingPeers = (existingPeers: any[]) => {
    addDebugLog('👥 Received existing peers list', { count: existingPeers.length, peers: existingPeers });
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
    addDebugLog('🛑 Consumer closed by server', { consumerId });
    setConsumers(prev => {
      const newConsumers = new Map(prev);
      newConsumers.delete(consumerId);
      return newConsumers;
    });
  };

  const handleCannotConsume = ({ producerId }: any) => {
    addDebugLog('❌ Cannot consume producer', { producerId });
  };

  const handleError = (error: any) => {
    addDebugLog('🔥 Socket error received', { error: error.message || error, stack: error.stack });
    setConnectionStatus(`Error: ${error.message || 'Unknown error'}`);
  };

  // Video element ref callback for remote peers
  const setVideoRef = useCallback((peer: Peer) => (el: HTMLVideoElement | null) => {
    if (el && peer.videoStream) {
      addDebugLog(`📺 Setting video stream for peer`, { 
        peerId: peer.id, 
        streamId: peer.videoStream.id,
        trackCount: peer.videoStream.getTracks().length
      });
      
      videoElementsRef.current.set(peer.id, el);
      el.srcObject = peer.videoStream;
      el.autoplay = true;
      el.playsInline = true;
      
      const playPromise = el.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            addDebugLog(`✅ Video playing for peer`, { 
              peerId: peer.id,
              videoWidth: el.videoWidth,
              videoHeight: el.videoHeight,
              duration: el.duration
            });
          })
          .catch(error => {
            addDebugLog(`🔥 Error playing video for peer`, { 
              peerId: peer.id, 
              error: error.message 
            });
          });
      }
    }
  }, [addDebugLog]);

  // Audio element ref callback for remote peers
  const setAudioRef = useCallback((peer: Peer) => (el: HTMLAudioElement | null) => {
    if (el && peer.audioStream) {
      addDebugLog(`🎵 Setting audio stream for peer`, { 
        peerId: peer.id, 
        streamId: peer.audioStream.id,
        trackCount: peer.audioStream.getTracks().length
      });
      
      audioElementsRef.current.set(peer.id, el);
      el.srcObject = peer.audioStream;
      el.autoplay = true;
      el.playsInline = true;
      
      const playPromise = el.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            addDebugLog(`✅ Audio playing for peer`, { peerId: peer.id });
          })
          .catch(error => {
            addDebugLog(`🔥 Error playing audio for peer`, { 
              peerId: peer.id, 
              error: error.message 
            });
          });
      }
    }
  }, [addDebugLog]);

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        addDebugLog(`🎵 Audio ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        addDebugLog(`📹 Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
      }
    }
  };

  const handleLeave = () => {
    addDebugLog('👋 Leaving meeting');
    if (localStream) {
      localStream.getTracks().forEach(track => {
        addDebugLog('🛑 Stopping local track', { kind: track.kind, id: track.id });
        track.stop();
      });
    }
    onLeave();
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-primary flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="glass-panel rounded-2xl p-8 max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <div className="animate-spin w-8 h-8 border-2 border-gold-text border-t-transparent rounded-full mx-auto mb-4"></div>
              <h3 className="text-xl font-bold text-primary mb-2">Connecting to Meeting...</h3>
              <p className="text-secondary mb-4">{connectionStatus}</p>
              <div className="text-sm text-secondary">
                <p>Room: <span className="font-medium text-primary">{roomName}</span></p>
                <p>Name: <span className="font-medium text-primary">{displayName}</span></p>
                <p>Server: <span className="font-medium text-primary">{VITE_MEDIA_API_URL}</span></p>
              </div>
            </div>
            
            {/* Debug Logs */}
            <div className="mt-6">
              <h4 className="text-sm font-bold text-primary mb-2">Debug Logs (Last 10):</h4>
              <div className="bg-black/20 rounded-lg p-3 max-h-40 overflow-y-auto">
                {debugLogs.slice(-10).map((log, index) => (
                  <div key={index} className="text-xs text-secondary font-mono mb-1">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-primary">
      {/* Meeting Header - Fixed at top */}
      <div className="glass-panel border-b silver-border p-4 flex-shrink-0 z-50">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-bold gradient-gold-silver">
              Meeting: {roomName}
            </h1>
            <div className="flex items-center space-x-2 text-sm text-secondary">
              <Users className="w-4 h-4" />
              <span>{totalParticipants} participant{totalParticipants !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Debug Toggle */}
            <Button
              onClick={() => setShowTranscript(!showTranscript)}
              variant="secondary"
              size="sm"
              className="flex items-center space-x-2"
            >
              <FileText className="w-4 h-4" />
              <span>Debug ({debugLogs.length})</span>
            </Button>

            <Button
              onClick={() => setShowInviteModal(true)}
              variant="secondary"
              size="sm"
              className="flex items-center space-x-2"
            >
              <Share2 className="w-4 h-4" />
              <span>Invite Others</span>
            </Button>

            <Button
              onClick={handleLeave}
              variant="secondary"
              size="sm"
              className="flex items-center space-x-2 bg-red-500/20 border-red-500/50 hover:bg-red-500/30"
            >
              <PhoneOff className="w-4 h-4 text-red-400" />
              <span className="text-red-400">Leave</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Meeting Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Grid */}
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
                  display: isVideoEnabled && localStream ? 'block' : 'none',
                }}
              />
              {(!isVideoEnabled || !localStream) && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-gold-silver flex items-center justify-center mx-auto mb-2">
                      <span className="text-white text-xl font-bold">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-gray-400 text-sm">
                      {!localStream ? 'Connecting...' : 'Camera Off'}
                    </span>
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
                {peer.hasVideo && peer.videoStream && (
                  <video
                    ref={setVideoRef(peer)}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                )}
                {peer.hasAudio && peer.audioStream && (
                  <audio
                    ref={setAudioRef(peer)}
                    autoPlay
                    playsInline
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

        {/* Debug Panel */}
        <AnimatePresence>
          {showTranscript && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="glass-panel border-l silver-border flex flex-col z-30"
            >
              <div className="p-4 border-b silver-border">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-primary">Debug Logs</h3>
                  <div className="flex space-x-2">
                    <Button
                      onClick={() => setDebugLogs([])}
                      variant="ghost"
                      size="sm"
                    >
                      Clear
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
              
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-1">
                  {debugLogs.map((log, index) => (
                    <div key={index} className="text-xs font-mono text-secondary break-all">
                      {log}
                    </div>
                  ))}
                </div>
                
                {debugLogs.length === 0 && (
                  <div className="text-center text-secondary py-8">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Debug logs will appear here</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls - Fixed at bottom */}
      <div className="glass-panel border-t silver-border p-4 flex-shrink-0 z-50">
        <div className="flex justify-center items-center space-x-4">
          <button
            onClick={toggleAudio}
            className={`glass-panel p-4 rounded-full glass-panel-hover transition-all ${
              !isAudioEnabled ? 'bg-red-500/20 border-red-500/50' : ''
            }`}
          >
            {isAudioEnabled ? (
              <Mic className="w-6 h-6 text-primary" />
            ) : (
              <MicOff className="w-6 h-6 text-red-400" />
            )}
          </button>

          <button
            onClick={toggleVideo}
            className={`glass-panel p-4 rounded-full glass-panel-hover transition-all ${
              !isVideoEnabled ? 'bg-red-500/20 border-red-500/50' : ''
            }`}
          >
            {isVideoEnabled ? (
              <Video className="w-6 h-6 text-primary" />
            ) : (
              <VideoOff className="w-6 h-6 text-red-400" />
            )}
          </button>

          <button
            onClick={handleLeave}
            className="glass-panel p-4 rounded-full glass-panel-hover bg-red-500/20 border-red-500/50 hover:bg-red-500/30"
          >
            <PhoneOff className="w-6 h-6 text-red-400" />
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
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/meetings?room=${encodeURIComponent(roomName)}`);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        variant="ghost"
                        size="sm"
                        className="px-3"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
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