/*
  # Username/Password Authentication System

  1. New Tables
    - `user_accounts` - Custom user accounts with username/password
    - `user_sessions` - Session management for authentication

  2. Schema Updates
    - Update existing tables to work with new auth system
    - Migrate existing data if any
    - Update RLS policies

  3. Security
    - Custom authentication functions
    - Session-based security
    - Updated RLS policies
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop existing policies that will conflict
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view channels they're members of" ON channels;
DROP POLICY IF EXISTS "Users can create channels" ON channels;
DROP POLICY IF EXISTS "Channel creators can update their channels" ON channels;
DROP POLICY IF EXISTS "Users can view channel members for their channels" ON channel_members;
DROP POLICY IF EXISTS "Users can join public channels" ON channel_members;
DROP POLICY IF EXISTS "Channel admins can manage members" ON channel_members;
DROP POLICY IF EXISTS "Users can view messages in their channels" ON messages;
DROP POLICY IF EXISTS "Users can send messages to their channels" ON messages;
DROP POLICY IF EXISTS "Users can view tasks assigned to them or created by them" ON tasks;
DROP POLICY IF EXISTS "Users can create tasks" ON tasks;
DROP POLICY IF EXISTS "Task creators can update their tasks" ON tasks;
DROP POLICY IF EXISTS "Users can view their task assignments" ON task_assignments;
DROP POLICY IF EXISTS "Task creators can assign tasks" ON task_assignments;
DROP POLICY IF EXISTS "Users can manage their own calendar events" ON calendar_events;

-- Drop existing triggers that might conflict
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

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

-- User sessions table for custom auth
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_accounts(id) ON DELETE CASCADE NOT NULL,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Update profiles table to reference user_accounts instead of auth.users
DO $$
BEGIN
  -- Check if the foreign key constraint exists and drop it
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'profiles_id_fkey' 
    AND table_name = 'profiles'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_id_fkey;
  END IF;
  
  -- Add username column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'username'
  ) THEN
    ALTER TABLE profiles ADD COLUMN username text;
  END IF;
  
  -- Make username unique if constraint doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'profiles_username_key' 
    AND table_name = 'profiles'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);
  END IF;
END $$;

-- Remove email column from profiles if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE profiles DROP COLUMN email;
  END IF;
END $$;

-- Enable Row Level Security on new tables
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
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
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- User accounts policies
CREATE POLICY "Users can view their own account" ON user_accounts
  FOR SELECT USING (id = get_current_user_id());

CREATE POLICY "Users can update their own account" ON user_accounts
  FOR UPDATE USING (id = get_current_user_id());

-- New profiles policies
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = get_current_user_id());

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (id = get_current_user_id());

-- New channels policies
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

-- New channel members policies
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

-- New messages policies
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

-- New tasks policies
CREATE POLICY "Users can view tasks assigned to them or created by them" ON tasks
  FOR SELECT USING (
    created_by = get_current_user_id() OR
    id IN (SELECT task_id FROM task_assignments WHERE user_id = get_current_user_id())
  );

CREATE POLICY "Users can create tasks" ON tasks
  FOR INSERT WITH CHECK (created_by = get_current_user_id());

CREATE POLICY "Task creators can update their tasks" ON tasks
  FOR UPDATE USING (created_by = get_current_user_id());

-- New task assignments policies
CREATE POLICY "Users can view their task assignments" ON task_assignments
  FOR SELECT USING (
    user_id = get_current_user_id() OR
    task_id IN (SELECT id FROM tasks WHERE created_by = get_current_user_id())
  );

CREATE POLICY "Task creators can assign tasks" ON task_assignments
  FOR INSERT WITH CHECK (
    task_id IN (SELECT id FROM tasks WHERE created_by = get_current_user_id())
  );

-- New calendar events policies
CREATE POLICY "Users can manage their own calendar events" ON calendar_events
  FOR ALL USING (user_id = get_current_user_id());

-- Session policies
CREATE POLICY "Users can view their own sessions" ON user_sessions
  FOR SELECT USING (user_id = get_current_user_id());

CREATE POLICY "Users can delete their own sessions" ON user_sessions
  FOR DELETE USING (user_id = get_current_user_id());

-- Add triggers for updated_at on new tables
CREATE TRIGGER update_user_accounts_updated_at BEFORE UPDATE ON user_accounts
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