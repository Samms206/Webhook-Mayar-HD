// ========================================
// QUIZ APP - MAYAR WEBHOOK HANDLER (NEXT.JS)
// Enhanced logic untuk handle TESFREE coupon testing + normal payments
// ========================================

import { supabase } from '../../services/supabase.js';

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  
  console.log(`🌐 [${timestamp}] Webhook accessed:`, {
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type']
  });

  // CORS Headers for Next.js
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ 
      message: 'CORS preflight OK',
      timestamp 
    });
  }

  // Handle GET requests (health check)
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'Webhook endpoint active',
      framework: 'Next.js',
      version: '3.1.0-tesfree-support',
      timestamp: timestamp,
      webhook_url: `${req.headers.host}/api/webhook`,
      matching_strategy: {
        primary: 'exact_amount_and_email',
        secondary: 'flexible_email_time_window',
        testing_coupon: 'TESFREE_support',
        normal_payment: 'full_amount_support'
      },
      supported_scenarios: [
        'normal_payment_50000',
        'tesfree_coupon_0',
        'other_discounts',
        'free_quiz_native'
      ],
      supported_events: [
        'payment.received',
        'testing'
      ]
    });
  }

  // Only process POST requests for webhook
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only POST requests are allowed for webhook processing',
      allowed_methods: ['GET', 'POST', 'OPTIONS']
    });
  }

  try {
    console.log(`📦 [${timestamp}] POST Request - Processing Mayar webhook`);
    console.log('📊 Raw Request Body:', JSON.stringify(req.body, null, 2));

    const { event, data } = req.body;

    // Validate webhook payload structure
    if (!event || !data) {
      console.error('❌ Invalid webhook payload - missing event or data fields');
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook payload',
        message: 'Missing required fields: event, data',
        received: { event: !!event, data: !!data }
      });
    }

    // ==========================================
    // EXTRACT & NORMALIZE MAYAR WEBHOOK DATA
    // ==========================================
    const mayarData = {
      event: event,
      transactionId: data.transactionId || data.id || `unknown-${Date.now()}`,
      status: data.status || 'unknown',
      transactionStatus: data.transactionStatus || 'unknown',
      amount: data.amount,
      customerEmail: data.customerEmail || 'unknown',
      customerName: data.customerName || 'unknown',
      productName: data.productName || 'unknown',
      webhookId: data.id || data.transactionId || `webhook-${Date.now()}`,
      detectedFormat: data.transactionStatus ? 'production' : 'testing',
      // Coupon information
      couponUsed: data.couponUsed || null,
      originalAmount: data.originalAmount || data.amount,
      // Additional Mayar fields
      merchantName: data.merchantName || 'unknown',
      paymentMethod: data.paymentMethod || null
    };

    console.log('📋 Extracted & Normalized Mayar Data:', {
      event: mayarData.event,
      transactionId: mayarData.transactionId,
      customerEmail: mayarData.customerEmail,
      amount: `${mayarData.amount} (${typeof mayarData.amount})`,
      couponUsed: mayarData.couponUsed || 'NO_COUPON',
      productName: mayarData.productName,
      detectedFormat: mayarData.detectedFormat
    });

    // ==========================================
    // VALIDATE SUCCESSFUL PAYMENT EVENT
    // ==========================================
    const isSuccessfulPayment = (
      mayarData.event === 'payment.received' &&
      (mayarData.status === 'SUCCESS' || mayarData.transactionStatus === 'paid')
    );

    if (!isSuccessfulPayment) {
      console.log('ℹ️ Webhook received but not a successful payment event - ignoring');
      return res.status(200).json({
        success: false,
        message: 'Webhook received but not a successful payment event',
        processed: false,
        data: mayarData,
        reason: 'Not a successful payment'
      });
    }

    console.log('✅ Valid successful payment webhook confirmed');

    // ==========================================
    // AMOUNT & SCENARIO ANALYSIS
    // ==========================================
    const numericAmount = Number(mayarData.amount);
    const isZeroAmount = numericAmount === 0;
    const isTestFreeCoupon = mayarData.couponUsed === 'TESFREE';
    const isNormalPayment = numericAmount > 0 && !mayarData.couponUsed;
    
    console.log('💰 Payment Scenario Analysis:', {
      originalAmount: mayarData.amount,
      numericAmount: numericAmount,
      isZeroAmount: isZeroAmount,
      couponUsed: mayarData.couponUsed,
      isTestFreeCoupon: isTestFreeCoupon,
      isNormalPayment: isNormalPayment,
      scenario: isTestFreeCoupon ? 'TESFREE_TESTING' : 
                isNormalPayment ? 'NORMAL_PAYMENT' : 
                isZeroAmount ? 'FREE_OR_DISCOUNT' : 'OTHER'
    });

    // ==========================================
    // ENHANCED PAYMENT SESSION MATCHING
    // ==========================================
    console.log('🔍 Starting enhanced payment session matching...');

    let matchingSession = null;
    let matchingMethod = 'none';
    let searchAttempts = [];

    // ATTEMPT 1: Exact matching (email + amount)
    console.log('🎯 Attempt 1: Exact email + amount matching...');
    try {
      const { data: exactMatches, error: exactError } = await supabase
        .from('payment_sessions')
        .select('*')
        .eq('user_email', mayarData.customerEmail)
        .eq('expected_amount', numericAmount)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(3);

      searchAttempts.push({
        method: 'exact_match',
        criteria: { email: mayarData.customerEmail, amount: numericAmount },
        results: exactMatches?.length || 0,
        error: exactError?.message || null
      });

      if (exactError) {
        console.error('❌ Error in exact match query:', exactError);
      } else if (exactMatches && exactMatches.length > 0) {
        matchingSession = exactMatches[0]; // Most recent exact match
        matchingMethod = 'exact_match';
        console.log('✅ Exact match found!', {
          sessionId: matchingSession.session_id,
          expectedAmount: matchingSession.expected_amount,
          createdAt: matchingSession.created_at
        });
      }
    } catch (error) {
      console.error('❌ Exact match attempt failed:', error);
    }

    // ATTEMPT 2: Flexible matching untuk TESFREE scenario (email + time window)
    if (!matchingSession && isTestFreeCoupon) {
      console.log('🎯 Attempt 2: TESFREE flexible matching (email + time window)...');
      
      try {
        // Cari session dalam 1 jam terakhir dengan email yang sama
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        
        const { data: flexibleMatches, error: flexibleError } = await supabase
          .from('payment_sessions')
          .select('*')
          .eq('user_email', mayarData.customerEmail)
          .eq('status', 'pending')
          .gte('created_at', oneHourAgo)
          .order('created_at', { ascending: false })
          .limit(5);

        searchAttempts.push({
          method: 'tesfree_flexible',
          criteria: { email: mayarData.customerEmail, timeWindow: '1 hour' },
          results: flexibleMatches?.length || 0,
          error: flexibleError?.message || null
        });

        if (flexibleError) {
          console.error('❌ Error in TESFREE flexible match:', flexibleError);
        } else if (flexibleMatches && flexibleMatches.length > 0) {
          // Prioritas: session dengan expected_amount > 0 (paid quiz)
          const paidSession = flexibleMatches.find(s => s.expected_amount > 0);
          matchingSession = paidSession || flexibleMatches[0];
          matchingMethod = 'tesfree_flexible';
          
          console.log('✅ TESFREE flexible match found!', {
            sessionId: matchingSession.session_id,
            expectedAmount: matchingSession.expected_amount,
            actualAmount: numericAmount,
            discount: matchingSession.expected_amount - numericAmount,
            createdAt: matchingSession.created_at
          });
        }
      } catch (error) {
        console.error('❌ TESFREE flexible match attempt failed:', error);
      }
    }

    // ATTEMPT 3: General flexible matching (email + recent time)
    if (!matchingSession) {
      console.log('🎯 Attempt 3: General flexible matching (email + 30min window)...');
      
      try {
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        
        const { data: generalMatches, error: generalError } = await supabase
          .from('payment_sessions')
          .select('*')
          .eq('user_email', mayarData.customerEmail)
          .eq('status', 'pending')
          .gte('created_at', thirtyMinAgo)
          .order('created_at', { ascending: false })
          .limit(3);

        searchAttempts.push({
          method: 'general_flexible',
          criteria: { email: mayarData.customerEmail, timeWindow: '30 minutes' },
          results: generalMatches?.length || 0,
          error: generalError?.message || null
        });

        if (generalError) {
          console.error('❌ Error in general flexible match:', generalError);
        } else if (generalMatches && generalMatches.length > 0) {
          matchingSession = generalMatches[0];
          matchingMethod = 'general_flexible';
          console.log('✅ General flexible match found!');
        }
      } catch (error) {
        console.error('❌ General flexible match attempt failed:', error);
      }
    }

    // ==========================================
    // HANDLE NO MATCHING SESSION FOUND
    // ==========================================
    if (!matchingSession) {
      console.log('❌ No matching payment session found after all attempts');

      // Get recent sessions for debugging
      try {
        const { data: debugSessions } = await supabase
          .from('payment_sessions')
          .select('session_id, user_email, expected_amount, status, created_at')
          .order('created_at', { ascending: false })
          .limit(10);

        console.log('🔍 Recent sessions for debugging:', debugSessions?.slice(0, 5));

        return res.status(200).json({
          success: false,
          message: 'No matching payment session found',
          processed: false,
          data: mayarData,
          debug: {
            searchAttempts: searchAttempts,
            searchCriteria: {
              customerEmail: mayarData.customerEmail,
              amount: numericAmount,
              couponUsed: mayarData.couponUsed,
              scenario: isTestFreeCoupon ? 'TESFREE_TESTING' : 'NORMAL_PAYMENT'
            },
            recentSessions: debugSessions?.slice(0, 5)
          }
        });
      } catch (error) {
        console.error('❌ Error fetching debug sessions:', error);
        return res.status(500).json({
          success: false,
          error: 'Database error during debugging',
          message: error.message
        });
      }
    }

    // ==========================================
    // PROCESS SUCCESSFUL MATCH
    // ==========================================
    console.log('✅ Payment session matched successfully!', {
      sessionId: matchingSession.session_id,
      userId: matchingSession.user_id,
      categoryId: matchingSession.category_id,
      expectedAmount: matchingSession.expected_amount,
      actualAmount: numericAmount,
      matchingMethod: matchingMethod,
      discount: matchingSession.expected_amount - numericAmount,
      timeSinceCreation: `${Math.round((Date.now() - new Date(matchingSession.created_at).getTime()) / 1000 / 60)} minutes`
    });

    // Determine access type
    const accessType = numericAmount === 0 ? 'free' : 'paid';

    // Grant quiz access using upsert for safety
    try {
      const { error: accessError } = await supabase
        .from('user_quiz_access')
        .upsert({
          user_id: matchingSession.user_id,
          category_id: matchingSession.category_id,
          access_type: accessType,
          granted_at: new Date().toISOString(),
          expires_at: null // No expiration for quiz access
        }, {
          onConflict: 'user_id,category_id'
        });

      if (accessError) {
        console.error('❌ Error granting quiz access:', accessError);
        throw new Error(`Failed to grant quiz access: ${accessError.message}`);
      }

      console.log('✅ Quiz access granted successfully');
    } catch (error) {
      console.error('❌ Quiz access grant failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to grant quiz access',
        message: error.message
      });
    }

    // Update payment session status
    try {
      const { error: updateError } = await supabase
        .from('payment_sessions')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          transaction_id: mayarData.transactionId,
          actual_amount: numericAmount,
          matching_method: matchingMethod,
          coupon_used: mayarData.couponUsed
        })
        .eq('session_id', matchingSession.session_id);

      if (updateError) {
        console.error('❌ Error updating session status:', updateError);
        // Don't fail the entire process for this
      } else {
        console.log('✅ Payment session status updated');
      }
    } catch (error) {
      console.error('❌ Session update failed:', error);
    }

    // Record transaction for history
    try {
      const { error: transactionError } = await supabase
        .from('quiz_transactions')
        .insert({
          user_id: matchingSession.user_id,
          category_id: matchingSession.category_id,
          transaction_id: mayarData.transactionId,
          payment_gateway: 'mayar',
          amount: numericAmount,
          original_amount: matchingSession.expected_amount,
          currency: 'IDR',
          status: 'completed',
          coupon_used: mayarData.couponUsed,
          gateway_response: req.body,
          matching_method: matchingMethod,
          processed_at: new Date().toISOString()
        });

      if (transactionError) {
        console.error('❌ Error recording transaction:', transactionError);
        // Don't fail for transaction recording error
      } else {
        console.log('✅ Transaction recorded successfully');
      }
    } catch (error) {
      console.error('❌ Transaction recording failed:', error);
    }

    // Calculate discount information
    const originalAmount = matchingSession.expected_amount;
    const discount = originalAmount - numericAmount;
    const discountPercentage = originalAmount > 0 ? 
      Math.round((discount / originalAmount) * 100) : 0;

    console.log('🎉 Payment processing completed successfully!');

    // Return comprehensive success response
    return res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      processed: true,
      matchingMethod: matchingMethod,
      data: {
        sessionId: matchingSession.session_id,
        userId: matchingSession.user_id,
        categoryId: matchingSession.category_id,
        transactionId: mayarData.transactionId,
        originalAmount: originalAmount,
        actualAmount: numericAmount,
        discount: discount,
        discountPercentage: discountPercentage,
        accessType: accessType,
        couponUsed: mayarData.couponUsed,
        isTestFreeCoupon: isTestFreeCoupon,
        matchingMethod: matchingMethod,
        processedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Critical webhook processing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      processed: false,
      timestamp: new Date().toISOString()
    });
  }
}

// Next.js API route configuration
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb', // Increased for detailed webhook payloads
    },
  },
};