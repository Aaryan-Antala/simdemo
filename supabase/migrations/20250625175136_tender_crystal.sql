/*
  # Fix Password Authentication

  1. Database Functions
    - Update register_user function with proper password hashing
    - Update login_user function with proper password verification
    - Ensure consistent password handling

  2. Security
    - Use proper password hashing with salt
    - Secure session token generation
    - Proper error handling
*/

-- Drop existing functions to recreate them
DROP FUNCTION IF EXISTS register_user(text, text, text);
DROP FUNCTION IF EXISTS login_user(text, text);
DROP FUNCTION IF EXISTS verify_session(text);
DROP FUNCTION IF EXISTS logout_user(text);

-- Create register_user function with proper password hashing
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
  v_result jsonb;
BEGIN
  -- Check if username already exists
  IF EXISTS (SELECT 1 FROM user_accounts WHERE username = p_username) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Username already exists'
    );
  END IF;

  -- Generate password hash using crypt with a random salt
  v_password_hash := crypt(p_password, gen_salt('bf', 8));
  
  -- Generate new user ID
  v_user_id := gen_random_uuid();
  
  -- Insert user account
  INSERT INTO user_accounts (id, username, password_hash, full_name)
  VALUES (v_user_id, p_username, v_password_hash, p_full_name);
  
  -- Insert profile
  INSERT INTO profiles (id, username, full_name)
  VALUES (v_user_id, p_username, p_full_name);
  
  -- Generate session token and expiry
  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '30 days';
  
  -- Create session
  INSERT INTO user_sessions (user_id, token, expires_at)
  VALUES (v_user_id, v_token, v_expires_at);
  
  -- Build success response
  v_result := jsonb_build_object(
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
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Registration failed: ' || SQLERRM
    );
END;
$$;

-- Create login_user function with proper password verification
CREATE OR REPLACE FUNCTION login_user(
  p_username text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_record record;
  v_token text;
  v_expires_at timestamptz;
  v_result jsonb;
BEGIN
  -- Get user account with password hash
  SELECT ua.id, ua.username, ua.password_hash, p.full_name
  INTO v_user_record
  FROM user_accounts ua
  JOIN profiles p ON ua.id = p.id
  WHERE ua.username = p_username;
  
  -- Check if user exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid username or password'
    );
  END IF;
  
  -- Verify password using crypt
  IF NOT (v_user_record.password_hash = crypt(p_password, v_user_record.password_hash)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid username or password'
    );
  END IF;
  
  -- Generate new session token
  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '30 days';
  
  -- Delete any existing sessions for this user
  DELETE FROM user_sessions WHERE user_id = v_user_record.id;
  
  -- Create new session
  INSERT INTO user_sessions (user_id, token, expires_at)
  VALUES (v_user_record.id, v_token, v_expires_at);
  
  -- Build success response
  v_result := jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user_record.id,
      'username', v_user_record.username,
      'full_name', v_user_record.full_name
    ),
    'session', jsonb_build_object(
      'token', v_token,
      'expires_at', v_expires_at
    )
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Login failed: ' || SQLERRM
    );
END;
$$;

-- Create verify_session function
CREATE OR REPLACE FUNCTION verify_session(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_record record;
  v_result jsonb;
BEGIN
  -- Get session with user info
  SELECT 
    us.user_id,
    us.expires_at,
    ua.username,
    p.full_name
  INTO v_session_record
  FROM user_sessions us
  JOIN user_accounts ua ON us.user_id = ua.id
  JOIN profiles p ON us.user_id = p.id
  WHERE us.token = p_token
    AND us.expires_at > now();
  
  -- Check if session exists and is valid
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid or expired session'
    );
  END IF;
  
  -- Return success with user info
  v_result := jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_session_record.user_id,
      'username', v_session_record.username,
      'full_name', v_session_record.full_name
    )
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Session verification failed: ' || SQLERRM
    );
END;
$$;

-- Create logout_user function
CREATE OR REPLACE FUNCTION logout_user(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete the session
  DELETE FROM user_sessions WHERE token = p_token;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Logged out successfully'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Logout failed: ' || SQLERRM
    );
END;
$$;

-- Ensure pgcrypto extension is enabled for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;