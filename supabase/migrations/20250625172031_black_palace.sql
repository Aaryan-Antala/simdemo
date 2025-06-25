/*
  # Fix Foreign Key Constraint Error During Signup

  1. Database Functions
    - Update register_user function to properly create profile first
    - Fix auto_join_general_channel function to use correct user reference
    - Update create_default_workspace_data function for proper user handling

  2. Security
    - Ensure proper foreign key relationships
    - Fix trigger execution order
*/

-- Drop existing functions to recreate them with fixes
DROP FUNCTION IF EXISTS register_user(text, text, text);
DROP FUNCTION IF EXISTS auto_join_general_channel();
DROP FUNCTION IF EXISTS create_default_workspace_data();

-- Updated register_user function
CREATE OR REPLACE FUNCTION register_user(
  p_username text,
  p_password text,
  p_full_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_password_hash text;
  v_token text;
  v_expires_at timestamptz;
  v_general_channel_id uuid;
BEGIN
  -- Generate UUID for new user
  v_user_id := gen_random_uuid();
  
  -- Hash password (in production, use proper bcrypt)
  v_password_hash := encode(digest(p_password, 'sha256'), 'hex');
  
  -- Generate session token
  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '30 days';
  
  -- Check if username already exists
  IF EXISTS (SELECT 1 FROM user_accounts WHERE username = p_username) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Username already exists'
    );
  END IF;
  
  -- Create user account first
  INSERT INTO user_accounts (id, username, password_hash, full_name)
  VALUES (v_user_id, p_username, v_password_hash, p_full_name);
  
  -- Create profile (this is what the foreign key references)
  INSERT INTO profiles (id, username, full_name)
  VALUES (v_user_id, p_username, p_full_name);
  
  -- Create session
  INSERT INTO user_sessions (user_id, token, expires_at)
  VALUES (v_user_id, v_token, v_expires_at);
  
  -- Get or create general channel
  SELECT id INTO v_general_channel_id 
  FROM channels 
  WHERE name = 'general' AND type = 'public'
  LIMIT 1;
  
  -- If general channel doesn't exist, create it
  IF v_general_channel_id IS NULL THEN
    INSERT INTO channels (name, description, type, created_by)
    VALUES ('general', 'General discussion channel', 'public', v_user_id)
    RETURNING id INTO v_general_channel_id;
  END IF;
  
  -- Add user to general channel
  INSERT INTO channel_members (channel_id, user_id, role)
  VALUES (v_general_channel_id, v_user_id, 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;
  
  -- Create default workspace data
  PERFORM create_default_workspace_data_for_user(v_user_id);
  
  -- Return success with session info
  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user_id,
      'username', p_username,
      'full_name', p_full_name
    ),
    'session', jsonb_build_object(
      'token', v_token,
      'expires_at', v_expires_at
    )
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Updated function to create default workspace data for a specific user
CREATE OR REPLACE FUNCTION create_default_workspace_data_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_channel_id uuid;
  v_task_id uuid;
BEGIN
  -- Create a few default channels if they don't exist
  
  -- Random channel
  IF NOT EXISTS (SELECT 1 FROM channels WHERE name = 'random' AND type = 'public') THEN
    INSERT INTO channels (name, description, type, created_by)
    VALUES ('random', 'Random discussions and off-topic conversations', 'public', p_user_id)
    RETURNING id INTO v_channel_id;
    
    -- Add user to random channel
    INSERT INTO channel_members (channel_id, user_id, role)
    VALUES (v_channel_id, p_user_id, 'member');
    
    -- Add some default messages
    INSERT INTO messages (channel_id, sender_id, content, type)
    VALUES 
      (v_channel_id, p_user_id, 'Welcome to the random channel! 🎉', 'system'),
      (v_channel_id, p_user_id, 'Feel free to share anything here - memes, jokes, or just casual chat!', 'system');
  END IF;
  
  -- Project updates channel
  IF NOT EXISTS (SELECT 1 FROM channels WHERE name = 'project-updates' AND type = 'public') THEN
    INSERT INTO channels (name, description, type, created_by)
    VALUES ('project-updates', 'Share project progress and important updates', 'public', p_user_id)
    RETURNING id INTO v_channel_id;
    
    -- Add user to project updates channel
    INSERT INTO channel_members (channel_id, user_id, role)
    VALUES (v_channel_id, p_user_id, 'member');
    
    -- Add some default messages
    INSERT INTO messages (channel_id, sender_id, content, type)
    VALUES 
      (v_channel_id, p_user_id, '📋 Welcome to project updates!', 'system'),
      (v_channel_id, p_user_id, 'Use this channel to share progress, milestones, and important project news.', 'system');
  END IF;
  
  -- Create a private channel example
  IF NOT EXISTS (SELECT 1 FROM channels WHERE name = 'team-leads' AND type = 'private') THEN
    INSERT INTO channels (name, description, type, created_by, metadata)
    VALUES ('team-leads', 'Private discussions for team leadership', 'private', p_user_id, '{"password": "teamlead123"}')
    RETURNING id INTO v_channel_id;
    
    -- Add user to private channel
    INSERT INTO channel_members (channel_id, user_id, role)
    VALUES (v_channel_id, p_user_id, 'admin');
    
    -- Add some default messages
    INSERT INTO messages (channel_id, sender_id, content, type)
    VALUES 
      (v_channel_id, p_user_id, '🔒 Welcome to the team leads private channel', 'system'),
      (v_channel_id, p_user_id, 'Password: teamlead123 - Share this with other team leads to join!', 'system');
  END IF;
  
  -- Create some default tasks
  INSERT INTO tasks (title, description, priority, status, created_by, due_date)
  VALUES 
    ('Welcome to SimAlly! 🎉', 'Take a tour of the workspace features: try creating tasks, scheduling meetings, and chatting with AI assistance.', 'medium', 'todo', p_user_id, (now() + interval '3 days')::timestamptz),
    ('Set up your profile', 'Update your profile information and avatar to personalize your workspace experience.', 'low', 'todo', p_user_id, (now() + interval '1 day')::timestamptz),
    ('Explore AI Features', 'Try mentioning @someone in chat to auto-create tasks, or ask the AI assistant for help with productivity.', 'high', 'todo', p_user_id, (now() + interval '2 days')::timestamptz);
  
  -- Create a sample calendar event
  INSERT INTO calendar_events (title, description, start_time, end_time, user_id)
  VALUES (
    'Welcome Meeting',
    'Introduction to SimAlly workspace features and capabilities',
    (now() + interval '1 day')::timestamptz,
    (now() + interval '1 day' + interval '1 hour')::timestamptz,
    p_user_id
  );
  
END;
$$;

-- Remove the old triggers that might be causing issues
DROP TRIGGER IF EXISTS auto_join_general_trigger ON user_accounts;
DROP TRIGGER IF EXISTS create_default_workspace_trigger ON user_accounts;

-- Create new simplified trigger that only runs after the profile is created
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This function is intentionally empty since we handle everything in register_user
  -- We keep it for potential future use
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table instead of user_accounts
CREATE TRIGGER handle_new_user_signup_trigger
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();

-- Ensure general channel exists
DO $$
DECLARE
  v_general_channel_id uuid;
  v_system_user_id uuid;
BEGIN
  -- Check if general channel exists
  SELECT id INTO v_general_channel_id FROM channels WHERE name = 'general' AND type = 'public';
  
  -- If it doesn't exist, create it
  IF v_general_channel_id IS NULL THEN
    -- Create a system user if it doesn't exist
    SELECT id INTO v_system_user_id FROM user_accounts WHERE username = 'system';
    
    IF v_system_user_id IS NULL THEN
      v_system_user_id := gen_random_uuid();
      INSERT INTO user_accounts (id, username, password_hash, full_name)
      VALUES (v_system_user_id, 'system', 'system', 'System');
      
      INSERT INTO profiles (id, username, full_name)
      VALUES (v_system_user_id, 'system', 'System');
    END IF;
    
    -- Create general channel
    INSERT INTO channels (name, description, type, created_by)
    VALUES ('general', 'General discussion for all team members', 'public', v_system_user_id);
  END IF;
END;
$$;