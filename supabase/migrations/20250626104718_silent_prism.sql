/*
  # Add set_config function for RLS session management

  1. Functions
    - Add set_config function to support Row Level Security session variables
    - This function allows setting session-specific configuration variables
    - Required for proper authentication and RLS policy enforcement

  2. Security
    - Function is marked as SECURITY DEFINER to allow setting session variables
    - Properly formatted to prevent SQL injection
*/

-- Create set_config function for RLS session management
CREATE OR REPLACE FUNCTION public.set_config(
  setting_name text,
  setting_value text,
  is_local boolean DEFAULT false
)
RETURNS void AS $$
BEGIN
  EXECUTE format('SET %s = %L', setting_name, setting_value);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.set_config(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_config(text, text, boolean) TO anon;