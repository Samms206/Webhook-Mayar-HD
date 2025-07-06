// Next.js API Route untuk Mayar Webhook
// File: pages/api/webhook.js

import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// CORS headers untuk semua responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req, res) {
  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle OPTIONS request (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET request - Testing endpoint
  if (req.method === 'GET') {
    console.log('🌐 GET request to webhook endpoint');
    
    const response = {
      status: 'success',
      message: 'Mayar Webhook Server is Running! 🚀',
      timestamp: new Date().toISOString(),
      framework: 'Next.js',
      endpoint: '/api/webhook',
      methods: ['GET', 'POST'],
      environment: process.env.NODE_ENV || 'development',
      test_payload: {
        order_id: 'quiz_1234567890_abcdef123',
        status: 'paid',
        amount: 50000,
        customer_email: 'user@example.com',
        customer_name: 'John Doe',
        webhook_history_id: '9f8050f0-9a58-4432-bf36-a7eeff7d6aea'
      },
      instructions: {
        'For Mayar Dashboard': 'Use this URL in your Mayar webhook settings',
        'Testing': 'Send POST request with test_payload structure',
        'Expected Response': '{ statusCode: 200, messages: "success" }'
      }
    };

    res.status(200).json(response);
    return;
  }

  // POST request - Webhook handler
  if (req.method === 'POST') {
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
            currency: payment.currency || 'IDR'
          });

        if (unlockError) {
          console.error('❌ Quiz unlock error:', unlockError);
        } else {
          console.log('✅ Quiz content unlocked for user:', payment.user_id);
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
          success: true,
          source: 'mayar'
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
            error_message: error.message,
            source: 'mayar'
          });
      } catch (logError) {
        console.error('❌ Failed to log webhook error:', logError);
      }

      res.status(500).json({
        statusCode: 500,
        messages: "Internal server error"
      });
    }
    return;
  }

  // Method not allowed
  res.status(405).json({
    statusCode: 405,
    messages: "Method not allowed"
  });
}