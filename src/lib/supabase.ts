import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Types for our custom auth system
export interface Profile {
  id: string;
  username: string;
  full_name: string;
  avatar_url?: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  type: 'public' | 'private' | 'dm';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  type: 'text' | 'ai_task_creation' | 'ai_summary' | 'system';
  metadata: any;
  created_at: string;
  sender?: Profile;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  created_by: string;
  source_message_id?: string;
  created_at: string;
  updated_at: string;
  assignments?: TaskAssignment[];
}

export interface TaskAssignment {
  task_id: string;
  user_id: string;
  assigned_at: string;
  user?: Profile;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  user_id: string;
  task_id?: string;
  created_at: string;
}

// Enhanced API functions for workspace functionality
export const workspaceAPI = {
  // Get channels for current user
  async getChannelsForUser(userId: string): Promise<Channel[]> {
    try {
      // Get channels where user is a member
      const { data: memberChannels, error: memberError } = await supabase
        .from('channels')
        .select(`
          *,
          channel_members!inner(user_id, role)
        `)
        .eq('channel_members.user_id', userId);

      if (memberError) {
        console.error('Error fetching member channels:', memberError);
        return [];
      }

      // Get public channels (user might not be a member yet)
      const { data: publicChannels, error: publicError } = await supabase
        .from('channels')
        .select('*')
        .eq('type', 'public');

      if (publicError) {
        console.error('Error fetching public channels:', publicError);
        return memberChannels || [];
      }

      // Combine and deduplicate
      const allChannels = [...(memberChannels || []), ...(publicChannels || [])];
      const uniqueChannels = allChannels.filter((channel, index, self) => 
        index === self.findIndex(c => c.id === channel.id)
      );

      return uniqueChannels;
    } catch (error) {
      console.error('Error in getChannelsForUser:', error);
      return [];
    }
  },

  // Get messages for a channel
  async getMessagesForChannel(channelId: string): Promise<Message[]> {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles(*)
        `)
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('Error fetching messages:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getMessagesForChannel:', error);
      return [];
    }
  },

  // Get tasks for user (created by or assigned to)
  async getUserTasks(userId: string): Promise<Task[]> {
    try {
      // Get tasks created by user
      const { data: createdTasks, error: createdError } = await supabase
        .from('tasks')
        .select(`
          *,
          assignments:task_assignments(
            user_id,
            user:profiles(*)
          )
        `)
        .eq('created_by', userId);

      if (createdError) {
        console.error('Error fetching created tasks:', createdError);
      }

      // Get tasks assigned to user
      const { data: assignedTaskIds, error: assignedError } = await supabase
        .from('task_assignments')
        .select('task_id')
        .eq('user_id', userId);

      if (assignedError) {
        console.error('Error fetching assigned task IDs:', assignedError);
      }

      let assignedTasks: Task[] = [];
      if (assignedTaskIds && assignedTaskIds.length > 0) {
        const taskIds = assignedTaskIds.map(t => t.task_id);
        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select(`
            *,
            assignments:task_assignments(
              user_id,
              user:profiles(*)
            )
          `)
          .in('id', taskIds);

        if (tasksError) {
          console.error('Error fetching assigned tasks:', tasksError);
        } else {
          assignedTasks = tasks || [];
        }
      }

      // Combine and deduplicate
      const allTasks = [...(createdTasks || []), ...assignedTasks];
      const uniqueTasks = allTasks.filter((task, index, self) => 
        index === self.findIndex(t => t.id === task.id)
      );

      return uniqueTasks.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } catch (error) {
      console.error('Error in getUserTasks:', error);
      return [];
    }
  },

  // Subscribe to real-time updates
  subscribeToChannel(channelId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        callback
      )
      .subscribe();
  },

  subscribeToTasks(userId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`tasks:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        callback
      )
      .subscribe();
  },

  subscribeToChannels(userId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`channels:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channels',
        },
        callback
      )
      .subscribe();
  },
};