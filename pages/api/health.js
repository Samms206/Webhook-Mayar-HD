// ========================================
// QUIZ APP - HEALTH CHECK ENDPOINT
// Simple health check for monitoring webhook server
// ========================================

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for health check
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      status: 'error',
      message: 'Method not allowed'
    });
  }

  try {
    // Test database connection
    const { data, error } = await supabase
      .from('payment_sessions')
      .select('count')
      .limit(1);

    const dbStatus = error ? 'disconnected' : 'connected';
    
    // Calculate uptime (approximation)
    const uptime = process.uptime();
    
    const healthInfo = {
      status: 'healthy',
      timestamp: timestamp,
      service: 'Quiz App Webhook Mayar',
      version: '2.0.0',
      framework: 'Next.js',
      environment: process.env.NODE_ENV || 'production',
      
      // System info
      system: {
        uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
        memory: process.memoryUsage(),
        node_version: process.version
      },
      
      // Service status
      services: {
        webhook_endpoint: 'active',
        database: dbStatus,
        supabase: dbStatus
      },
      
      // Configuration check
      config: {
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing',
        service_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configured' : 'missing',
        mayar_api_key: process.env.MAYAR_API_KEY ? 'configured' : 'missing',
        webhook_token: process.env.MAYAR_WEBHOOK_TOKEN ? 'configured' : 'missing'
      },
      
      // Endpoints
      endpoints: {
        webhook: '/api/webhook',
        health: '/api/health',
        methods: ['GET', 'POST']
      }
    };

    console.log(`💚 [${timestamp}] Health check - Status: healthy`);
    
    return res.status(200).json(healthInfo);
    
  } catch (error) {
    console.error(`❤️ [${timestamp}] Health check failed:`, error);
    
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: timestamp,
      error: error.message,
      service: 'Quiz App Webhook Mayar'
    });
  }
}