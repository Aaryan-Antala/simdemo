/*
  # Username-based Authentication System

  1. New Tables
    - `user_accounts` - Custom user accounts with username/password
    - Update existing tables to reference user_accounts instead of auth.users

  2. Security
    - Enable RLS on all tables
    - Custom authentication functions
    - Secure password hashing
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom user accounts table (replaces dependency on auth.users)
CREATE TABLE IF NOT EXISTS user_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  avatar_url text,
  status text DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away', 'busy')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Profiles table (now references user_accounts)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES user_accounts(id) ON DELETE CASCADE PRIMARY KEY,
  username text UNIQUE NOT NULL,
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

-- User sessions table for custom auth
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_accounts(id) ON DELETE CASCADE NOT NULL,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Custom authentication functions
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS uuid AS $$
DECLARE
  user_id uuid;
BEGIN
  -- Get user ID from current session token
  SELECT us.user_id INTO user_id
  FROM user_sessions us
  WHERE us.token = current_setting('app.current_user_token', true)
    AND us.expires_at > now();
  
  RETURN user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- User accounts policies
CREATE POLICY "Users can view their own account" ON user_accounts
  FOR SELECT USING (id = get_current_user_id());

CREATE POLICY "Users can update their own account" ON user_accounts
  FOR UPDATE USING (id = get_current_user_id());

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = get_current_user_id());

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (id = get_current_user_id());

-- Channels policies
CREATE POLICY "Users can view channels they're members of" ON channels
  FOR SELECT USING (
    id IN (
      SELECT channel_id FROM channel_members 
      WHERE user_id = get_current_user_id()
    ) OR type = 'public'
  );

CREATE POLICY "Users can create channels" ON channels
  FOR INSERT WITH CHECK (created_by = get_current_user_id());

CREATE POLICY "Channel creators can update their channels" ON channels
  FOR UPDATE USING (created_by = get_current_user_id());

-- Channel members policies
CREATE POLICY "Users can view channel members for their channels" ON channel_members
  FOR SELECT USING (
    channel_id IN (
      SELECT channel_id FROM channel_members 
      WHERE user_id = get_current_user_id()
    )
  );

CREATE POLICY "Users can join public channels" ON channel_members
  FOR INSERT WITH CHECK (
    user_id = get_current_user_id() AND
    channel_id IN (SELECT id FROM channels WHERE type = 'public')
  );

CREATE POLICY "Channel admins can manage members" ON channel_members
  FOR ALL USING (
    channel_id IN (
      SELECT channel_id FROM channel_members 
      WHERE user_id = get_current_user_id() AND role = 'admin'
    )
  );

-- Messages policies
CREATE POLICY "Users can view messages in their channels" ON messages
  FOR SELECT USING (
    channel_id IN (
      SELECT channel_id FROM channel_members 
      WHERE user_id = get_current_user_id()
    )
  );

CREATE POLICY "Users can send messages to their channels" ON messages
  FOR INSERT WITH CHECK (
    sender_id = get_current_user_id() AND
    channel_id IN (
      SELECT channel_id FROM channel_members 
      WHERE user_id = get_current_user_id()
    )
  );

-- Tasks policies
CREATE POLICY "Users can view tasks assigned to them or created by them" ON tasks
  FOR SELECT USING (
    created_by = get_current_user_id() OR
    id IN (SELECT task_id FROM task_assignments WHERE user_id = get_current_user_id())
  );

CREATE POLICY "Users can create tasks" ON tasks
  FOR INSERT WITH CHECK (created_by = get_current_user_id());

CREATE POLICY "Task creators can update their tasks" ON tasks
  FOR UPDATE USING (created_by = get_current_user_id());

-- Task assignments policies
CREATE POLICY "Users can view their task assignments" ON task_assignments
  FOR SELECT USING (
    user_id = get_current_user_id() OR
    task_id IN (SELECT id FROM tasks WHERE created_by = get_current_user_id())
  );

CREATE POLICY "Task creators can assign tasks" ON task_assignments
  FOR INSERT WITH CHECK (
    task_id IN (SELECT id FROM tasks WHERE created_by = get_current_user_id())
  );

-- Calendar events policies
CREATE POLICY "Users can manage their own calendar events" ON calendar_events
  FOR ALL USING (user_id = get_current_user_id());

-- Session policies
CREATE POLICY "Users can view their own sessions" ON user_sessions
  FOR SELECT USING (user_id = get_current_user_id());

CREATE POLICY "Users can delete their own sessions" ON user_sessions
  FOR DELETE USING (user_id = get_current_user_id());

-- Functions for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_user_accounts_updated_at BEFORE UPDATE ON user_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Authentication functions
CREATE OR REPLACE FUNCTION register_user(
  p_username text,
  p_password text,
  p_full_name text
)
RETURNS json AS $$
DECLARE
  user_id uuid;
  session_token text;
  session_expires timestamptz;
  general_channel_id uuid;
  random_channel_id uuid;
BEGIN
  -- Check if username already exists
  IF EXISTS (SELECT 1 FROM user_accounts WHERE username = p_username) THEN
    RETURN json_build_object('success', false, 'error', 'Username already exists');
  END IF;
  
  -- Create user account
  INSERT INTO user_accounts (username, password_hash, full_name)
  VALUES (p_username, crypt(p_password, gen_salt('bf')), p_full_name)
  RETURNING id INTO user_id;
  
  -- Create profile
  INSERT INTO profiles (id, username, full_name)
  VALUES (user_id, p_username, p_full_name);
  
  -- Create session
  session_token := encode(gen_random_bytes(32), 'hex');
  session_expires := now() + interval '30 days';
  
  INSERT INTO user_sessions (user_id, token, expires_at)
  VALUES (user_id, session_token, session_expires);
  
  -- Create or get default channels
  SELECT id INTO general_channel_id FROM channels WHERE name = 'General' AND type = 'public' LIMIT 1;
  
  IF general_channel_id IS NULL THEN
    INSERT INTO channels (name, description, type, created_by)
    VALUES ('General', 'General discussion for everyone', 'public', user_id)
    RETURNING id INTO general_channel_id;
    
    INSERT INTO channel_members (channel_id, user_id, role)
    VALUES (general_channel_id, user_id, 'admin');
  ELSE
    INSERT INTO channel_members (channel_id, user_id)
    VALUES (general_channel_id, user_id)
    ON CONFLICT DO NOTHING;
  END IF;
  
  SELECT id INTO random_channel_id FROM channels WHERE name = 'Random' AND type = 'public' LIMIT 1;
  
  IF random_channel_id IS NULL THEN
    INSERT INTO channels (name, description, type, created_by)
    VALUES ('Random', 'Random conversations and fun', 'public', user_id)
    RETURNING id INTO random_channel_id;
    
    INSERT INTO channel_members (channel_id, user_id, role)
    VALUES (random_channel_id, user_id, 'admin');
  ELSE
    INSERT INTO channel_members (channel_id, user_id)
    VALUES (random_channel_id, user_id)
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'user', json_build_object(
      'id', user_id,
      'username', p_username,
      'full_name', p_full_name
    ),
    'session', json_build_object(
      'token', session_token,
      'expires_at', session_expires
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION login_user(
  p_username text,
  p_password text
)
RETURNS json AS $$
DECLARE
  user_record record;
  session_token text;
  session_expires timestamptz;
BEGIN
  -- Verify credentials
  SELECT ua.*, p.full_name as profile_full_name
  INTO user_record
  FROM user_accounts ua
  JOIN profiles p ON p.id = ua.id
  WHERE ua.username = p_username
    AND ua.password_hash = crypt(p_password, ua.password_hash);
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid username or password');
  END IF;
  
  -- Create new session
  session_token := encode(gen_random_bytes(32), 'hex');
  session_expires := now() + interval '30 days';
  
  INSERT INTO user_sessions (user_id, token, expires_at)
  VALUES (user_record.id, session_token, session_expires);
  
  -- Clean up old sessions
  DELETE FROM user_sessions 
  WHERE user_id = user_record.id 
    AND expires_at < now();
  
  RETURN json_build_object(
    'success', true,
    'user', json_build_object(
      'id', user_record.id,
      'username', user_record.username,
      'full_name', user_record.profile_full_name
    ),
    'session', json_build_object(
      'token', session_token,
      'expires_at', session_expires
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION logout_user(p_token text)
RETURNS json AS $$
BEGIN
  DELETE FROM user_sessions WHERE token = p_token;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION verify_session(p_token text)
RETURNS json AS $$
DECLARE
  user_record record;
BEGIN
  SELECT ua.id, ua.username, p.full_name
  INTO user_record
  FROM user_sessions us
  JOIN user_accounts ua ON ua.id = us.user_id
  JOIN profiles p ON p.id = ua.id
  WHERE us.token = p_token
    AND us.expires_at > now();
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired session');
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'user', json_build_object(
      'id', user_record.id,
      'username', user_record.username,
      'full_name', user_record.full_name
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;