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
        version: '2.1.0',
        timestamp: new Date().toISOString(),
        framework: 'Next.js API Routes',
        webhook_url: webhookUrl,
        environment: process.env.NODE_ENV || 'production',
        
        // Updated matching strategy
        matching_strategy: {
          primary: 'exact_amount_match',
          fallback: 'email_and_timeframe_match',
          zero_amount_handling: 'supported',
          time_window: '30_minutes'
        },
        
        supported_formats: {
          production: {
            event: 'payment.received',
            required_fields: ['transactionId', 'status', 'customerEmail', 'amount'],
          },
          testing: {
            event: 'testing',
            required_fields: ['id', 'status', 'customerEmail', 'amount'],
          }
        },
        
        database_status: {
          supabase_connected: !!(process.env.SUPABASE_SERVICE_ROLE_KEY),
          functions_available: [
            'find_payment_session()',
            'find_payment_session_flexible()',
            'process_mayar_payment()'
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
      // STEP 2: Extract Mayar Data Fields (FLEXIBLE)
      // ==========================================
      let transactionId, status, transactionStatus, amount, customerEmail, customerName, id;

      if (data.transactionId) {
        transactionId = data.transactionId;
        status = data.status;
        transactionStatus = data.transactionStatus;
        amount = data.amount;
        customerEmail = data.customerEmail;
        customerName = data.customerName;
        id = data.id;
      } else if (data.id && !data.transactionId) {
        transactionId = data.id;
        status = data.status;
        transactionStatus = data.status;
        amount = data.amount;
        customerEmail = data.customerEmail;
        customerName = data.customerName;
        id = data.id;
      }

      console.log('📋 Extracted Mayar Fields:', {
        event,
        transactionId,
        status,
        transactionStatus,
        amount: amount + ' (' + typeof amount + ')',
        customerEmail,
        customerName,
        webhookId: id,
        detectedFormat: data.transactionId ? 'production' : 'testing'
      });

      // ==========================================
      // STEP 3: Validate Required Fields
      // ==========================================
      if (!transactionId || !status || !customerEmail || amount === undefined) {
        const missing = [];
        if (!transactionId) missing.push('transactionId/id');
        if (!status) missing.push('status');
        if (!customerEmail) missing.push('customerEmail');
        if (amount === undefined) missing.push('amount');
        
        console.error('❌ Missing required fields:', missing);
        return res.status(400).json({ 
          statusCode: 400, 
          messages: `Missing required fields: ${missing.join(', ')}`,
          available_fields: Object.keys(data)
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

      const isValidEvent = (
        event === 'payment.received' || 
        event === 'testing'
      );

      if (!isValidEvent) {
        console.log('⏭️  Ignoring webhook - unsupported event type:', event);
        return res.status(200).json({ 
          statusCode: 200, 
          messages: `Webhook ignored - unsupported event type: ${event}` 
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
      // STEP 5: Process Amount
      // ==========================================
      const numericAmount = Number(amount) || 0;
      console.log('💰 Amount Processing:', { 
        original: amount,
        numeric: numericAmount,
        isZero: numericAmount === 0,
        type: typeof amount
      });

      // ==========================================
      // STEP 6: Find Matching Payment Session (IMPROVED)
      // Try exact match first, then flexible matching
      // ==========================================
      console.log('🔍 Searching for matching payment session...');
      
      // Method 1: Exact amount match
      let { data: matchingSession, error: findError } = await supabase
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

      // Method 2: If no exact match and amount is 0, try flexible matching
      if ((!matchingSession || matchingSession.length === 0) && numericAmount === 0) {
        console.log('🔄 Exact match failed, trying flexible matching for zero amount...');
        
        // Find recent session for this email regardless of amount
        const { data: flexibleSession, error: flexibleError } = await supabase
          .from('payment_sessions')
          .select('*')
          .eq('user_email', customerEmail)
          .eq('status', 'pending')
          .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1);

        if (!flexibleError && flexibleSession && flexibleSession.length > 0) {
          console.log('✅ Found flexible match:', {
            sessionId: flexibleSession[0].session_id,
            expectedAmount: flexibleSession[0].expected_amount,
            actualAmount: numericAmount,
            reason: 'Zero amount payment - likely free quiz with promo/coupon'
          });
          matchingSession = flexibleSession;
        }
      }

      // ==========================================
      // STEP 7: Handle No Match Found
      // ==========================================
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
          messages: 'No matching payment session found',
          debug_info: {
            searched_email: customerEmail,
            searched_amount: numericAmount,
            recent_sessions: debugSessions || [],
            suggestions: [
              'Check if payment session was created correctly',
              'Verify email match between session and webhook',
              'Check if session is not expired (30 min window)',
              'For zero amount: verify this is intended (free quiz)'
            ]
          }
        });
      }

      const session = matchingSession[0];
      console.log('✅ Found matching payment session:', {
        sessionId: session.session_id,
        userId: session.user_id,
        categoryId: session.category_id,
        expectedAmount: session.expected_amount,
        actualAmount: numericAmount,
        status: session.status,
        matchType: session.expected_amount === numericAmount ? 'exact' : 'flexible'
      });

      // ==========================================
      // STEP 8: Process Payment & Grant Access
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
          messages: 'Payment processing failed',
          error_details: processError.message
        });
      }

      console.log('🎉 Payment processed successfully!');
      console.log('📊 Payment Result:', paymentResult);

      // ==========================================
      // STEP 9: Success Response
      // ==========================================  
      return res.status(200).json({ 
        statusCode: 200, 
        messages: 'success',
        webhook_info: {
          event_type: event,
          format_detected: data.transactionId ? 'production' : 'testing',
          transaction_id: transactionId,
          amount: numericAmount,
          match_type: session.expected_amount === numericAmount ? 'exact_amount' : 'flexible_email_time'
        },
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
      messages: 'Internal server error during webhook processing',
      error_info: error.message
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