// File: pages/api/webhook.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([key, val]) => res.setHeader(key, val));
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      endpoint: '/api/webhook',
    });
  }

  if (req.method === 'POST') {
    const webhookData = req.body;
    const { order_id, status } = webhookData;

    if (!order_id || !status) {
      return res.status(400).json({ statusCode: 400, messages: 'Missing required fields' });
    }

    try {
      const { data: payment, error: updateError } = await supabase
        .from('payments')
        .update({
          status,
          paid_at: status === 'paid' ? new Date().toISOString() : null,
          webhook_data: webhookData,
          webhook_received_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('order_id', order_id)
        .select()
        .single();

      if (updateError) throw updateError;

      if (status === 'paid' && payment) {
        await supabase.from('user_purchases').upsert({
          user_id: payment.user_id,
          quiz_id: payment.quiz_id,
          order_id: payment.order_id,
          purchased_at: new Date().toISOString(),
          is_active: true,
          amount_paid: payment.amount,
          currency: payment.currency || 'IDR',
        });
      }

      await supabase.from('webhook_logs').insert({
        order_id,
        status,
        webhook_data: webhookData,
        processed_at: new Date().toISOString(),
        success: true,
      });

      return res.status(200).json({ statusCode: 200, messages: 'success' });
    } catch (error) {
      await supabase.from('webhook_logs').insert({
        order_id: order_id || 'unknown',
        status: status || 'error',
        webhook_data: webhookData,
        processed_at: new Date().toISOString(),
        success: false,
        error_message: error.message,
      });

      return res.status(500).json({ statusCode: 500, messages: 'Internal server error' });
    }
  }

  return res.status(405).json({ statusCode: 405, messages: 'Method not allowed' });
}
