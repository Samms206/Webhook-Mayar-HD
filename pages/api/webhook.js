// ========================================
// QUIZ APP - MAYAR WEBHOOK HANDLER
// Next.js API Route for Mayar payment webhooks
// 
// CURRENT STATUS: ✅ PRODUCTION READY
// URL: https://webhook-mayar-hd-u2cl.vercel.app/api/webhook
// ========================================

import { createClient } from '@supabase/supabase-js';
import Cors from 'cors';

// Initialize CORS middleware
const cors = Cors({
  methods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
  origin: '*',
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Initialize Supabase client with production credentials
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper function to run middleware
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

// Main webhook handler
export default async function handler(req, res) {
  // Run CORS middleware
  await runMiddleware(req, res, cors);

  const timestamp = new Date().toISOString();
  console.log(`🌐 [${timestamp}] Webhook accessed:`, {
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type']
  });

  try {
    // ==========================================
    // GET REQUEST - Status & Testing
    // ==========================================
    if (req.method === 'GET') {
      console.log('✅ GET Request - Webhook status check');
      
      const webhookUrl = `https://${req.headers.host}/api/webhook`;
      
      return res.status(200).json({
        status: 'success',
        message: '🚀 Quiz App Mayar Webhook Handler - READY!',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        framework: 'Next.js API Routes',
        webhook_url: webhookUrl,
        environment: process.env.NODE_ENV || 'production',
        
        // Current production configuration
        mayar_config: {
          webhook_url: webhookUrl,
          supported_events: ['payment.received'],
          supported_methods: ['POST'],
          format: 'Mayar Standard Format'
        },
        
        // Test payload based on actual Vercel logs
        test_payload: {
          event: 'payment.received',
          data: {
            id: '5ad53d1e-19e3-4f45-b949-6fd4a4a05584',
            transactionId: '5ad53d1e-19e3-4f45-b949-6fd4a4a05584',
            status: 'SUCCESS',
            transactionStatus: 'paid',
            amount: 0,  // Supports zero amount for free quizzes
            customerEmail: 'testingquiz@gmail.com',
            customerName: 'Development'
          }
        },
        
        // Integration instructions
        instructions: {
          'Mayar Dashboard Setup': `Configure webhook URL: ${webhookUrl}`,
          'Event Type': 'payment.received',
          'Method': 'POST',
          'Content-Type': 'application/json',
          'Testing': 'Send POST request with test_payload structure'
        },
        
        // Database integration status
        database_status: {
          supabase_connected: !!(process.env.SUPABASE_SERVICE_ROLE_KEY),
          functions_available: [
            'find_payment_session()',
            'process_mayar_payment()',
            'cleanup_expired_payment_sessions()'
          ]
        }
      });
    }

    // ==========================================
    // POST REQUEST - Webhook Processing
    // ==========================================
    if (req.method === 'POST') {
      console.log(`📦 [${timestamp}] POST Request - Processing Mayar webhook`);
      console.log('📊 Request Body:', JSON.stringify(req.body, null, 2));

      const { event, data } = req.body || {};

      // ==========================================
      // STEP 1: Validate Webhook Structure
      // ==========================================
      if (!event || !data) {
        console.error('❌ Invalid webhook structure');
        return res.status(400).json({ 
          statusCode: 400, 
          messages: 'Invalid webhook structure - missing event or data' 
        });
      }

      // ==========================================
      // STEP 2: Extract Mayar Data Fields  
      // ==========================================
      const {
        transactionId,
        status,
        transactionStatus,
        amount,
        customerEmail,
        customerName,
        id
      } = data;

      console.log('📋 Extracted Mayar Fields:', {
        event,
        transactionId,
        status,
        transactionStatus,
        amount: amount + ' (' + typeof amount + ')',
        customerEmail,
        customerName,
        webhookId: id
      });

      // ==========================================
      // STEP 3: Validate Required Fields
      // ==========================================
      if (!transactionId || !status || !customerEmail || amount === undefined) {
        const missing = [];
        if (!transactionId) missing.push('transactionId');
        if (!status) missing.push('status');
        if (!customerEmail) missing.push('customerEmail');
        if (amount === undefined) missing.push('amount');
        
        console.error('❌ Missing required fields:', missing);
        return res.status(400).json({ 
          statusCode: 400, 
          messages: `Missing required fields: ${missing.join(', ')}` 
        });
      }

      // ==========================================
      // STEP 4: Validate Payment Success
      // ==========================================
      const isPaymentSuccessful = (
        status === 'SUCCESS' || 
        transactionStatus === 'paid' ||
        status === 'paid'
      );

      if (event !== 'payment.received') {
        console.log('⏭️  Ignoring webhook - wrong event type:', event);
        return res.status(200).json({ 
          statusCode: 200, 
          messages: 'Webhook ignored - not a payment.received event' 
        });
      }

      if (!isPaymentSuccessful) {
        console.log('⏭️  Ignoring webhook - payment not successful:', {
          status,
          transactionStatus
        });
        return res.status(200).json({ 
          statusCode: 200, 
          messages: 'Webhook ignored - payment not successful' 
        });
      }

      console.log('✅ Valid successful payment webhook confirmed');

      // ==========================================
      // STEP 5: Process Amount (Support Zero)
      // ==========================================
      const numericAmount = Number(amount) || 0;
      console.log('💰 Amount Processing:', { 
        original: amount,
        numeric: numericAmount,
        isZero: numericAmount === 0,
        type: typeof amount
      });

      // ==========================================
      // STEP 6: Find Matching Payment Session
      // ==========================================
      console.log('🔍 Searching for matching payment session...');
      const { data: matchingSession, error: findError } = await supabase
        .rpc('find_payment_session', {
          p_email: customerEmail,
          p_amount: numericAmount,
          p_time_window_minutes: 30
        });

      if (findError) {
        console.error('❌ Database error in find_payment_session:', findError);
        return res.status(500).json({ 
          statusCode: 500, 
          messages: 'Database error finding payment session' 
        });
      }

      if (!matchingSession || matchingSession.length === 0) {
        console.error('❌ No matching payment session found for:', {
          customerEmail,
          amount: numericAmount,
          timeWindow: '30 minutes'
        });
        
        // Debug: Show recent sessions for this email
        const { data: debugSessions } = await supabase
          .from('payment_sessions')
          .select('session_id, expected_amount, status, created_at')
          .eq('user_email', customerEmail)
          .order('created_at', { ascending: false })
          .limit(3);
        
        console.log('🔍 Recent sessions for debugging:', debugSessions);
        
        return res.status(404).json({ 
          statusCode: 404, 
          messages: 'No matching payment session found' 
        });
      }

      const session = matchingSession[0];
      console.log('✅ Found matching payment session:', {
        sessionId: session.session_id,
        userId: session.user_id,
        categoryId: session.category_id,
        expectedAmount: session.expected_amount,
        status: session.status
      });

      // ==========================================
      // STEP 7: Process Payment & Grant Access
      // ==========================================
      console.log('💳 Processing payment and granting access...');
      const { data: paymentResult, error: processError } = await supabase
        .rpc('process_mayar_payment', {
          p_session_id: session.session_id,
          p_mayar_transaction_id: transactionId,
          p_mayar_webhook_id: id || transactionId
        });

      if (processError) {
        console.error('❌ Payment processing failed:', processError);
        return res.status(500).json({ 
          statusCode: 500, 
          messages: 'Payment processing failed' 
        });
      }

      console.log('🎉 Payment processed successfully!');
      console.log('📊 Payment Result:', paymentResult);

      // ==========================================
      // STEP 8: Success Response
      // ==========================================
      return res.status(200).json({ 
        statusCode: 200, 
        messages: 'success',
        data: {
          session_id: session.session_id,
          transaction_id: paymentResult?.transaction_id,
          user_id: paymentResult?.user_id,
          category_id: paymentResult?.category_id,
          processed_at: new Date().toISOString()
        }
      });
    }

    // ==========================================
    // Method Not Allowed
    // ==========================================
    return res.status(405).json({ 
      statusCode: 405,
      messages: `Method ${req.method} not allowed. Use GET for testing or POST for webhook.` 
    });

  } catch (error) {
    // ==========================================
    // Error Handling
    // ==========================================
    console.error('❌ Webhook processing error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({ 
      statusCode: 500, 
      messages: 'Internal server error during webhook processing' 
    });
  }
}

// ==========================================
// Export configuration for Next.js
// ==========================================
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};