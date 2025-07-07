// ========================================
// QUIZ APP - PAYMENT SERVICE (FIXED EXPIRY)
// Fixed session expiry time dan better session management
// ========================================

import { supabase } from './supabase.js';

// Helper function untuk generate UUID
const generateUUID = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (error) {
    console.log('⚠️ crypto.randomUUID not available, using fallback');
  }
  
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Create payment session - FIXED EXPIRY TIME
export async function createPaymentSession({
  userId,
  categoryId,
  userEmail
}) {
  try {
    console.log('🔧 Creating payment session:', { 
      userId, 
      categoryId, 
      userEmail,
      timestamp: new Date().toISOString()
    });
    
    // Generate secure session ID
    const sessionId = generateUUID();
    console.log('🆔 Generated session ID:', sessionId);
    
    // Validate input parameters
    if (!userId || !categoryId || !userEmail) {
      throw new Error('Missing required parameters: userId, categoryId, userEmail');
    }

    // Get category details
    console.log('📊 Fetching category data for ID:', categoryId);
    const { data: category, error: categoryError } = await supabase
      .from('quiz_categories')
      .select('price_amount, name, quiz_type, description')
      .eq('id', categoryId)
      .single();

    if (categoryError || !category) {
      console.error('❌ Category fetch error:', categoryError);
      throw new Error(`Category not found: ${categoryError?.message || 'Unknown error'}`);
    }
    
    console.log('✅ Category data fetched:', {
      name: category.name,
      type: category.quiz_type,
      price: category.price_amount
    });

    // Check if user already has access
    console.log('🔍 Checking existing user access...');
    const { data: existingAccess, error: accessCheckError } = await supabase
      .from('user_quiz_access')
      .select('access_type, granted_at')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .in('access_type', ['paid', 'free'])
      .maybeSingle();

    if (accessCheckError) {
      console.error('❌ Error checking existing access:', accessCheckError);
    }

    if (existingAccess) {
      console.log('⚠️ User already has access:', existingAccess);
      throw new Error('User already has access to this category');
    }

    // ==========================================
    // DETERMINE PAYMENT AMOUNT & SESSION TYPE
    // ==========================================
    const isFreeQuiz = category.quiz_type === 'free' || category.price_amount === 0;
    const sessionAmount = isFreeQuiz ? 0 : category.price_amount;
    
    console.log('💰 Payment Session Configuration:', {
      categoryType: category.quiz_type,
      categoryPrice: category.price_amount,
      sessionAmount: sessionAmount,
      isFreeQuiz: isFreeQuiz
    });

    // ==========================================
    // CREATE PAYMENT SESSION WITH LONGER EXPIRY
    // ==========================================
    
    // FIXED: Longer expiry time (4 hours instead of 1 hour)
    const expiryTime = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    
    try {
      const { data: session, error: sessionError } = await supabase
        .from('payment_sessions')
        .insert({
          session_id: sessionId,
          user_id: userId,
          category_id: categoryId,
          user_email: userEmail,
          expected_amount: sessionAmount,
          expires_at: expiryTime, // 4 hours expiry
          created_at: new Date().toISOString(),
          status: 'pending'
        })
        .select()
        .single();

      if (sessionError) {
        console.error('❌ Error creating payment session:', sessionError);
        throw new Error(`Failed to create payment session: ${sessionError.message}`);
      }

      console.log('✅ Payment session created successfully:', {
        sessionId: session.session_id,
        expectedAmount: session.expected_amount,
        expiresAt: session.expires_at,
        expiryInHours: '4 hours from now'
      });

      // ==========================================
      // GENERATE PAYMENT URL
      // ==========================================
      const baseUrl = process.env.MAYAR_PAYMENT_URL || 'https://halodesigners.myr.id/pl/tes-kuisss';
      const paymentUrl = `${baseUrl}?ref=${sessionId}`;
      
      console.log('🔗 Generated payment URL:', paymentUrl);

      // ==========================================
      // HANDLE FREE QUIZ IMMEDIATE ACCESS
      // ==========================================
      if (isFreeQuiz) {
        console.log('🆓 Free quiz detected - granting immediate access');
        
        const { error: freeAccessError } = await supabase
          .from('user_quiz_access')
          .insert({
            user_id: userId,
            category_id: categoryId,
            access_type: 'free',
            granted_at: new Date().toISOString(),
            expires_at: null
          });

        if (freeAccessError) {
          console.error('❌ Error granting free access:', freeAccessError);
        }

        await supabase
          .from('payment_sessions')
          .update({ 
            status: 'completed',
            processed_at: new Date().toISOString()
          })
          .eq('session_id', sessionId);

        return { 
          success: true,
          sessionId,
          paymentUrl: null,
          categoryName: category.name,
          amount: 0,
          isFree: true,
          hasAccess: true,
          expiresAt: session.expires_at,
          message: 'Free quiz access granted immediately'
        };
      }

      // ==========================================
      // RETURN PAID QUIZ SESSION INFO
      // ==========================================
      return { 
        success: true,
        sessionId,
        paymentUrl,
        categoryName: category.name,
        amount: sessionAmount,
        isFree: false,
        hasAccess: false,
        expiresAt: session.expires_at,
        expiryInfo: {
          expiresIn: '4 hours',
          message: 'Session will remain active for 4 hours',
          note: 'Plenty of time for payment completion'
        },
        testingInfo: {
          message: 'Use any coupon for testing discounts',
          normalFlow: 'Regular users pay full amount'
        }
      };

    } catch (error) {
      console.error('❌ Payment session creation failed:', error);
      throw error;
    }

  } catch (error) {
    console.error('❌ Error in createPaymentSession:', error);
    throw new Error(error.message || 'Failed to create payment session');
  }
}

// Check payment session status - ENHANCED
export async function checkPaymentSession(sessionId, userId = null) {
  try {
    console.log('🔍 Checking payment session:', { sessionId, userId });

    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    const { data: session, error: sessionError } = await supabase
      .from('payment_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (sessionError || !session) {
      console.error('❌ Session not found:', sessionError);
      throw new Error('Payment session not found');
    }

    if (userId && session.user_id !== userId) {
      console.error('❌ Unauthorized session access attempt');
      throw new Error('Unauthorized access to payment session');
    }

    // Enhanced expiry check
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    const isExpired = expiresAt < now;
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    const minutesUntilExpiry = Math.round(timeUntilExpiry / 1000 / 60);
    
    console.log('⏰ Session timing info:', {
      status: session.status,
      isExpired: isExpired,
      minutesUntilExpiry: minutesUntilExpiry,
      expiresAt: session.expires_at
    });
    
    // Update expired status if needed
    if (isExpired && session.status === 'pending') {
      console.log('⏰ Session expired, updating status...');
      
      await supabase
        .from('payment_sessions')
        .update({ 
          status: 'expired',
          updated_at: new Date().toISOString()
        })
        .eq('session_id', sessionId);
      
      session.status = 'expired';
    }

    // Check user access
    let hasAccess = false;
    if (session.status === 'completed') {
      const { data: accessData, error: accessError } = await supabase
        .from('user_quiz_access')
        .select('access_type, granted_at')
        .eq('user_id', session.user_id)
        .eq('category_id', session.category_id)
        .in('access_type', ['paid', 'free'])
        .maybeSingle();

      if (accessError) {
        console.error('❌ Error checking user access:', accessError);
      }

      hasAccess = !!accessData;
      console.log('🔐 User access status:', { hasAccess, accessType: accessData?.access_type });
    }

    const result = { 
      success: true,
      status: session.status,
      expiresAt: session.expires_at,
      processedAt: session.processed_at,
      hasAccess,
      timingInfo: {
        isExpired: isExpired,
        minutesUntilExpiry: minutesUntilExpiry,
        status: isExpired ? 'expired' : minutesUntilExpiry > 60 ? 'plenty_of_time' : 'expiring_soon'
      },
      sessionInfo: {
        categoryId: session.category_id,
        expectedAmount: session.expected_amount,
        actualAmount: session.actual_amount || session.expected_amount,
        userEmail: session.user_email,
        isFreeQuiz: session.expected_amount === 0,
        couponUsed: session.coupon_used,
        matchingMethod: session.matching_method,
        transactionId: session.transaction_id,
        createdAt: session.created_at
      }
    };

    console.log('✅ Session check completed:', {
      sessionId,
      status: result.status,
      hasAccess: result.hasAccess,
      minutesUntilExpiry: minutesUntilExpiry
    });

    return result;
  } catch (error) {
    console.error('❌ Error checking payment session:', error);
    throw new Error(error.message || 'Failed to check payment session');
  }
}

// Other functions remain the same...
export async function checkUserQuizAccess(userId, categoryId) {
  try {
    if (!userId || !categoryId) {
      return false;
    }

    console.log('🔍 Checking user quiz access:', { userId, categoryId });

    const { data, error } = await supabase
      .from('user_quiz_access')
      .select('access_type, granted_at, expires_at')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .in('access_type', ['paid', 'free'])
      .maybeSingle();

    if (error) {
      console.error('❌ Error checking user quiz access:', error);
      return false;
    }

    const hasAccess = !!data;
    console.log('🔐 Quiz access check result:', { 
      hasAccess, 
      accessType: data?.access_type,
      grantedAt: data?.granted_at 
    });

    return hasAccess;
  } catch (error) {
    console.error('❌ Error in checkUserQuizAccess:', error);
    return false;
  }
}

export async function getUserPaymentHistory(userId) {
  try {
    if (!userId) {
      return [];
    }

    console.log('📊 Fetching payment history for user:', userId);

    const { data, error } = await supabase
      .from('quiz_transactions')
      .select(`
        *,
        quiz_categories (
          name,
          description
        )
      `)
      .eq('user_id', userId)
      .eq('payment_gateway', 'mayar')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching payment history:', error);
      return [];
    }

    console.log('✅ Payment history fetched:', { count: data?.length || 0 });
    return data || [];
  } catch (error) {
    console.error('❌ Error in getUserPaymentHistory:', error);
    return [];
  }
}

export async function getUserActivePaymentSessions(userId) {
  try {
    if (!userId) {
      return [];
    }

    console.log('📋 Fetching active sessions for user:', userId);

    const { data, error } = await supabase
      .from('payment_sessions')
      .select(`
        *,
        quiz_categories (
          name,
          description,
          price_amount
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching active sessions:', error);
      return [];
    }

    console.log('✅ Active sessions fetched:', { count: data?.length || 0 });
    return data || [];
  } catch (error) {
    console.error('❌ Error in getUserActivePaymentSessions:', error);
    return [];
  }
}

export async function cleanupExpiredPaymentSessions() {
  try {
    console.log('🧹 Cleaning up expired payment sessions...');
    
    const { data, error } = await supabase
      .from('payment_sessions')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
      .select('session_id');

    if (error) {
      console.error('❌ Error cleaning up expired sessions:', error);
      return 0;
    }

    const cleanedCount = data?.length || 0;
    console.log(`✅ Cleaned up ${cleanedCount} expired sessions`);
    
    return cleanedCount;
  } catch (error) {
    console.error('❌ Error in cleanupExpiredPaymentSessions:', error);
    return 0;
  }
}