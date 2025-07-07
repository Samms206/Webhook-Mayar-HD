
import { createClient } from '@supabase/supabase-js';

// Supabase configuration dari environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseServiceKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
}

// Create Supabase client dengan service role key untuk server-side operations
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Create client dengan anon key untuk client-side operations (jika diperlukan)
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey);

// Test connection pada startup
async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('payment_sessions')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Supabase connection failed:', error.message);
    } else {
      console.log('✅ Supabase connection successful');
    }
  } catch (error) {
    console.error('❌ Supabase connection test failed:', error.message);
  }
}

// Test connection saat module dimuat
testConnection();

export default supabase;