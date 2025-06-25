/*
  # Complete Workspace Features Enhancement

  1. New Tables
    - `channel_invites` - For managing channel invite links
    - `default_channels` - For storing default channels for new users
    - `default_messages` - For storing default messages in channels
    - `default_tasks` - For storing default tasks for new users

  2. New Functions
    - `create_default_workspace_data()` - Creates default channels, messages, and tasks for new users
    - `cleanup_expired_invites()` - Removes expired invite links

  3. Security
    - Enable RLS on all new tables
    - Add appropriate policies for each table

  4. Triggers
    - Auto-create workspace data when new user account is created
*/

-- Channel invites table
CREATE TABLE IF NOT EXISTS channel_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invite_code text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  max_uses integer DEFAULT NULL,
  current_uses integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE channel_invites ENABLE ROW LEVEL SECURITY;

-- Policies for channel invites
CREATE POLICY "Channel members can create invites"
  ON channel_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM channel_members 
      WHERE channel_id = channel_invites.channel_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Channel members can view invites"
  ON channel_invites
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM channel_members 
      WHERE channel_id = channel_invites.channel_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Invite creators can delete invites"
  ON channel_invites
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Default channels for new users
CREATE TABLE IF NOT EXISTS default_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'private')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE default_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view default channels"
  ON default_channels
  FOR SELECT
  TO authenticated
  USING (true);

-- Default messages for channels
CREATE TABLE IF NOT EXISTS default_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_name text NOT NULL,
  content text NOT NULL,
  sender_name text NOT NULL DEFAULT 'System',
  message_order integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE default_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view default messages"
  ON default_messages
  FOR SELECT
  TO authenticated
  USING (true);

-- Default tasks for new users
CREATE TABLE IF NOT EXISTS default_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed', 'cancelled')),
  due_date_offset integer DEFAULT NULL, -- Days from now
  created_at timestamptz DEFAULT now()
);

ALTER TABLE default_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view default tasks"
  ON default_tasks
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert default channels
INSERT INTO default_channels (name, description, type) VALUES
  ('general', 'General discussion and announcements', 'public'),
  ('random', 'Random conversations and fun topics', 'public'),
  ('project-alpha', 'Private project discussions', 'private'),
  ('team-leads', 'Leadership team coordination', 'private')
ON CONFLICT DO NOTHING;

-- Insert default messages
INSERT INTO default_messages (channel_name, content, sender_name, message_order) VALUES
  ('general', 'Welcome to the workspace! 🎉 This is where we share important updates and announcements.', 'SimAlly Bot', 1),
  ('general', 'Feel free to introduce yourself and let everyone know what you''re working on!', 'SimAlly Bot', 2),
  ('random', 'This is our casual chat space! Share interesting links, memes, or just chat about anything.', 'SimAlly Bot', 1),
  ('random', 'Did you know? You can mention someone with @username to create tasks automatically!', 'SimAlly Bot', 2),
  ('project-alpha', 'Welcome to Project Alpha! This is our private space for project coordination.', 'Project Manager', 1),
  ('project-alpha', '@team Please review the project timeline and let me know if you have any concerns.', 'Project Manager', 2),
  ('team-leads', 'Leadership team sync space. Let''s keep our strategic discussions here.', 'CEO', 1),
  ('team-leads', 'Q4 planning meeting scheduled for next week. Please prepare your department updates.', 'CEO', 2)
ON CONFLICT DO NOTHING;

-- Insert default tasks
INSERT INTO default_tasks (title, description, priority, status, due_date_offset) VALUES
  ('Complete onboarding checklist', 'Review company policies, set up development environment, and meet your team members', 'high', 'todo', 3),
  ('Set up workspace preferences', 'Customize your profile, notification settings, and workspace layout', 'medium', 'todo', 1),
  ('Join team standup meeting', 'Attend the daily standup to sync with your team', 'medium', 'todo', 1),
  ('Review project documentation', 'Read through current project specs and technical documentation', 'medium', 'todo', 7),
  ('Schedule 1:1 with manager', 'Set up regular check-ins with your direct manager', 'high', 'todo', 5)
ON CONFLICT DO NOTHING;

-- Function to create default workspace data for new users
CREATE OR REPLACE FUNCTION create_default_workspace_data()
RETURNS TRIGGER AS $$
DECLARE
  channel_record RECORD;
  message_record RECORD;
  task_record RECORD;
  new_channel_id uuid;
  new_task_id uuid;
BEGIN
  -- Create default channels for the user
  FOR channel_record IN SELECT * FROM default_channels LOOP
    INSERT INTO channels (name, description, type, created_by)
    VALUES (channel_record.name, channel_record.description, channel_record.type, NEW.id)
    RETURNING id INTO new_channel_id;
    
    -- Add user as admin member
    INSERT INTO channel_members (channel_id, user_id, role)
    VALUES (new_channel_id, NEW.id, 'admin');
    
    -- Add default messages to the channel
    FOR message_record IN 
      SELECT * FROM default_messages 
      WHERE channel_name = channel_record.name 
      ORDER BY message_order 
    LOOP
      INSERT INTO messages (channel_id, sender_id, content, type)
      VALUES (new_channel_id, NEW.id, message_record.content, 'system');
    END LOOP;
  END LOOP;
  
  -- Create default tasks for the user
  FOR task_record IN SELECT * FROM default_tasks LOOP
    INSERT INTO tasks (title, description, priority, status, created_by, due_date)
    VALUES (
      task_record.title, 
      task_record.description, 
      task_record.priority, 
      task_record.status, 
      NEW.id,
      CASE 
        WHEN task_record.due_date_offset IS NOT NULL 
        THEN (now() + (task_record.due_date_offset || ' days')::interval)::timestamptz
        ELSE NULL
      END
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create default workspace data for new user accounts
DROP TRIGGER IF EXISTS create_default_workspace_trigger ON user_accounts;
CREATE TRIGGER create_default_workspace_trigger
  AFTER INSERT ON user_accounts
  FOR EACH ROW
  EXECUTE FUNCTION create_default_workspace_data();

-- Function to cleanup expired invites
CREATE OR REPLACE FUNCTION cleanup_expired_invites()
RETURNS void AS $$
BEGIN
  DELETE FROM channel_invites 
  WHERE expires_at < now() 
  OR (max_uses IS NOT NULL AND current_uses >= max_uses);
END;
$$ LANGUAGE plpgsql;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_channel_invites_code ON channel_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_channel_invites_channel ON channel_invites(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_invites_expires ON channel_invites(expires_at);

-- Add message editing support
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS original_content text;

-- Add channel summary support
CREATE TABLE IF NOT EXISTS channel_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  summary_content text NOT NULL,
  message_count integer NOT NULL DEFAULT 0,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE channel_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Channel members can view summaries"
  ON channel_summaries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM channel_members 
      WHERE channel_id = channel_summaries.channel_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Channel members can create summaries"
  ON channel_summaries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM channel_members 
      WHERE channel_id = channel_summaries.channel_id 
      AND user_id = auth.uid()
    )
  );