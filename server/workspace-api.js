const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const WorkspaceProcessor = require('./workspace-processor');
require('dotenv').config();

const app = express();
const PORT = process.env.WORKSPACE_PORT || 8002;
VITE_APP_URL=process.env.VITE_APP_URL
VITE_API_URL=process.env.VITE_API_URL
VITE_AI_API_URL=process.env.VITE_AI_API_URL
VITE_MEDIA_API_URL=process.env.VITE_MEDIA_API_URL
VITE_WORKSPACE_API_URL=process.env.VITE_WORKSPACE_API_URL
FRONTEND_URL=process.env.FRONTEND_URL
// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

// Initialize workspace processor
const workspaceProcessor = new WorkspaceProcessor();

// Middleware
app.use(cors({
  origin: `${FRONTEND_URL}`,
  credentials: true
}));
app.use(express.json());

// Process message for task detection
app.post('/api/workspace/process-message', async (req, res) => {
  try {
    const { message, messageId, channelId, senderId, mentions, userId } = req.body;
    
    const result = await workspaceProcessor.processMessage({
      message,
      messageId,
      channelId,
      senderId,
      mentions,
      userId
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate channel summary
app.post('/api/workspace/summarize-channel', async (req, res) => {
  try {
    const { channelId, userId, timeframe = '24h' } = req.body;
    
    if (!channelId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Channel ID and User ID are required'
      });
    }
    
    const result = await workspaceProcessor.generateChannelSummary(channelId, timeframe);
    res.json(result);
  } catch (error) {
    console.error('Error generating channel summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create channel with password support
app.post('/api/workspace/channels', async (req, res) => {
  try {
    const { name, description, type, password, userId } = req.body;
    
    if (!name || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Channel name and User ID are required'
      });
    }
    
    // Create channel
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        type: type || 'public',
        created_by: userId,
        metadata: type === 'private' && password ? { password } : {}
      })
      .select()
      .single();
    
    if (channelError) {
      console.error('Error creating channel:', channelError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create channel'
      });
    }
    
    // Add creator as admin member
    const { error: memberError } = await supabase
      .from('channel_members')
      .insert({
        channel_id: channel.id,
        user_id: userId,
        role: 'admin'
      });
    
    if (memberError) {
      console.error('Error adding creator as member:', memberError);
    }
    
    res.json({
      success: true,
      channel
    });
  } catch (error) {
    console.error('Error creating channel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Join channel with password support
app.post('/api/workspace/channels/:channelId/join', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { userId, password } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    // Get channel details
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .single();
    
    if (channelError || !channel) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found'
      });
    }
    
    // Check password for private channels
    if (channel.type === 'private') {
      const channelPassword = channel.metadata?.password;
      if (!channelPassword || channelPassword !== password) {
        return res.status(401).json({
          success: false,
          error: 'Invalid password'
        });
      }
    }
    
    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('channel_members')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .single();
    
    if (existingMember) {
      return res.json({
        success: true,
        message: 'You are already a member of this channel'
      });
    }
    
    // Add user to channel
    const { error: memberError } = await supabase
      .from('channel_members')
      .insert({
        channel_id: channelId,
        user_id: userId,
        role: 'member'
      });
    
    if (memberError) {
      console.error('Error adding member:', memberError);
      return res.status(500).json({
        success: false,
        error: 'Failed to join channel'
      });
    }
    
    res.json({
      success: true,
      message: 'Successfully joined channel'
    });
  } catch (error) {
    console.error('Error joining channel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Leave channel
app.post('/api/workspace/channels/:channelId/leave', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    // Check if it's the general channel
    const { data: channel } = await supabase
      .from('channels')
      .select('name')
      .eq('id', channelId)
      .single();
    
    if (channel?.name === 'general') {
      return res.status(400).json({
        success: false,
        error: 'Cannot leave the general channel'
      });
    }
    
    // Remove user from channel
    const { error } = await supabase
      .from('channel_members')
      .delete()
      .eq('channel_id', channelId)
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error leaving channel:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to leave channel'
      });
    }
    
    res.json({
      success: true,
      message: 'Successfully left channel'
    });
  } catch (error) {
    console.error('Error leaving channel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete channel
app.delete('/api/workspace/channels/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    // Check if user is the creator of the channel
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('created_by, name')
      .eq('id', channelId)
      .single();
    
    if (channelError || !channel) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found'
      });
    }
    
    if (channel.created_by !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the channel creator can delete this channel'
      });
    }
    
    if (channel.name === 'general') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete the general channel'
      });
    }
    
    // Delete the channel (cascading deletes will handle related data)
    const { error: deleteError } = await supabase
      .from('channels')
      .delete()
      .eq('id', channelId);
    
    if (deleteError) {
      console.error('Error deleting channel:', deleteError);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete channel'
      });
    }
    
    res.json({
      success: true,
      message: 'Channel deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete message
app.delete('/api/workspace/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    // Check if user is the sender of the message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('id', messageId)
      .single();
    
    if (messageError || !message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }
    
    if (message.sender_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own messages'
      });
    }
    
    // Delete the message
    const { error: deleteError } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);
    
    if (deleteError) {
      console.error('Error deleting message:', deleteError);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete message'
      });
    }
    
    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Edit message
app.put('/api/workspace/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId, content } = req.body;
    
    if (!userId || !content) {
      return res.status(400).json({
        success: false,
        error: 'User ID and content are required'
      });
    }
    
    // Check if user is the sender of the message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('sender_id, content')
      .eq('id', messageId)
      .single();
    
    if (messageError || !message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }
    
    if (message.sender_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only edit your own messages'
      });
    }
    
    // Update the message
    const { error: updateError } = await supabase
      .from('messages')
      .update({
        content: content.trim(),
        edited_at: new Date().toISOString(),
        original_content: message.content
      })
      .eq('id', messageId);
    
    if (updateError) {
      console.error('Error updating message:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update message'
      });
    }
    
    res.json({
      success: true,
      message: 'Message updated successfully'
    });
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete task
app.delete('/api/workspace/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    // Check if user is the creator of the task
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('created_by')
      .eq('id', taskId)
      .single();
    
    if (taskError || !task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    if (task.created_by !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the task creator can delete this task'
      });
    }
    
    // Delete the task (cascading deletes will handle assignments)
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);
    
    if (deleteError) {
      console.error('Error deleting task:', deleteError);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete task'
      });
    }
    
    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get channels with membership info
app.get('/api/workspace/channels/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get all channels with membership information
    const { data: channels, error } = await supabase
      .from('channels')
      .select(`
        *,
        channel_members!left(user_id, role)
      `)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching channels:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch channels'
      });
    }
    
    // Add membership info to each channel
    const channelsWithMembership = channels.map(channel => ({
      ...channel,
      is_member: channel.channel_members.some(member => member.user_id === userId)
    }));
    
    res.json({
      success: true,
      channels: channelsWithMembership
    });
  } catch (error) {
    console.error('Error getting channels:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/api/workspace/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'workspace-api',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Workspace API server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/workspace/health`);
});

module.exports = app;