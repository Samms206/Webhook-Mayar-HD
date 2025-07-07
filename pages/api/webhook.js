// ========================================
// QUIZ APP - MAYAR WEBHOOK HANDLER (FIXED)
// Fixed logic untuk handle recently expired sessions
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
      version: '3.2.0-expired-session-fix',
      timestamp: timestamp,
      webhook_url: `${req.headers.host}/api/webhook`,
      matching_strategy: {
        primary: 'exact_amount_and_email',
        secondary: 'flexible_email_time_window',
        expired_session_handling: 'recent_expired_sessions_included',
        coupon_support: 'TESFREE_and_general_coupons'
      },
      supported_scenarios: [
        'normal_payment_50000',
        'tesfree_coupon_0',
        'recently_expired_sessions',
        'other_discounts',
        'free_quiz_native'
      ]
    });
  }

  // Only process POST requests for webhook
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only POST requests are allowed for webhook processing'
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
        message: 'Missing required fields: event, data'
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
        data: mayarData
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
    const isPossibleCouponDiscount = isZeroAmount && !isTestFreeCoupon; // Could be any coupon
    
    console.log('💰 Payment Scenario Analysis:', {
      originalAmount: mayarData.amount,
      numericAmount: numericAmount,
      isZeroAmount: isZeroAmount,
      couponUsed: mayarData.couponUsed,
      isTestFreeCoupon: isTestFreeCoupon,
      isNormalPayment: isNormalPayment,
      isPossibleCouponDiscount: isPossibleCouponDiscount,
      scenario: isTestFreeCoupon ? 'TESFREE_TESTING' : 
                isNormalPayment ? 'NORMAL_PAYMENT' : 
                isPossibleCouponDiscount ? 'POSSIBLE_COUPON_DISCOUNT' :
                isZeroAmount ? 'FREE_OR_DISCOUNT' : 'OTHER'
    });

    // ==========================================
    // ENHANCED PAYMENT SESSION MATCHING (FIXED)
    // ==========================================
    console.log('🔍 Starting enhanced payment session matching...');

    let matchingSession = null;
    let matchingMethod = 'none';
    let searchAttempts = [];

    // ATTEMPT 1: Exact matching (email + amount) - PENDING SESSIONS ONLY
    console.log('🎯 Attempt 1: Exact email + amount matching (pending sessions)...');
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
        method: 'exact_match_pending',
        criteria: { email: mayarData.customerEmail, amount: numericAmount, status: 'pending' },
        results: exactMatches?.length || 0,
        error: exactError?.message || null
      });

      if (exactMatches && exactMatches.length > 0) {
        matchingSession = exactMatches[0];
        matchingMethod = 'exact_match_pending';
        console.log('✅ Exact match (pending) found!');
      }
    } catch (error) {
      console.error('❌ Exact match attempt failed:', error);
    }

    // ATTEMPT 2: FLEXIBLE MATCHING FOR ZERO AMOUNT (INCLUDING RECENTLY EXPIRED)
    if (!matchingSession && isZeroAmount) {
      console.log('🎯 Attempt 2: Zero amount flexible matching (including recently expired)...');
      
      try {
        // Extended time window: 2 hours, include expired sessions
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        
        const { data: flexibleMatches, error: flexibleError } = await supabase
          .from('payment_sessions')
          .select('*')
          .eq('user_email', mayarData.customerEmail)
          .in('status', ['pending', 'expired']) // Include expired sessions!
          .gte('created_at', twoHoursAgo)
          .order('created_at', { ascending: false })
          .limit(10);

        searchAttempts.push({
          method: 'zero_amount_flexible',
          criteria: { 
            email: mayarData.customerEmail, 
            timeWindow: '2 hours',
            statuses: ['pending', 'expired'],
            amount: 'zero_amount'
          },
          results: flexibleMatches?.length || 0,
          error: flexibleError?.message || null
        });

        if (flexibleMatches && flexibleMatches.length > 0) {
          console.log('🔍 Found sessions for zero amount matching:', flexibleMatches.map(s => ({
            sessionId: s.session_id,
            expectedAmount: s.expected_amount,
            status: s.status,
            createdAt: s.created_at,
            timeDiff: Math.round((Date.now() - new Date(s.created_at).getTime()) / 1000 / 60) + ' minutes ago'
          })));

          // Strategy: Find most recent session with expected_amount > 0 (paid quiz)
          const paidSessions = flexibleMatches.filter(s => s.expected_amount > 0);
          const mostRecentPaidSession = paidSessions[0]; // Already sorted by created_at desc
          
          if (mostRecentPaidSession) {
            matchingSession = mostRecentPaidSession;
            matchingMethod = 'zero_amount_coupon_discount';
            
            console.log('✅ Zero amount coupon discount match found!', {
              sessionId: matchingSession.session_id,
              originalAmount: matchingSession.expected_amount,
              discountedAmount: numericAmount,
              sessionStatus: matchingSession.status,
              discount: '100%',
              timeSinceCreation: Math.round((Date.now() - new Date(matchingSession.created_at).getTime()) / 1000 / 60) + ' minutes'
            });
          } else {
            console.log('⚠️ No paid sessions found for zero amount matching');
          }
        }
      } catch (error) {
        console.error('❌ Zero amount flexible match failed:', error);
      }
    }

    // ATTEMPT 3: TESFREE SPECIFIC MATCHING
    if (!matchingSession && isTestFreeCoupon) {
      console.log('🎯 Attempt 3: TESFREE specific matching...');
      
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        
        const { data: testfreeMatches, error: testfreeError } = await supabase
          .from('payment_sessions')
          .select('*')
          .eq('user_email', mayarData.customerEmail)
          .in('status', ['pending', 'expired'])
          .gte('created_at', oneHourAgo)
          .order('created_at', { ascending: false })
          .limit(5);

        if (testfreeMatches && testfreeMatches.length > 0) {
          matchingSession = testfreeMatches[0];
          matchingMethod = 'tesfree_specific';
          console.log('✅ TESFREE specific match found!');
        }
      } catch (error) {
        console.error('❌ TESFREE specific match failed:', error);
      }
    }

    // ATTEMPT 4: GENERAL FLEXIBLE MATCHING (RECENT SESSIONS)
    if (!matchingSession) {
      console.log('🎯 Attempt 4: General flexible matching (recent sessions, any status)...');
      
      try {
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        
        const { data: generalMatches, error: generalError } = await supabase
          .from('payment_sessions')
          .select('*')
          .eq('user_email', mayarData.customerEmail)
          .in('status', ['pending', 'expired']) // Include expired!
          .gte('created_at', thirtyMinAgo)
          .order('created_at', { ascending: false })
          .limit(5);

        searchAttempts.push({
          method: 'general_flexible_recent',
          criteria: { 
            email: mayarData.customerEmail, 
            timeWindow: '30 minutes',
            statuses: ['pending', 'expired']
          },
          results: generalMatches?.length || 0,
          error: generalError?.message || null
        });

        if (generalMatches && generalMatches.length > 0) {
          matchingSession = generalMatches[0];
          matchingMethod = 'general_flexible_recent';
          console.log('✅ General flexible recent match found!');
        }
      } catch (error) {
        console.error('❌ General flexible match failed:', error);
      }
    }

    // ==========================================
    // HANDLE NO MATCHING SESSION FOUND
    // ==========================================
    if (!matchingSession) {
      console.log('❌ No matching payment session found after all enhanced attempts');

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
          message: 'No matching payment session found after enhanced attempts',
          processed: false,
          data: mayarData,
          debug: {
            searchAttempts: searchAttempts,
            searchCriteria: {
              customerEmail: mayarData.customerEmail,
              amount: numericAmount,
              couponUsed: mayarData.couponUsed,
              scenario: isPossibleCouponDiscount ? 'POSSIBLE_COUPON_DISCOUNT' : 'NORMAL_PAYMENT'
            },
            recentSessions: debugSessions?.slice(0, 5),
            recommendations: [
              'Check if payment session was created recently',
              'Verify email address matches exactly',
              'Consider if this is a coupon discount scenario'
            ]
          }
        });
      } catch (error) {
        console.error('❌ Error fetching debug sessions:', error);
        return res.status(500).json({
          success: false,
          error: 'Database error during debugging'
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
      originalStatus: matchingSession.status,
      matchingMethod: matchingMethod,
      discount: matchingSession.expected_amount - numericAmount,
      timeSinceCreation: Math.round((Date.now() - new Date(matchingSession.created_at).getTime()) / 1000 / 60) + ' minutes'
    });

    // Determine access type
    const accessType = numericAmount === 0 ? 'free' : 'paid';

    // Grant quiz access
    try {
      console.log('🔐 Granting quiz access...');
      const { error: accessError } = await supabase
        .from('user_quiz_access')
        .upsert({
          user_id: matchingSession.user_id,
          category_id: matchingSession.category_id,
          access_type: accessType,
          granted_at: new Date().toISOString(),
          expires_at: null
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

    // Update payment session status to completed
    try {
      console.log('📝 Updating payment session status...');
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
      } else {
        console.log('✅ Payment session status updated to completed');
      }
    } catch (error) {
      console.error('❌ Session update failed:', error);
    }

    // Record transaction
    try {
      console.log('💾 Recording transaction...');
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
        wasSessionExpired: matchingSession.status === 'expired',
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
      processed: false
    });
  }
}

// Next.js API route configuration
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};