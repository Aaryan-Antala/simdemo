const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);
VITE_APP_URL=process.env.VITE_APP_URL
VITE_API_URL=process.env.VITE_API_URL
VITE_AI_API_URL=process.env.VITE_AI_API_URL
VITE_MEDIA_API_URL=process.env.VITE_MEDIA_API_URL
VITE_WORKSPACE_API_URL=process.env.VITE_WORKSPACE_API_URL
FRONTEND_URL=process.env.FRONTEND_URL
// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class WorkspaceProcessor {
  constructor() {
    this.model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  async processMessage(messageData) {
    const { message, messageId, channelId, senderId, mentions, userId } = messageData;
    
    try {
      // Check if message contains task indicators
      const hasTaskIndicators = this.containsTaskIndicators(message);
      const hasMentions = mentions && mentions.length > 0;
      
      if (hasTaskIndicators || hasMentions) {
        return await this.extractTaskFromMessage(messageData);
      }
      
      return { success: true, taskCreated: false };
    } catch (error) {
      console.error('Error processing message:', error);
      return { success: false, error: error.message };
    }
  }

  containsTaskIndicators(message) {
    const taskKeywords = [
      'todo', 'task', 'assign', 'deadline', 'due', 'complete', 'finish',
      'work on', 'handle', 'take care of', 'need to', 'should', 'must',
      'remember to', 'don\'t forget', 'action item', 'follow up'
    ];
    
    const lowerMessage = message.toLowerCase();
    return taskKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  async extractTaskFromMessage(messageData) {
    const { message, messageId, channelId, senderId, mentions, userId } = messageData;
    
    try {
      // Use AI to extract task details
      const prompt = `
        Analyze this message and extract task information if present:
        
        Message: "${message}"
        Mentions: ${mentions ? mentions.join(', ') : 'none'}
        
        If this message contains a task or action item, respond with JSON:
        {
          "hasTask": true,
          "title": "brief task title",
          "description": "detailed description",
          "priority": "low|medium|high|urgent",
          "assignee": "username if mentioned, null otherwise",
          "dueDate": "YYYY-MM-DD if mentioned, null otherwise"
        }
        
        If no task is found, respond with:
        {
          "hasTask": false
        }
        
        Only respond with valid JSON.
      `;

      const result = await this.model.generateContent(prompt);
      const response = result.response.text();
      
      let taskData;
      try {
        taskData = JSON.parse(response);
      } catch (parseError) {
        console.error('Failed to parse AI response:', response);
        return { success: true, taskCreated: false };
      }

      if (!taskData.hasTask) {
        return { success: true, taskCreated: false };
      }

      // Create task in database
      const task = await this.createTask({
        title: taskData.title,
        description: taskData.description,
        priority: taskData.priority || 'medium',
        createdBy: senderId,
        sourceMessageId: messageId,
        dueDate: taskData.dueDate
      });

      // Assign task if assignee mentioned
      if (taskData.assignee && mentions.includes(taskData.assignee)) {
        const assigneeUser = await this.findUserByUsername(taskData.assignee);
        if (assigneeUser) {
          await this.assignTask(task.id, assigneeUser.id);
        }
      }

      return {
        success: true,
        taskCreated: true,
        task: {
          id: task.id,
          title: task.title,
          assignee: taskData.assignee
        }
      };

    } catch (error) {
      console.error('Error extracting task from message:', error);
      return { success: false, error: error.message };
    }
  }

  async createTask(taskData) {
    const { title, description, priority, createdBy, sourceMessageId, dueDate } = taskData;
    
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title,
        description,
        priority,
        created_by: createdBy,
        source_message_id: sourceMessageId,
        due_date: dueDate
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create task: ${error.message}`);
    }

    return data;
  }

  async assignTask(taskId, userId) {
    const { error } = await supabase
      .from('task_assignments')
      .insert({
        task_id: taskId,
        user_id: userId
      });

    if (error) {
      console.error('Failed to assign task:', error);
    }
  }

  async findUserByUsername(username) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', username)
      .single();

    if (error) {
      console.error('Failed to find user:', error);
      return null;
    }

    return data;
  }

  async generateChannelSummary(channelId, timeframe = '24h') {
    try {
      // Get recent messages from channel
      const hoursAgo = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 1;
      const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

      const { data: messages, error } = await supabase
        .from('messages')
        .select(`
          content,
          type,
          created_at,
          sender:profiles(full_name, username)
        `)
        .eq('channel_id', channelId)
        .gte('created_at', since)
        .order('created_at', { ascending: true });

      if (error || !messages || messages.length === 0) {
        return { success: false, error: 'No messages found' };
      }

      // Generate summary using AI
      const messageText = messages
        .filter(m => m.type === 'text')
        .map(m => `${m.sender?.full_name || 'Unknown'}: ${m.content}`)
        .join('\n');

      const prompt = `
        Summarize this channel conversation from the last ${timeframe}:
        
        ${messageText}
        
        Provide a concise summary including:
        - Key topics discussed
        - Important decisions made
        - Action items or tasks mentioned
        - Overall sentiment and activity level
        
        Keep it under 200 words.
        Respond only in markdown format.
      `;

      const result = await this.model.generateContent(prompt);
      const summary = result.response.text();

      return {
        success: true,
        summary,
        messageCount: messages.length,
        timeframe
      };

    } catch (error) {
      console.error('Error generating channel summary:', error);
      return { success: false, error: error.message };
    }
  }

  async extractMeetingNotes(transcript, participants, duration) {
    try {
      const prompt = `
        Extract meeting notes from this transcript:
        
        Participants: ${participants.join(', ')}
        Duration: ${duration} minutes
        
        Transcript:
        ${transcript}
        
        Generate structured meeting notes with:
        1. Meeting Summary (2-3 sentences)
        2. Key Discussion Points (bullet points)
        3. Decisions Made (bullet points)
        4. Action Items (with assignees if mentioned)
        5. Next Steps
        
        Format as markdown.
      `;

      const result = await this.model.generateContent(prompt);
      const notes = result.response.text();

      return {
        success: true,
        notes,
        participants,
        duration
      };

    } catch (error) {
      console.error('Error extracting meeting notes:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = WorkspaceProcessor;