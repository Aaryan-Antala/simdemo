import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Device } from 'mediasoup-client';
import io from 'socket.io-client';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Bot, NutOff as BotOff, FileText, Download, Users, Settings, Share2, Copy, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [meetingSummary, setMeetingSummary] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [producers, setProducers] = useState<Map<string, any>>(new Map());
  const [consumers, setConsumers] = useState<Map<string, any>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<string>('Connecting...');
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [producerToPeer, setProducerToPeer] = useState<Map<string, string>>(new Map());
  const [copied, setCopied] = useState(false);

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
      displayName: peerDisplayName 
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
  };

  const handleExistingPeers = (existingPeers: any[]) => {
    console.log('Existing peers:', existingPeers);
    const newPeers = new Map();
    existingPeers.forEach(peer => {
      newPeers.set(peer.id, peer);
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
        
        // Also pause/resume the audio producer
        const audioProducer = producers.get('audio');
        if (audioProducer) {
          if (audioTrack.enabled) {
            audioProducer.resume();
          } else {
            audioProducer.pause();
          }
        }
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        
        // Also pause/resume the video producer
        const videoProducer = producers.get('video');
        if (videoProducer) {
          if (videoTrack.enabled) {
            videoProducer.resume();
          } else {
            videoProducer.pause();
          }
        }
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
  // This effect runs when the video ref finally becomes available
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
    }, 100); // Retry every 100ms until video ref appears

    return () => clearInterval(interval);
  }, [localStream, isVideoEnabled]);

  // Log all socket events for debugging
  useEffect(() => {
    if (!socketRef.current) return;
    const socket = socketRef.current;
    const logEvent = (event: string) => (...args: any[]) => {
      console.log(`[SOCKET EVENT] ${event}:`, ...args);
    };
    const events = [
      'routerRtpCapabilities',
      'webRtcTransportCreated',
      'transportConnected',
      'produced',
      'consumed',
      'consumerResumed',
      'producers',
      'existingProducers',
      'newProducer',
      'peerJoined',
      'peerLeft',
      'existingPeers',
      'consumerClosed',
      'cannotConsume',
      'error'
    ];
    events.forEach(event => socket.on(event, logEvent(event)));
    return () => {
      events.forEach(event => socket.off(event, logEvent(event)));
    };
  }, [socketRef.current]);

  // Add handleLeave function
  const handleLeave = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    onLeave();
  };

  // Calculate video grid layout
  const totalParticipants = peers.size + 1; // +1 for local user
  const getVideoGridCols = () => {
    if (totalParticipants === 1) return 1;
    if (totalParticipants === 2) return 2;
    if (totalParticipants <= 4) return 2;
    if (totalParticipants <= 6) return 3;
    return 4;
  };

  const getVideoGridRows = () => {
    const cols = getVideoGridCols();
    return Math.ceil(totalParticipants / cols);
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
    <div className="h-screen flex flex-col bg-primary overflow-hidden">
      {/* Meeting Header - Fixed at top */}
      <div className="glass-panel border-b silver-border p-4 flex-shrink-0 z-50">
        <div className="flex items-center justify-between">
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
                variant={showTranscript ? "premium" : "secondary"}
                size="sm"
                className="flex items-center space-x-2"
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Transcript ({transcript.length})</span>
              </Button>
            )}

            {/* Notes Toggle */}
            {isAIEnabled && (
              <Button
                onClick={() => setShowNotes(!showNotes)}
                variant={showNotes ? "premium" : "secondary"}
                size="sm"
                className="flex items-center space-x-2"
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Notes ({notes.length})</span>
              </Button>
            )}

            {/* Invite Others Button */}
            <Button
              onClick={() => setShowInviteModal(true)}
              variant="secondary"
              size="sm"
              className="flex items-center space-x-2"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Invite</span>
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
        {/* Video Grid Area */}
        <div className={`flex-1 p-4 transition-all duration-300 ${
          (showTranscript || showNotes) ? 'mr-0' : ''
        }`}>
          <div 
            className={`grid gap-4 h-full`}
            style={{
              gridTemplateColumns: `repeat(${getVideoGridCols()}, 1fr)`,
              gridTemplateRows: `repeat(${getVideoGridRows()}, 1fr)`
            }}
          >
            {/* Local Video */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative glass-panel rounded-lg overflow-hidden group aspect-video"
            >
              <video
                ref={handleLocalVideoRef}
                key={
                  localStream && localStream.getVideoTracks().length > 0
                    ? localStream.getVideoTracks()[0].id
                    : 'no-video'
                }
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                style={{
                  display: isVideoEnabled ? 'block' : 'none',
                  background: '#222',
                }}
              />
              {!isVideoEnabled && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <div className="text-center">
                    <VideoOff className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Camera Off</p>
                  </div>
                </div>
              )}
              <div className="absolute bottom-2 left-2 glass-panel px-3 py-1 rounded-full text-sm">
                <span className="text-primary font-medium">{displayName} (You)</span>
              </div>
              {/* Audio indicator */}
              <div className="absolute top-2 right-2">
                {!isAudioEnabled && (
                  <div className="glass-panel p-1 rounded-full bg-red-500/20">
                    <MicOff className="w-4 h-4 text-red-400" />
                  </div>
                )}
              </div>
            </motion.div>

            {/* Remote Videos */}
            {Array.from(peers.values()).map((peer, index) => (
              <motion.div
                key={peer.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className="relative glass-panel rounded-lg overflow-hidden group aspect-video"
              >
                <video
                  id={`remote-video-${peer.id}`}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <audio
                  id={`remote-audio-${peer.id}`}
                  autoPlay
                  playsInline
                />
                <div className="absolute bottom-2 left-2 glass-panel px-3 py-1 rounded-full text-sm">
                  <span className="text-primary font-medium">{peer.displayName}</span>
                </div>
              </motion.div>
            ))}

            {/* Placeholder for when no remote participants */}
            {peers.size === 0 && totalParticipants === 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="relative glass-panel rounded-lg overflow-hidden flex items-center justify-center col-span-full aspect-video"
              >
                <div className="text-center">
                  <Users className="w-16 h-16 text-secondary mx-auto mb-4 opacity-50" />
                  <p className="text-secondary text-lg mb-2">Waiting for others to join...</p>
                  <p className="text-xs text-secondary">Share the room name: <span className="font-medium text-primary">{roomName}</span></p>
                </div>
              </motion.div>
            )}
          </div>

          {/* AI Status Overlay */}
          {isAIEnabled && (
            <div className="absolute top-20 left-8 glass-panel px-3 py-2 rounded-lg z-40">
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
            <div className="absolute top-20 right-8 glass-panel px-3 py-2 rounded-lg z-40">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-gold-text border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-primary">Processing...</span>
              </div>
            </div>
          )}
        </div>

        {/* Transcript Panel */}
        <AnimatePresence>
          {showTranscript && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="glass-panel border-l silver-border flex flex-col h-full"
            >
              <div className="p-4 border-b silver-border flex-shrink-0">
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
                      <X className="w-4 h-4" />
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
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="glass-panel border-l silver-border flex flex-col h-full"
            >
              <div className="p-4 border-b silver-border flex-shrink-0">
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
                      <X className="w-4 h-4" />
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