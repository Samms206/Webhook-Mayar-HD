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
  
  // Fallback UUID generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Create payment session - COMPLETE IMPLEMENTATION
export async function createPaymentSession({
  userId,
  categoryId,
  userEmail
}) {
  try {
    console.log('🔧 Creating payment session with params:', { userId, categoryId, userEmail });
    
    // Generate secure session ID
    const sessionId = generateUUID();
    console.log('🆔 Generated session ID:', sessionId);
    
    // Get category details including quiz_type
    console.log('📊 Fetching category data for ID:', categoryId);
    const { data: category, error: categoryError } = await supabase
      .from('quiz_categories')
      .select('price_amount, name, quiz_type')
      .eq('id', categoryId)
      .single();

    if (categoryError || !category) {
      console.error('❌ Category fetch error:', categoryError);
      throw new Error('Category not found');
    }
    
    console.log('✅ Category data fetched:', category);

    // ==========================================
    // HANDLE FREE VS PAID QUIZ LOGIC
    // ==========================================
    
    // Calculate actual amount based on quiz type
    const actualAmount = category.quiz_type === 'free' ? 0 : category.price_amount;
    
    console.log('💰 Payment Amount Calculation:', {
      categoryType: category.quiz_type,
      categoryPrice: category.price_amount,
      actualAmount: actualAmount,
      isFreeQuiz: category.quiz_type === 'free'
    });

    // Check if user already has access
    const { data: existingAccess } = await supabase
      .from('user_quiz_access')
      .select('*')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .in('access_type', ['paid', 'free'])
      .maybeSingle();

    if (existingAccess) {
      throw new Error('User already has access to this category');
    }

    // For free quizzes, directly grant access without payment session
    if (category.quiz_type === 'free' || actualAmount === 0) {
      console.log('🆓 Free quiz detected - granting direct access');
      
      // Grant immediate access for free quiz
      const { error: accessError } = await supabase
        .from('user_quiz_access')
        .insert({
          user_id: userId,
          category_id: categoryId,
          access_type: 'free',
          granted_at: new Date().toISOString(),
          expires_at: null // No expiration for free access
        });

      if (accessError) {
        console.error('Error granting free access:', accessError);
        throw new Error('Failed to grant free access');
      }

      return { 
        success: true,
        sessionId: null,
        paymentUrl: null,
        categoryName: category.name,
        amount: 0,
        isFree: true,
        hasAccess: true,
        message: 'Free quiz access granted immediately'
      };
    }

    // ==========================================
    // CREATE PAYMENT SESSION FOR PAID QUIZ
    // ==========================================
    const { data: session, error: sessionError } = await supabase
      .from('payment_sessions')
      .insert({
        session_id: sessionId,
        user_id: userId,
        category_id: categoryId,
        user_email: userEmail,
        expected_amount: actualAmount, // Use calculated actual amount
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Error creating payment session:', sessionError);
      throw new Error('Failed to create payment session');
    }

    // Generate payment URL with session reference
    const baseUrl = process.env.MAYAR_PAYMENT_URL || 'https://halodesigners.myr.id/pl/tes-kuisss';
    const paymentUrl = `${baseUrl}?ref=${sessionId}`;
    console.log('🔗 Generated payment URL:', paymentUrl);

    console.log('✅ Payment session created:', {
      sessionId,
      userId,
      categoryId,
      categoryName: category.name,
      categoryType: category.quiz_type,
      expectedAmount: actualAmount,
      userEmail
    });

    return { 
      success: true,
      sessionId,
      paymentUrl,
      categoryName: category.name,
      amount: actualAmount,
      isFree: false,
      expiresAt: session.expires_at
    };
  } catch (error) {
    console.error('❌ Error creating payment session:', error);
    throw new Error(error.message || 'Failed to create payment session');
  }
}

// Check payment session status
export async function checkPaymentSession(sessionId, userId) {
  try {
    // Get payment session from Supabase
    const { data: session, error: sessionError } = await supabase
      .from('payment_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error('Payment session not found');
    }

    // Check if session belongs to user (optional security check)
    if (userId && session.user_id !== userId) {
      throw new Error('Unauthorized');
    }

    // Check if session is expired
    const isExpired = new Date(session.expires_at) < new Date();
    
    if (isExpired && session.status === 'pending') {
      // Update status to expired
      await supabase
        .from('payment_sessions')
        .update({ status: 'expired' })
        .eq('session_id', sessionId);
    }

    // If payment is completed, check if user has access
    let hasAccess = false;
    if (session.status === 'completed') {
      const { data: accessData } = await supabase
        .from('user_quiz_access')
        .select('*')
        .eq('user_id', session.user_id)
        .eq('category_id', session.category_id)
        .in('access_type', ['paid', 'free'])
        .maybeSingle();

      hasAccess = !!accessData;
    }

    return { 
      success: true,
      status: isExpired && session.status === 'pending' ? 'expired' : session.status,
      expiresAt: session.expires_at,
      processedAt: session.processed_at,
      hasAccess,
      sessionInfo: {
        categoryId: session.category_id,
        expectedAmount: session.expected_amount,
        userEmail: session.user_email
      }
    };
  } catch (error) {
    console.error('Error checking payment session:', error);
    throw new Error(error.message || 'Failed to check payment session');
  }
}

// Check if user has access to a category
export async function checkUserQuizAccess(userId, categoryId) {
  try {
    // Check for both paid and free access
    const { data, error } = await supabase
      .from('user_quiz_access')
      .select('*')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .in('access_type', ['paid', 'free'])
      .maybeSingle();

    if (error) {
      console.error('Error checking user quiz access:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Error checking user quiz access:', error);
    return false;
  }
}

// Get user's payment history
export async function getUserPaymentHistory(userId) {
  try {
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
      console.error('Error fetching payment history:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching payment history:', error);
    return [];
  }
}

// Get active payment sessions for user
export async function getUserActivePaymentSessions(userId) {
  try {
    const { data, error } = await supabase
      .from('payment_sessions')
      .select(`
        *,
        quiz_categories (
          name,
          description
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching active payment sessions:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching active payment sessions:', error);
    return [];
  }
}

// Clean up expired payment sessions
export async function cleanupExpiredPaymentSessions() {
  try {
    const { data, error } = await supabase
      .rpc('cleanup_expired_payment_sessions');

    if (error) {
      console.error('Error cleaning up expired sessions:', error);
      return 0;
    }

    return data || 0;
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
    return 0;
  }
}