/*
  # Fix Duplicate Channel Members Error

  1. Improved Logic
    - Better handling of existing channels
    - Proper conflict resolution for channel members
    - Avoid duplicate channel creation
    - Safe user addition to channels

  2. Changes
    - Enhanced create_default_workspace_data_for_user function
    - Better channel existence checking
    - Improved member addition logic
*/

-- Drop triggers first (they depend on functions)
DROP TRIGGER IF EXISTS auto_join_general_trigger ON user_accounts;
DROP TRIGGER IF EXISTS create_default_workspace_trigger ON user_accounts;
DROP TRIGGER IF EXISTS handle_new_user_signup_trigger ON profiles;

-- Now drop functions safely
DROP FUNCTION IF EXISTS auto_join_general_channel();
DROP FUNCTION IF EXISTS create_default_workspace_data();
DROP FUNCTION IF EXISTS handle_new_user_signup();
DROP FUNCTION IF EXISTS create_default_workspace_data_for_user(uuid);
DROP FUNCTION IF EXISTS register_user(text, text, text);

-- Updated register_user function with better error handling
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
  
  -- Get general channel (ensure it exists)
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
  
  -- Add user to general channel (with conflict handling)
  INSERT INTO channel_members (channel_id, user_id, role)
  VALUES (v_general_channel_id, v_user_id, 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;
  
  -- Create default workspace data for this user
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

-- Improved function to create default workspace data for a specific user
CREATE OR REPLACE FUNCTION create_default_workspace_data_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_channel_id uuid;
  v_random_channel_id uuid;
  v_project_channel_id uuid;
  v_private_channel_id uuid;
BEGIN
  -- Get or create random channel
  SELECT id INTO v_random_channel_id 
  FROM channels 
  WHERE name = 'random' AND type = 'public'
  LIMIT 1;
  
  IF v_random_channel_id IS NULL THEN
    INSERT INTO channels (name, description, type, created_by)
    VALUES ('random', 'Random discussions and off-topic conversations', 'public', p_user_id)
    RETURNING id INTO v_random_channel_id;
    
    -- Add some default messages to new channel
    INSERT INTO messages (channel_id, sender_id, content, type)
    VALUES 
      (v_random_channel_id, p_user_id, 'Welcome to the random channel! 🎉', 'system'),
      (v_random_channel_id, p_user_id, 'Feel free to share anything here - memes, jokes, or just casual chat!', 'system');
  END IF;
  
  -- Add user to random channel (with conflict handling)
  INSERT INTO channel_members (channel_id, user_id, role)
  VALUES (v_random_channel_id, p_user_id, 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;
  
  -- Get or create project updates channel
  SELECT id INTO v_project_channel_id 
  FROM channels 
  WHERE name = 'project-updates' AND type = 'public'
  LIMIT 1;
  
  IF v_project_channel_id IS NULL THEN
    INSERT INTO channels (name, description, type, created_by)
    VALUES ('project-updates', 'Share project progress and important updates', 'public', p_user_id)
    RETURNING id INTO v_project_channel_id;
    
    -- Add some default messages to new channel
    INSERT INTO messages (channel_id, sender_id, content, type)
    VALUES 
      (v_project_channel_id, p_user_id, '📋 Welcome to project updates!', 'system'),
      (v_project_channel_id, p_user_id, 'Use this channel to share progress, milestones, and important project news.', 'system');
  END IF;
  
  -- Add user to project updates channel (with conflict handling)
  INSERT INTO channel_members (channel_id, user_id, role)
  VALUES (v_project_channel_id, p_user_id, 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;
  
  -- Get or create private team leads channel
  SELECT id INTO v_private_channel_id 
  FROM channels 
  WHERE name = 'team-leads' AND type = 'private'
  LIMIT 1;
  
  IF v_private_channel_id IS NULL THEN
    INSERT INTO channels (name, description, type, created_by, metadata)
    VALUES ('team-leads', 'Private discussions for team leadership', 'private', p_user_id, '{"password": "teamlead123"}')
    RETURNING id INTO v_private_channel_id;
    
    -- Add some default messages to new channel
    INSERT INTO messages (channel_id, sender_id, content, type)
    VALUES 
      (v_private_channel_id, p_user_id, '🔒 Welcome to the team leads private channel', 'system'),
      (v_private_channel_id, p_user_id, 'Password: teamlead123 - Share this with other team leads to join!', 'system');
  END IF;
  
  -- Add user to private channel as admin (with conflict handling)
  INSERT INTO channel_members (channel_id, user_id, role)
  VALUES (v_private_channel_id, p_user_id, 'admin')
  ON CONFLICT (channel_id, user_id) DO NOTHING;
  
  -- Create some default tasks for this user
  INSERT INTO tasks (title, description, priority, status, created_by, due_date)
  VALUES 
    ('Welcome to SimAlly! 🎉', 'Take a tour of the workspace features: try creating tasks, scheduling meetings, and chatting with AI assistance.', 'medium', 'todo', p_user_id, (now() + interval '3 days')::timestamptz),
    ('Set up your profile', 'Update your profile information and avatar to personalize your workspace experience.', 'low', 'todo', p_user_id, (now() + interval '1 day')::timestamptz),
    ('Explore AI Features', 'Try mentioning @someone in chat to auto-create tasks, or ask the AI assistant for help with productivity.', 'high', 'todo', p_user_id, (now() + interval '2 days')::timestamptz);
  
  -- Create a sample calendar event for this user
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

-- Create new simplified trigger function
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

-- Ensure general channel exists with proper system user
DO $$
DECLARE
  v_general_channel_id uuid;
  v_system_user_id uuid;
BEGIN
  -- Check if general channel exists
  SELECT id INTO v_general_channel_id FROM channels WHERE name = 'general' AND type = 'public';
  
  -- If it doesn't exist, create it with a system user
  IF v_general_channel_id IS NULL THEN
    -- Get or create system user
    SELECT id INTO v_system_user_id FROM user_accounts WHERE username = 'system';
    
    IF v_system_user_id IS NULL THEN
      v_system_user_id := gen_random_uuid();
      
      -- Create system user account
      INSERT INTO user_accounts (id, username, password_hash, full_name)
      VALUES (v_system_user_id, 'system', 'system', 'System');
      
      -- Create system user profile
      INSERT INTO profiles (id, username, full_name)
      VALUES (v_system_user_id, 'system', 'System');
    END IF;
    
    -- Create general channel
    INSERT INTO channels (name, description, type, created_by)
    VALUES ('general', 'General discussion for all team members', 'public', v_system_user_id)
    RETURNING id INTO v_general_channel_id;
    
    -- Add welcome message to general channel
    INSERT INTO messages (channel_id, sender_id, content, type)
    VALUES (v_general_channel_id, v_system_user_id, 'Welcome to SimAlly! 🎉 This is the general channel where everyone can chat.', 'system');
  END IF;
END;
$$;