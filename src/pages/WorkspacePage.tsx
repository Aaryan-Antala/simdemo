import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Hash, Users, Plus, Settings, Calendar, CheckSquare, MessageSquare, Upload, Paperclip, Video, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase, workspaceAPI, type Channel, type Message, type Task } from '../lib/supabase';
import ThemeToggle from '../components/ThemeToggle';
import ChatPanel from '../components/ChatPanel';
import ChannelList from '../components/ChannelList';
import TaskPanel from '../components/TaskPanel';
import CalendarPanel from '../components/CalendarPanel';
import MeetingControls from '../components/MeetingControls';
import GlassCard from '../components/ui/GlassCard';
import Button from '../components/ui/Button';

const WorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [channels, setChannels] = useState<(Channel & { is_member?: boolean })[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activePanel, setActivePanel] = useState<'chat' | 'tasks' | 'calendar' | 'meeting'>('chat');
  const [loading, setLoading] = useState(true);
  const [currentMeeting, setCurrentMeeting] = useState<{
    roomName: string;
    displayName: string;
  } | null>(null);
  const [showJoinMeetingModal, setShowJoinMeetingModal] = useState(false);
  const [joinMeetingData, setJoinMeetingData] = useState({
    roomName: '',
    displayName: user?.full_name || ''
  });

  useEffect(() => {
    if (user) {
      loadChannels();
      loadTasks();
    }
  }, [user]);

  useEffect(() => {
    if (activeChannel) {
      loadMessages(activeChannel.id);
      
      // Subscribe to real-time messages for this channel
      const subscription = workspaceAPI.subscribeToChannel(activeChannel.id, (payload) => {
        console.log('Real-time message update:', payload);
        if (payload.eventType === 'INSERT') {
          // Fetch the complete message with sender info
          loadMessages(activeChannel.id);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [activeChannel]);

  useEffect(() => {
    if (!user) return;

    // Subscribe to real-time task updates
    const taskSubscription = workspaceAPI.subscribeToTasks(user.id, (payload) => {
      console.log('Real-time task update:', payload);
      loadTasks();
    });

    // Subscribe to real-time channel updates
    const channelSubscription = workspaceAPI.subscribeToChannels(user.id, (payload) => {
      console.log('Real-time channel update:', payload);
      loadChannels();
    });

    return () => {
      taskSubscription.unsubscribe();
      channelSubscription.unsubscribe();
    };
  }, [user]);

  const loadChannels = async () => {
    if (!user) return;
    
    try {
      const response = await fetch(`${import.meta.env.VITE_WORKSPACE_API_URL}/api/workspace/channels/${user.id}`, {
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setChannels(data.channels);
        
        // Set first channel as active if none selected
        if (data.channels.length > 0 && !activeChannel) {
          const memberChannels = data.channels.filter((c: any) => c.is_member);
          if (memberChannels.length > 0) {
            setActiveChannel(memberChannels[0]);
          }
        }
      }
    } catch (error) {
      console.error('Error loading channels:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (channelId: string) => {
    try {
      const messageData = await workspaceAPI.getMessagesForChannel(channelId);
      setMessages(messageData);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const loadTasks = async () => {
    if (!user) return;
    
    try {
      const taskData = await workspaceAPI.getUserTasks(user.id);
      setTasks(taskData);
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  };

  const handleBack = () => {
    navigate('/dashboard');
  };

  const handleChannelSelect = (channel: Channel) => {
    // Add a smooth transition effect when changing channels
    if (activeChannel?.id !== channel.id) {
      // If it's a different channel, create a smooth transition
      // Slight delay to allow transition to complete
      setTimeout(() => {
        loadMessages(channel.id);
      }, 100);
      setActiveChannel(channel);
    } else {
      // If it's the same channel, just reload messages
      loadMessages(channel.id);
    }
    setActivePanel('chat'); // Always switch to chat when selecting a channel
  };

  const uploadFile = async (file: File): Promise<string> => {
    // In a real implementation, you would upload to a cloud storage service
    // For now, we'll create a mock URL
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockUrl = `https://example.com/uploads/${file.name}`;
        resolve(mockUrl);
      }, 1000);
    });
  };

  const handleSendMessage = async (content: string, mentions: string[] = [], attachments: File[] = []) => {
    if (!activeChannel || !user) return;

    try {
      // Upload attachments first
      const uploadedAttachments = [];
      for (const file of attachments) {
        const url = await uploadFile(file);
        uploadedAttachments.push({
          id: Date.now().toString() + Math.random(),
          name: file.name,
          type: file.type,
          size: file.size,
          url: url
        });
      }

      // Send message to database
      const { data: messageData, error } = await supabase
        .from('messages')
        .insert({
          channel_id: activeChannel.id,
          sender_id: user.id,
          content,
          type: 'text',
          metadata: uploadedAttachments.length > 0 ? { attachments: uploadedAttachments } : {}
        })
        .select(`
          *,
          sender:profiles(*)
        `)
        .single();

      if (error) {
        console.error('Error sending message:', error);
        return;
      }

      // Process with AI for task detection (only for text messages)
      if (content && content !== '[Media]') {
        await processMessageForTasks(messageData, mentions);
      }

    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_WORKSPACE_API_URL}/api/workspace/messages/${messageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          userId: user?.id,
          content: newContent
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Reload messages to show the edit
        if (activeChannel) {
          loadMessages(activeChannel.id);
        }
      } else {
        console.error('Error editing message:', data.error);
      }
    } catch (error) {
      console.error('Error editing message:', error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_WORKSPACE_API_URL}/api/workspace/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          userId: user?.id
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Reload messages to reflect the deletion
        if (activeChannel) {
          loadMessages(activeChannel.id);
        }
      } else {
        console.error('Error deleting message:', data.error);
      }
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  const processMessageForTasks = async (message: Message, mentions: string[]) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_WORKSPACE_API_URL}/api/workspace/process-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: message.content,
          messageId: message.id,
          channelId: message.channel_id,
          senderId: message.sender_id,
          mentions,
          userId: user?.id
        })
      });

      const data = await response.json();
      
      if (data.success && data.taskCreated) {
        // Reload tasks to show the new one
        loadTasks();
        
        // Add AI confirmation message
        const { data: aiMessage } = await supabase
          .from('messages')
          .insert({
            channel_id: activeChannel?.id,
            sender_id: user?.id, // System message
            content: `✅ Task created: "${data.task.title}"${data.task.assignee ? ` assigned to ${data.task.assignee}` : ''}`,
            type: 'ai_task_creation',
            metadata: { task_id: data.task.id }
          })
          .select(`
            *,
            sender:profiles(*)
          `)
          .single();

        if (aiMessage) {
          // The real-time subscription will handle adding this message
        }
      }
    } catch (error) {
      console.error('Error processing message for tasks:', error);
    }
  };

  const handleCreateChannel = async (name: string, description: string, type: 'public' | 'private', password?: string) => {
    if (!user) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_WORKSPACE_API_URL}/api/workspace/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name,
          description,
          type,
          password,
          userId: user.id
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Reload channels
        loadChannels();
      } else {
        console.error('Error creating channel:', data.error);
        alert(data.error);
      }
    } catch (error) {
      console.error('Error creating channel:', error);
    }
  };

  const handleJoinChannel = async (channelId: string, password?: string) => {
    if (!user) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_WORKSPACE_API_URL}/api/workspace/channels/${channelId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          userId: user.id,
          password
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Reload channels to update membership
        loadChannels();
      } else {
        console.error('Error joining channel:', data.error);
        alert(data.error);
      }
    } catch (error) {
      console.error('Error joining channel:', error);
    }
  };

  const handleLeaveChannel = async (channelId: string) => {
    if (!user) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_WORKSPACE_API_URL}/api/workspace/channels/${channelId}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          userId: user.id
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // If the left channel was active, switch to another channel
        if (activeChannel?.id === channelId) {
          const remainingChannels = channels.filter(c => c.id !== channelId && c.is_member);
          setActiveChannel(remainingChannels.length > 0 ? remainingChannels[0] : null);
        }

        // Reload channels
        loadChannels();
      } else {
        console.error('Error leaving channel:', data.error);
        alert(data.error);
      }
    } catch (error) {
      console.error('Error leaving channel:', error);
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_WORKSPACE_API_URL}/api/workspace/channels/${channelId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          userId: user?.id
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // If the deleted channel was active, switch to another channel
        if (activeChannel?.id === channelId) {
          const remainingChannels = channels.filter(c => c.id !== channelId);
          setActiveChannel(remainingChannels.length > 0 ? remainingChannels[0] : null);
        }

        // Reload channels
        loadChannels();
      } else {
        console.error('Error deleting channel:', data.error);
        alert(data.error);
      }
    } catch (error) {
      console.error('Error deleting channel:', error);
    }
  };

  const handleSummarizeChannel = async (channelId: string) => {
    if (!user) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_WORKSPACE_API_URL}/api/workspace/summarize-channel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          channelId,
          userId: user.id,
          timeframe: '24h'
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Add summary message to the channel
        await supabase
          .from('messages')
          .insert({
            channel_id: channelId,
            sender_id: user.id,
            content: `📊 **Channel Summary (Last 24h)**\n\n${data.summary}`,
            type: 'ai_summary',
            metadata: { 
              summary: true,
              messageCount: data.messageCount,
              timeframe: data.timeframe
            }
          });

        // Reload messages if this is the active channel
        if (activeChannel?.id === channelId) {
          loadMessages(channelId);
        }
      } else {
        console.error('Error summarizing channel:', data.error);
        alert(data.error);
      }
    } catch (error) {
      console.error('Error summarizing channel:', error);
    }
  };

  const handleStartMeeting = (channelName: string) => {
    const roomName = `${channelName}-${Date.now()}`;
    setCurrentMeeting({
      roomName,
      displayName: user?.full_name || 'User'
    });
    setActivePanel('meeting');
  };

  const handleJoinMeeting = () => {
    setShowJoinMeetingModal(true);
  };

  const handleJoinMeetingSubmit = () => {
    if (!joinMeetingData.roomName.trim() || !joinMeetingData.displayName.trim()) return;
    
    setCurrentMeeting({
      roomName: joinMeetingData.roomName.trim(),
      displayName: joinMeetingData.displayName.trim()
    });
    setActivePanel('meeting');
    setShowJoinMeetingModal(false);
  };

  const handleLeaveMeeting = () => {
    setCurrentMeeting(null);
    setActivePanel('chat');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="glass-panel rounded-2xl p-8 max-w-md mx-auto text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gold-text border-t-transparent rounded-full mx-auto mb-4"></div>
          <h3 className="text-xl font-bold text-primary mb-2">Loading Workspace...</h3>
          <p className="text-secondary">Setting up your collaborative environment</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-primary flex flex-col overflow-hidden">
      {/* Header - Fixed */}
      <header className="glass-panel border-0 border-b silver-border flex-shrink-0">
        <div className="max-w-full px-6">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <motion.button
                onClick={handleBack}
                className="glass-panel p-2 rounded-full glass-panel-hover"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft className="w-5 h-5 text-secondary" />
              </motion.button>
              <div>
                <h1 className="text-lg font-bold gradient-gold-silver">
                  Workspace
                </h1>
                <p className="text-xs text-secondary">
                  {activeChannel?.name || 'Select a channel'} • Media sharing enabled
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* Panel Toggle Buttons */}
              <div className="flex items-center space-x-1 glass-panel rounded-lg p-1">
                <button
                  onClick={() => setActivePanel('chat')}
                  className={`p-2 rounded-md transition-all ${
                    activePanel === 'chat' 
                      ? 'bg-gradient-gold-silver text-white' 
                      : 'text-secondary hover:text-primary'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActivePanel('tasks')}
                  className={`p-2 rounded-md transition-all ${
                    activePanel === 'tasks' 
                      ? 'bg-gradient-gold-silver text-white' 
                      : 'text-secondary hover:text-primary'
                  }`}
                >
                  <CheckSquare className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActivePanel('calendar')}
                  className={`p-2 rounded-md transition-all ${
                    activePanel === 'calendar' 
                      ? 'bg-gradient-gold-silver text-white' 
                      : 'text-secondary hover:text-primary'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActivePanel('meeting')}
                  className={`p-2 rounded-md transition-all ${
                    activePanel === 'meeting' 
                      ? 'bg-gradient-gold-silver text-white' 
                      : 'text-secondary hover:text-primary'
                  }`}
                >
                  <Video className="w-4 h-4" />
                </button>
              </div>
              
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Fixed height with internal scrolling */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Fixed height with internal scrolling */}
        <div className="w-80 glass-panel border-r silver-border flex flex-col h-full">
          <ChannelList
            channels={channels}
            activeChannel={activeChannel}
            onChannelSelect={handleChannelSelect}
            onCreateChannel={handleCreateChannel}
            onJoinChannel={handleJoinChannel}
            onLeaveChannel={handleLeaveChannel}
            onDeleteChannel={handleDeleteChannel}
            onSummarizeChannel={handleSummarizeChannel}
            onStartMeeting={handleStartMeeting}
            onJoinMeeting={handleJoinMeeting}
          />
        </div>

        {/* Main Panel - Dynamic content with fixed positioning */}
        <div className="flex-1 flex flex-col h-full">
          <AnimatePresence mode="wait">
            {activePanel === 'chat' && (
              <motion.div 
                key="chat-panel"
                className="flex-1 flex flex-col h-full"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <ChatPanel
                  channel={activeChannel}
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  onEditMessage={handleEditMessage}
                  onDeleteMessage={handleDeleteMessage}
                />
              </motion.div>
            )}
            
            {activePanel === 'tasks' && (
              <motion.div 
                key="tasks-panel"
                className="flex-1 overflow-hidden"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <TaskPanel
                  tasks={tasks}
                  onTaskUpdate={loadTasks}
                />
              </motion.div>
            )}
            
            {activePanel === 'calendar' && (
              <motion.div 
                key="calendar-panel"
                className="flex-1 overflow-hidden"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <CalendarPanel
                  tasks={tasks}
                />
              </motion.div>
            )}

            {activePanel === 'meeting' && (
              <motion.div 
                key="meeting-panel"
                className="flex-1 flex flex-col"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {currentMeeting ? (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="max-w-2xl mx-auto text-center">
                      <GlassCard className="p-12" goldBorder>
                        <Video className="w-24 h-24 text-secondary mx-auto mb-8 opacity-50" />
                        <h2 className="text-3xl font-bold gradient-gold-silver mb-6">
                          Meeting Ready
                        </h2>
                        <div className="space-y-4 text-left">
                          <div className="glass-panel p-4 rounded-lg">
                            <h3 className="font-bold text-primary mb-2">Meeting Details:</h3>
                            <p className="text-secondary">Room: {currentMeeting.roomName}</p>
                            <p className="text-secondary">Display Name: {currentMeeting.displayName}</p>
                          </div>
                          <div className="glass-panel p-4 rounded-lg bg-blue-500/10 border-blue-500/30">
                            <h3 className="font-bold text-blue-400 mb-2">Ready for Integration:</h3>
                            <p className="text-secondary text-sm">
                              This is where your new video service will be integrated. 
                              The meeting controls and room management are ready.
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={handleLeaveMeeting}
                          variant="secondary"
                          className="mt-6"
                        >
                          Leave Meeting
                        </Button>
                      </GlassCard>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="max-w-2xl mx-auto text-center">
                      <Video className="w-16 h-16 text-secondary mx-auto mb-6 opacity-50" />
                      <h3 className="text-2xl font-bold text-primary mb-4">Video Meetings</h3>
                      <p className="text-secondary mb-8">
                        Start or join a video meeting with your team members
                      </p>
                      <div className="flex justify-center space-x-4">
                        <Button
                          onClick={() => handleStartMeeting('workspace')}
                          variant="premium"
                          className="flex items-center space-x-2"
                        >
                          <Video className="w-4 h-4" />
                          <span>Start Meeting</span>
                        </Button>
                        <Button
                          onClick={handleJoinMeeting}
                          variant="secondary"
                          className="flex items-center space-x-2"
                        >
                          <UserPlus className="w-4 h-4" />
                          <span>Join Meeting</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Join Meeting Modal */}
      {showJoinMeetingModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md"
          >
            <GlassCard className="p-8" goldBorder>
              <h2 className="text-2xl font-bold gradient-gold-silver mb-6">Join Meeting</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-primary mb-2">
                    Your Display Name
                  </label>
                  <input
                    type="text"
                    value={joinMeetingData.displayName}
                    onChange={(e) => setJoinMeetingData(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="Enter your name"
                    className="w-full glass-panel rounded-lg px-4 py-3 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-primary mb-2">
                    Meeting Room Name
                  </label>
                  <input
                    type="text"
                    value={joinMeetingData.roomName}
                    onChange={(e) => setJoinMeetingData(prev => ({ ...prev, roomName: e.target.value }))}
                    placeholder="Enter room name to join"
                    className="w-full glass-panel rounded-lg px-4 py-3 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                  <p className="text-xs text-secondary mt-1">
                    Ask the meeting host for the room name
                  </p>
                </div>

                <div className="flex space-x-4">
                  <Button
                    onClick={() => setShowJoinMeetingModal(false)}
                    variant="secondary"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleJoinMeetingSubmit}
                    variant="premium"
                    className="flex-1"
                    disabled={!joinMeetingData.displayName.trim() || !joinMeetingData.roomName.trim()}
                  >
                    Join Meeting
                  </Button>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default WorkspacePage;