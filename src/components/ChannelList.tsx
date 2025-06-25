import React, { useState, useRef, useEffect } from 'react';
import { Hash, Lock, Plus, Users, Search, MessageCircle, Video, Calendar, MoreVertical, FileText, UserPlus, LogOut, Key, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { type Channel } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import GlassCard from './ui/GlassCard';
import Button from './ui/Button';
const VITE_AI_API_URL = import.meta.env.VITE_AI_API_URL;
const VITE_API_URL = import.meta.env.VITE_API_URL;
const VITE_MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL;
const VITE_WORKSPACE_API_URL = import.meta.env.VITE_WORKSPACE_API_URL;
const VITE_APP_URL = import.meta.env.VITE_APP_URL;
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL;

interface ChannelListProps {
  channels: (Channel & { unread_count?: number; is_member?: boolean })[];
  activeChannel: Channel | null;
  onChannelSelect: (channel: Channel) => void;
  onCreateChannel: (name: string, description: string, type: 'public' | 'private', password?: string) => void;
  onDeleteChannel: (channelId: string) => void;
  onJoinChannel: (channelId: string, password?: string) => void;
  onLeaveChannel: (channelId: string) => void;
  onSummarizeChannel: (channelId: string) => void;
  onStartMeeting: (channelName: string) => void;
  onJoinMeeting: () => void;
}

const ChannelList: React.FC<ChannelListProps> = ({
  channels,
  activeChannel,
  onChannelSelect,
  onCreateChannel,
  onDeleteChannel,
  onJoinChannel,
  onLeaveChannel,
  onSummarizeChannel,
  onStartMeeting,
  onJoinMeeting
}) => {
  const { user } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedChannelForJoin, setSelectedChannelForJoin] = useState<Channel | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showChannelMenu, setShowChannelMenu] = useState<string | null>(null);
  const [newChannel, setNewChannel] = useState({
    name: '',
    description: '',
    type: 'public' as 'public' | 'private',
    password: ''
  });
  const [joinPassword, setJoinPassword] = useState('');
  const menuRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showChannelMenu) {
        const menuElement = menuRefs.current[showChannelMenu];
        if (menuElement && !menuElement.contains(event.target as Node)) {
          // Also check if the click was on the trigger button
          const triggerButton = event.target as HTMLElement;
          if (!triggerButton.closest(`[data-channel-menu="${showChannelMenu}"]`)) {
            setShowChannelMenu(null);
          }
        }
      }
    };

    if (showChannelMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showChannelMenu]);

  const filteredChannels = channels.filter(channel =>
    channel.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const publicChannels = filteredChannels.filter(c => c.type === 'public');
  const privateChannels = filteredChannels.filter(c => c.type === 'private');
  const dmChannels = filteredChannels.filter(c => c.type === 'dm');

  const handleCreateChannel = () => {
    if (!newChannel.name.trim()) return;
    
    onCreateChannel(
      newChannel.name, 
      newChannel.description, 
      newChannel.type,
      newChannel.type === 'private' ? newChannel.password : undefined
    );
    setNewChannel({ name: '', description: '', type: 'public', password: '' });
    setShowCreateModal(false);
  };

  const handleJoinChannel = (channel: Channel) => {
    if (channel.type === 'private') {
      setSelectedChannelForJoin(channel);
      setJoinPassword('');
      setShowJoinModal(true);
    } else {
      onJoinChannel(channel.id);
    }
  };

  const handleJoinWithPassword = () => {
    if (!selectedChannelForJoin) return;
    
    onJoinChannel(selectedChannelForJoin.id, joinPassword);
    setShowJoinModal(false);
    setSelectedChannelForJoin(null);
    setJoinPassword('');
  };

  const getChannelIcon = (channel: Channel) => {
    switch (channel.type) {
      case 'private':
        return <Lock className="w-4 h-4" />;
      case 'dm':
        return <MessageCircle className="w-4 h-4" />;
      default:
        return <Hash className="w-4 h-4" />;
    }
  };

  const formatChannelName = (channel: Channel) => {
    if (channel.type === 'dm') {
      return channel.name.replace('DM: ', '');
    }
    return channel.name;
  };

  const canDeleteChannel = (channel: Channel) => {
    return channel.created_by === user?.id && channel.name !== 'general';
  };

  const isMember = (channel: Channel) => {
    return channel.is_member !== false; // Default to true if not specified
  };

  const handleChannelAction = (action: string, channel: Channel) => {
    setShowChannelMenu(null);
    
    switch (action) {
      case 'join':
        handleJoinChannel(channel);
        break;
      case 'leave':
        onLeaveChannel(channel.id);
        break;
      case 'summarize':
        onSummarizeChannel(channel.id);
        break;
      case 'meeting':
        onStartMeeting(channel.name);
        break;
      case 'delete':
        if (canDeleteChannel(channel) && confirm(`Are you sure you want to delete #${channel.name}?`)) {
          onDeleteChannel(channel.id);
        }
        break;
    }
  };

  const renderChannelItem = (channel: Channel) => {
    const isChannelMember = isMember(channel);
    
    return (
      <motion.div
        key={channel.id}
        className="group relative"
        whileHover={{ x: 4 }}
        whileTap={{ scale: 0.98 }}
      >
        <button
          onClick={() => isChannelMember ? onChannelSelect(channel) : handleJoinChannel(channel)}
          className={`w-full flex items-center space-x-3 p-3 rounded-lg text-left transition-all relative ${
            activeChannel?.id === channel.id
              ? 'bg-gradient-gold-silver text-white'
              : isChannelMember
              ? 'text-secondary hover:text-primary hover:bg-surface'
              : 'text-secondary opacity-60 hover:opacity-80'
          }`}
        >
          {getChannelIcon(channel)}
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate flex items-center space-x-2">
              <span>{formatChannelName(channel)}</span>
              {!isChannelMember && (
                <span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded-full">
                  Join
                </span>
              )}
            </div>
            {channel.description && (
              <div className="text-xs opacity-75 truncate">
                {channel.description}
              </div>
            )}
          </div>
          
          {/* Unread indicator */}
          {channel.unread_count && channel.unread_count > 0 && isChannelMember && (
            <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-xs text-white font-bold">
                {channel.unread_count > 9 ? '9+' : channel.unread_count}
              </span>
            </div>
          )}
        </button>
        
        {/* Channel menu button - Permanently visible */}
        {isChannelMember && (
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
            <button
              data-channel-menu={channel.id}
              onClick={(e) => {
                e.stopPropagation();
                setShowChannelMenu(showChannelMenu === channel.id ? null : channel.id);
              }}
              className="p-1 hover:bg-surface rounded z-10 relative"
            >
              <MoreVertical className="w-3 h-3 text-secondary" />
            </button>
          </div>
        )}
        
        {/* Dropdown menu - Positioned for proper stacking */}
        {showChannelMenu === channel.id && (
          <div 
            ref={(el) => { menuRefs.current[channel.id] = el; }}
            className="absolute z-[9999] glass-panel rounded-lg shadow-lg border silver-border min-w-[160px] bg-primary"
            style={{
              top: '50%',
              right: '2rem',
              transform: 'translateY(-50%)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
            }}
          >
            <button
              onClick={() => handleChannelAction('summarize', channel)}
              className="w-full px-3 py-2 text-left text-sm text-primary hover:bg-surface flex items-center space-x-2 rounded-t-lg"
            >
              <FileText className="w-3 h-3" />
              <span>Summarize</span>
            </button>
            <button
              onClick={() => handleChannelAction('meeting', channel)}
              className="w-full px-3 py-2 text-left text-sm text-primary hover:bg-surface flex items-center space-x-2"
            >
              <Video className="w-3 h-3" />
              <span>Start Meeting</span>
            </button>
            {channel.name !== 'general' && (
              <button
                onClick={() => handleChannelAction('leave', channel)}
                className="w-full px-3 py-2 text-left text-sm text-orange-400 hover:bg-orange-500/10 flex items-center space-x-2"
              >
                <LogOut className="w-3 h-3" />
                <span>Leave Channel</span>
              </button>
            )}
            {canDeleteChannel(channel) && (
              <button
                onClick={() => handleChannelAction('delete', channel)}
                className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center space-x-2 rounded-b-lg"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            )}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <>
      <div className="p-4 border-b silver-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-primary">Channels</h2>
          <div className="flex items-center space-x-2">
            <Button
              onClick={onJoinMeeting}
              variant="ghost"
              size="sm"
              className="p-2"
              title="Join Meeting"
            >
              <Video className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => setShowCreateModal(true)}
              variant="ghost"
              size="sm"
              className="p-2"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-secondary" />
          <input
            type="text"
            placeholder="Search channels..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 glass-panel rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 text-primary placeholder-secondary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 relative">
        {/* Public Channels */}
        {publicChannels.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2 flex items-center">
              <Hash className="w-3 h-3 mr-1" />
              Public Channels ({publicChannels.length})
            </h3>
            <div className="space-y-1">
              {publicChannels.map(renderChannelItem)}
            </div>
          </div>
        )}

        {/* Private Channels */}
        {privateChannels.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2 flex items-center">
              <Lock className="w-3 h-3 mr-1" />
              Private Channels ({privateChannels.length})
            </h3>
            <div className="space-y-1">
              {privateChannels.map(renderChannelItem)}
            </div>
          </div>
        )}

        {/* Direct Messages */}
        {dmChannels.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2 flex items-center">
              <MessageCircle className="w-3 h-3 mr-1" />
              Direct Messages ({dmChannels.length})
            </h3>
            <div className="space-y-1">
              {dmChannels.map((channel) => (
                <motion.button
                  key={channel.id}
                  onClick={() => onChannelSelect(channel)}
                  className={`w-full flex items-center space-x-3 p-3 rounded-lg text-left transition-all relative ${
                    activeChannel?.id === channel.id
                      ? 'bg-gradient-gold-silver text-white'
                      : 'text-secondary hover:text-primary hover:bg-surface'
                  }`}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">
                      {formatChannelName(channel).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{formatChannelName(channel)}</div>
                    <div className="text-xs opacity-75">
                      <span className="w-2 h-2 bg-green-500 rounded-full inline-block mr-1"></span>
                      Online
                    </div>
                  </div>
                  
                  {/* Unread indicator */}
                  {channel.unread_count && channel.unread_count > 0 && (
                    <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-xs text-white font-bold">
                        {channel.unread_count > 9 ? '9+' : channel.unread_count}
                      </span>
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {filteredChannels.length === 0 && (
          <div className="text-center py-8">
            <Hash className="w-8 h-8 text-secondary mx-auto mb-2 opacity-50" />
            <p className="text-secondary text-sm">
              {searchTerm ? 'No channels found' : 'No channels yet'}
            </p>
            {!searchTerm && (
              <Button
                onClick={() => setShowCreateModal(true)}
                variant="secondary"
                size="sm"
                className="mt-3"
              >
                Create your first channel
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Create Channel Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md"
            >
              <GlassCard className="p-6" goldBorder>
                <h3 className="text-xl font-bold gradient-gold-silver mb-6">
                  Create Channel
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Channel Name
                    </label>
                    <input
                      type="text"
                      value={newChannel.name}
                      onChange={(e) => setNewChannel(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., project-alpha"
                      className="w-full glass-panel rounded-lg px-4 py-3 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Description (Optional)
                    </label>
                    <textarea
                      value={newChannel.description}
                      onChange={(e) => setNewChannel(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="What's this channel about?"
                      className="w-full glass-panel rounded-lg px-4 py-3 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Channel Type
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center space-x-3 cursor-pointer p-3 glass-panel rounded-lg hover:border-gold-border transition-all">
                        <input
                          type="radio"
                          name="channelType"
                          value="public"
                          checked={newChannel.type === 'public'}
                          onChange={(e) => setNewChannel(prev => ({ ...prev, type: e.target.value as 'public' | 'private' }))}
                          className="text-yellow-500 focus:ring-yellow-500"
                        />
                        <Hash className="w-4 h-4 text-secondary" />
                        <div>
                          <div className="font-medium text-primary">Public</div>
                          <div className="text-xs text-secondary">Anyone can join and see messages</div>
                        </div>
                      </label>
                      <label className="flex items-center space-x-3 cursor-pointer p-3 glass-panel rounded-lg hover:border-gold-border transition-all">
                        <input
                          type="radio"
                          name="channelType"
                          value="private"
                          checked={newChannel.type === 'private'}
                          onChange={(e) => setNewChannel(prev => ({ ...prev, type: e.target.value as 'public' | 'private' }))}
                          className="text-yellow-500 focus:ring-yellow-500"
                        />
                        <Lock className="w-4 h-4 text-secondary" />
                        <div>
                          <div className="font-medium text-primary">Private</div>
                          <div className="text-xs text-secondary">Password protected, invite only</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {newChannel.type === 'private' && (
                    <div>
                      <label className="block text-sm font-medium text-primary mb-2">
                        Channel Password
                      </label>
                      <input
                        type="password"
                        value={newChannel.password}
                        onChange={(e) => setNewChannel(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Enter password for private channel"
                        className="w-full glass-panel rounded-lg px-4 py-3 text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                  )}
                </div>

                <div className="flex space-x-4 mt-6">
                  <Button
                    onClick={() => setShowCreateModal(false)}
                    variant="secondary"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateChannel}
                    variant="premium"
                    className="flex-1"
                    disabled={!newChannel.name.trim() || (newChannel.type === 'private' && !newChannel.password.trim())}
                  >
                    Create Channel
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Join Private Channel Modal */}
      <AnimatePresence>
        {showJoinModal && selectedChannelForJoin && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md"
            >
              <GlassCard className="p-6" goldBorder>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold gradient-gold-silver">
                    Join #{selectedChannelForJoin.name}
                  </h3>
                  <button
                    onClick={() => setShowJoinModal(false)}
                    className="text-secondary hover:text-primary"
                  >
                    ×
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div className="p-3 glass-panel rounded-lg bg-blue-500/10 border-blue-500/30">
                    <div className="flex items-center space-x-2 mb-2">
                      <Lock className="w-4 h-4 text-blue-400" />
                      <span className="text-blue-400 font-medium">Private Channel</span>
                    </div>
                    <p className="text-sm text-secondary">
                      {selectedChannelForJoin.description || 'This is a private channel that requires a password to join.'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Channel Password
                    </label>
                    <div className="relative">
                      <Key className="absolute left-3 top-3 w-4 h-4 text-secondary" />
                      <input
                        type="password"
                        value={joinPassword}
                        onChange={(e) => setJoinPassword(e.target.value)}
                        placeholder="Enter channel password"
                        className="w-full pl-10 pr-4 py-3 glass-panel rounded-lg text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        autoFocus
                      />
                    </div>
                  </div>
                </div>

                <div className="flex space-x-4 mt-6">
                  <Button
                    onClick={() => setShowJoinModal(false)}
                    variant="secondary"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleJoinWithPassword}
                    variant="premium"
                    className="flex-1"
                    disabled={!joinPassword.trim()}
                  >
                    Join Channel
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChannelList;