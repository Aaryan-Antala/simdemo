/*
  # Create Gmail tokens table for persistent storage

  1. New Tables
    - `gmail_tokens`
      - `user_id` (uuid, primary key, references profiles)
      - `access_token` (text, encrypted access token)
      - `refresh_token` (text, encrypted refresh token)
      - `token_type` (text, usually 'Bearer')
      - `expires_at` (timestamptz, when token expires)
      - `scope` (text, granted scopes)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `gmail_tokens` table
    - Add policy for users to manage their own tokens only
    - Add indexes for performance

  3. Features
    - Automatic token expiration handling
    - Secure storage of OAuth2 tokens
    - User-specific token isolation
*/

-- Create gmail_tokens table
CREATE TABLE IF NOT EXISTS gmail_tokens (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  token_type text DEFAULT 'Bearer',
  expires_at timestamptz NOT NULL,
  scope text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own Gmail tokens"
  ON gmail_tokens
  FOR ALL
  TO authenticated
  USING (user_id = get_current_user_id())
  WITH CHECK (user_id = get_current_user_id());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_gmail_tokens_user_id ON gmail_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_tokens_expires_at ON gmail_tokens(expires_at);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_gmail_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_gmail_tokens_updated_at
  BEFORE UPDATE ON gmail_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_gmail_tokens_updated_at();