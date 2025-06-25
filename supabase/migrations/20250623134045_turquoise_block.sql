/*
  # Complete Workspace Database Functions

  1. Database Functions
    - get_current_user_id() - Get current authenticated user ID
    - Auto-join users to general channel
    - Real-time subscriptions setup
    - Message processing with AI task detection

  2. Security
    - Row Level Security policies
    - User authentication checks
    - Channel membership validation

  3. Real-time Features
    - Message broadcasting
    - Task updates
    - Channel member changes
*/

-- Function to get current user ID from custom auth
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id uuid;
  token_value text;
BEGIN
  -- Get the token from the current setting
  token_value := current_setting('app.current_user_token', true);
  
  IF token_value IS NULL OR token_value = '' THEN
    RETURN NULL;
  END IF;
  
  -- Get user ID from valid session
  SELECT us.user_id INTO user_id
  FROM user_sessions us
  WHERE us.token = token_value
    AND us.expires_at > now();
  
  RETURN user_id;
END;
$$;

-- Function to auto-join users to general channel
CREATE OR REPLACE FUNCTION auto_join_general_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  general_channel_id uuid;
BEGIN
  -- Find or create general channel
  SELECT id INTO general_channel_id
  FROM channels
  WHERE name = 'general' AND type = 'public'
  LIMIT 1;
  
  IF general_channel_id IS NULL THEN
    -- Create general channel
    INSERT INTO channels (name, description, type, created_by)
    VALUES ('general', 'General discussion for everyone', 'public', NEW.id)
    RETURNING id INTO general_channel_id;
  END IF;
  
  -- Add user to general channel
  INSERT INTO channel_members (channel_id, user_id, role)
  VALUES (general_channel_id, NEW.id, 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-join users to general channel
DROP TRIGGER IF EXISTS auto_join_general_trigger ON user_accounts;
CREATE TRIGGER auto_join_general_trigger
  AFTER INSERT ON user_accounts
  FOR EACH ROW
  EXECUTE FUNCTION auto_join_general_channel();

-- Function to handle new channel creation
CREATE OR REPLACE FUNCTION handle_new_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Add creator as admin member
  INSERT INTO channel_members (channel_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'admin');
  
  RETURN NEW;
END;
$$;

-- Trigger for new channel creation
DROP TRIGGER IF EXISTS handle_new_channel_trigger ON channels;
CREATE TRIGGER handle_new_channel_trigger
  AFTER INSERT ON channels
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_channel();

-- Function to extract mentions from message content
CREATE OR REPLACE FUNCTION extract_mentions(content text)
RETURNS text[]
LANGUAGE plpgsql
AS $$
DECLARE
  mentions text[];
  mention_pattern text := '@(\w+)';
BEGIN
  SELECT array_agg(matches[1])
  INTO mentions
  FROM regexp_split_to_table(content, '\s+') AS word,
       regexp_matches(word, mention_pattern, 'g') AS matches;
  
  RETURN COALESCE(mentions, ARRAY[]::text[]);
END;
$$;

-- Function to check if message contains task indicators
CREATE OR REPLACE FUNCTION contains_task_indicators(content text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  task_keywords text[] := ARRAY['todo', 'task', 'assign', 'deadline', 'due', 'complete', 'finish', 'work on', 'handle', 'take care of'];
  keyword text;
BEGIN
  content := lower(content);
  
  FOREACH keyword IN ARRAY task_keywords
  LOOP
    IF position(keyword IN content) > 0 THEN
      RETURN true;
    END IF;
  END LOOP;
  
  RETURN false;
END;
$$;

-- Update RLS policies to use the custom auth function
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view all profiles"
  ON profiles
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO public
  WITH CHECK (id = get_current_user_id());

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO public
  USING (id = get_current_user_id());

-- Channel policies
DROP POLICY IF EXISTS "Users can view channels they're members of" ON channels;
CREATE POLICY "Users can view channels they're members of"
  ON channels
  FOR SELECT
  TO public
  USING (
    (id IN (
      SELECT channel_id 
      FROM channel_members 
      WHERE user_id = get_current_user_id()
    )) OR (type = 'public')
  );

DROP POLICY IF EXISTS "Users can create channels" ON channels;
CREATE POLICY "Users can create channels"
  ON channels
  FOR INSERT
  TO public
  WITH CHECK (created_by = get_current_user_id());

DROP POLICY IF EXISTS "Channel creators can update their channels" ON channels;
CREATE POLICY "Channel creators can update their channels"
  ON channels
  FOR UPDATE
  TO public
  USING (created_by = get_current_user_id());

-- Channel members policies
DROP POLICY IF EXISTS "Users can view channel members for their channels" ON channel_members;
CREATE POLICY "Users can view channel members for their channels"
  ON channel_members
  FOR SELECT
  TO public
  USING (
    channel_id IN (
      SELECT channel_id 
      FROM channel_members 
      WHERE user_id = get_current_user_id()
    )
  );

DROP POLICY IF EXISTS "Users can join public channels" ON channel_members;
CREATE POLICY "Users can join public channels"
  ON channel_members
  FOR INSERT
  TO public
  WITH CHECK (
    (user_id = get_current_user_id()) AND 
    (channel_id IN (
      SELECT id 
      FROM channels 
      WHERE type = 'public'
    ))
  );

DROP POLICY IF EXISTS "Channel admins can manage members" ON channel_members;
CREATE POLICY "Channel admins can manage members"
  ON channel_members
  FOR ALL
  TO public
  USING (
    channel_id IN (
      SELECT channel_id 
      FROM channel_members 
      WHERE user_id = get_current_user_id() AND role = 'admin'
    )
  );

-- Messages policies
DROP POLICY IF EXISTS "Users can view messages in their channels" ON messages;
CREATE POLICY "Users can view messages in their channels"
  ON messages
  FOR SELECT
  TO public
  USING (
    channel_id IN (
      SELECT channel_id 
      FROM channel_members 
      WHERE user_id = get_current_user_id()
    )
  );

DROP POLICY IF EXISTS "Users can send messages to their channels" ON messages;
CREATE POLICY "Users can send messages to their channels"
  ON messages
  FOR INSERT
  TO public
  WITH CHECK (
    (sender_id = get_current_user_id()) AND 
    (channel_id IN (
      SELECT channel_id 
      FROM channel_members 
      WHERE user_id = get_current_user_id()
    ))
  );

-- Tasks policies
DROP POLICY IF EXISTS "Users can view tasks assigned to them or created by them" ON tasks;
CREATE POLICY "Users can view tasks assigned to them or created by them"
  ON tasks
  FOR SELECT
  TO public
  USING (
    (created_by = get_current_user_id()) OR 
    (id IN (
      SELECT task_id 
      FROM task_assignments 
      WHERE user_id = get_current_user_id()
    ))
  );

DROP POLICY IF EXISTS "Users can create tasks" ON tasks;
CREATE POLICY "Users can create tasks"
  ON tasks
  FOR INSERT
  TO public
  WITH CHECK (created_by = get_current_user_id());

DROP POLICY IF EXISTS "Task creators can update their tasks" ON tasks;
CREATE POLICY "Task creators can update their tasks"
  ON tasks
  FOR UPDATE
  TO public
  USING (created_by = get_current_user_id());

-- Task assignments policies
DROP POLICY IF EXISTS "Users can view their task assignments" ON task_assignments;
CREATE POLICY "Users can view their task assignments"
  ON task_assignments
  FOR SELECT
  TO public
  USING (
    (user_id = get_current_user_id()) OR 
    (task_id IN (
      SELECT id 
      FROM tasks 
      WHERE created_by = get_current_user_id()
    ))
  );

DROP POLICY IF EXISTS "Task creators can assign tasks" ON task_assignments;
CREATE POLICY "Task creators can assign tasks"
  ON task_assignments
  FOR INSERT
  TO public
  WITH CHECK (
    task_id IN (
      SELECT id 
      FROM tasks 
      WHERE created_by = get_current_user_id()
    )
  );

-- Calendar events policies
DROP POLICY IF EXISTS "Users can manage their own calendar events" ON calendar_events;
CREATE POLICY "Users can manage their own calendar events"
  ON calendar_events
  FOR ALL
  TO public
  USING (user_id = get_current_user_id())
  WITH CHECK (user_id = get_current_user_id());

-- Enable real-time subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE channels;
ALTER PUBLICATION supabase_realtime ADD TABLE channel_members;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE task_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE calendar_events;