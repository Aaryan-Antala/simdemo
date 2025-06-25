/*
  # Complete Workspace Schema

  1. New Tables
    - `profiles` - User profiles linked to Supabase auth
    - `channels` - Chat channels (public, private, dm)
    - `channel_members` - User membership in channels
    - `messages` - Chat messages
    - `tasks` - Task management
    - `task_assignments` - Task assignments to users
    - `calendar_events` - Calendar events

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
    - Secure access based on channel membership
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  avatar_url text,
  status text DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away', 'busy')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Channels table
CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'private', 'dm')),
  created_by uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Channel members table
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  type text DEFAULT 'text' CHECK (type IN ('text', 'ai_task_creation', 'ai_summary', 'system')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed', 'cancelled')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  source_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Task assignments table
CREATE TABLE IF NOT EXISTS task_assignments (
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

-- Calendar events table
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Channels policies
CREATE POLICY "Users can view channels they're members of" ON channels
  FOR SELECT TO authenticated USING (
    id IN (
      SELECT channel_id FROM channel_members 
      WHERE user_id = auth.uid()
    ) OR type = 'public'
  );

CREATE POLICY "Users can create channels" ON channels
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Channel creators can update their channels" ON channels
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);

-- Channel members policies
CREATE POLICY "Users can view channel members for their channels" ON channel_members
  FOR SELECT TO authenticated USING (
    channel_id IN (
      SELECT channel_id FROM channel_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can join public channels" ON channel_members
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND
    channel_id IN (SELECT id FROM channels WHERE type = 'public')
  );

CREATE POLICY "Channel admins can manage members" ON channel_members
  FOR ALL TO authenticated USING (
    channel_id IN (
      SELECT channel_id FROM channel_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Messages policies
CREATE POLICY "Users can view messages in their channels" ON messages
  FOR SELECT TO authenticated USING (
    channel_id IN (
      SELECT channel_id FROM channel_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages to their channels" ON messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid() AND
    channel_id IN (
      SELECT channel_id FROM channel_members 
      WHERE user_id = auth.uid()
    )
  );

-- Tasks policies
CREATE POLICY "Users can view tasks assigned to them or created by them" ON tasks
  FOR SELECT TO authenticated USING (
    created_by = auth.uid() OR
    id IN (SELECT task_id FROM task_assignments WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create tasks" ON tasks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Task creators can update their tasks" ON tasks
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);

-- Task assignments policies
CREATE POLICY "Users can view their task assignments" ON task_assignments
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR
    task_id IN (SELECT id FROM tasks WHERE created_by = auth.uid())
  );

CREATE POLICY "Task creators can assign tasks" ON task_assignments
  FOR INSERT TO authenticated WITH CHECK (
    task_id IN (SELECT id FROM tasks WHERE created_by = auth.uid())
  );

-- Calendar events policies
CREATE POLICY "Users can manage their own calendar events" ON calendar_events
  FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Functions for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create default channels
INSERT INTO channels (name, description, type, created_by) VALUES
  ('General', 'General discussion for everyone', 'public', (SELECT id FROM auth.users LIMIT 1)),
  ('Random', 'Random conversations and fun', 'public', (SELECT id FROM auth.users LIMIT 1))
ON CONFLICT DO NOTHING;

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', new.email));
  
  -- Add user to default public channels
  INSERT INTO public.channel_members (channel_id, user_id)
  SELECT id, new.id FROM public.channels WHERE type = 'public';
  
  RETURN new;
END;
$$ language plpgsql security definer;

-- Trigger for new user registration
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();