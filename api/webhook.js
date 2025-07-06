// Mayar Webhook Handler for Vercel
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Import Supabase
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Webhook endpoint for Mayar
app.post('/api/webhook', async (req, res) => {
  console.log('🔔 Mayar Webhook received');
  console.log('📅 Timestamp:', new Date().toISOString());
  console.log('📦 Headers:', req.headers);
  console.log('📦 Body:', req.body);

  try {
    const webhookData = req.body;
    
    // Validate required fields
    const { order_id, status, amount } = webhookData;
    
    if (!order_id || !status) {
      console.error('❌ Missing required fields:', { order_id, status });
      return res.status(400).json({
        statusCode: 400,
        messages: "Missing required fields: order_id and status"
      });
    }

    console.log('✅ Webhook validation passed');
    console.log('📋 Processing order:', order_id, 'with status:', status);

    // Update payment status in database
    const { data: payment, error: updateError } = await supabase
      .from('payments')
      .update({
        status: status,
        paid_at: status === 'paid' ? new Date().toISOString() : null,
        webhook_data: webhookData,
        webhook_received_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('order_id', order_id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Database update error:', updateError);
      return res.status(500).json({
        statusCode: 500,
        messages: "Database update failed"
      });
    }

    console.log('✅ Payment status updated in database');

    // If payment successful, unlock quiz content
    if (status === 'paid' && payment) {
      console.log('💳 Payment successful, unlocking quiz content...');
      
      const { error: unlockError } = await supabase
        .from('user_purchases')
        .upsert({
          user_id: payment.user_id,
          quiz_id: payment.quiz_id,
          order_id: payment.order_id,
          purchased_at: new Date().toISOString(),
          is_active: true,
          amount_paid: payment.amount,
          currency: payment.currency
        });

      if (unlockError) {
        console.error('❌ Quiz unlock error:', unlockError);
      } else {
        console.log('✅ Quiz content unlocked for user:', payment.user_id);
      }

      // Send success notification email (optional)
      try {
        await sendPaymentNotification(payment, webhookData);
      } catch (emailError) {
        console.error('⚠️ Email notification failed:', emailError);
        // Don't fail the webhook for email errors
      }
    }

    // Log webhook for monitoring
    await supabase
      .from('webhook_logs')
      .insert({
        order_id: order_id,
        status: status,
        webhook_data: webhookData,
        processed_at: new Date().toISOString(),
        success: true
      });

    console.log('✅ Webhook processed successfully');

    // Return success response (required by Mayar)
    res.status(200).json({
      statusCode: 200,
      messages: "success"
    });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);

    // Log error webhook
    try {
      await supabase
        .from('webhook_logs')
        .insert({
          order_id: req.body?.order_id || 'unknown',
          status: req.body?.status || 'error',
          webhook_data: req.body,
          processed_at: new Date().toISOString(),
          success: false,
          error_message: error.message
        });
    } catch (logError) {
      console.error('❌ Failed to log webhook error:', logError);
    }

    res.status(500).json({
      statusCode: 500,
      messages: "Internal server error"
    });
  }
});

// GET endpoint for testing
app.get('/api/webhook', (req, res) => {
  console.log('🌐 GET request to webhook endpoint');
  
  const response = {
    status: 'success',
    message: 'Mayar Webhook Server is Running! 🚀',
    timestamp: new Date().toISOString(),
    endpoint: '/api/webhook',
    methods: ['GET', 'POST'],
    server: 'Vercel Functions',
    environment: process.env.NODE_ENV || 'development',
    test_payload: {
      order_id: 'quiz_1234567890_abcdef123',
      status: 'paid',
      amount: 50000,
      customer_email: 'user@example.com',
      customer_name: 'John Doe',
      webhook_history_id: '9f8050f0-9a58-4432-bf36-a7eeff7d6aea'
    }
  };

  res.json(response);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    server: 'Mayar Webhook Server',
    version: '1.0.0'
  });
});

// Send payment notification email
async function sendPaymentNotification(payment, webhookData) {
  // This is optional - implement if you want email notifications
  console.log('📧 Sending payment notification for order:', payment.order_id);
  
  // You can implement email sending here using nodemailer
  // or any email service like SendGrid, Mailgun, etc.
  
  return true;
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('💥 Unhandled error:', error);
  res.status(500).json({
    statusCode: 500,
    messages: "Internal server error"
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    statusCode: 404,
    messages: "Endpoint not found"
  });
});

const PORT = process.env.PORT || 3000;

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Webhook server running on port ${PORT}`);
    console.log(`📡 Webhook URL: http://localhost:${PORT}/api/webhook`);
  });
}

// Export for Vercel
module.exports = app;