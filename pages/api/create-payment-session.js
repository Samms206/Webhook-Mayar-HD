// ========================================
// QUIZ APP - CREATE PAYMENT SESSION API (WEBHOOK-MAYAR)
// Next.js API route untuk membuat payment session
// ========================================

import { createPaymentSession } from '../../services/payment.js';
import Cors from 'cors';

// Initialize CORS middleware
const cors = Cors({
  methods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
  origin: '*',
  allowedHeaders: ['Content-Type', 'Authorization'],
});

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

export default async function handler(req, res) {
  // Run CORS middleware
  await runMiddleware(req, res, cors);

  const timestamp = new Date().toISOString();
  console.log(`🌐 [${timestamp}] Create payment session accessed:`, {
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent']
  });

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only POST requests are allowed'
    });
  }

  try {
    const { userId, categoryId, userEmail } = req.body;

    // Validate required fields
    if (!userId || !categoryId || !userEmail) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['userId', 'categoryId', 'userEmail'],
        received: { userId: !!userId, categoryId: !!categoryId, userEmail: !!userEmail }
      });
    }

    console.log('📝 Creating payment session for:', {
      userId,
      categoryId,
      userEmail
    });

    // Create payment session using service
    const result = await createPaymentSession({
      userId,
      categoryId,
      userEmail
    });

    console.log('✅ Payment session creation result:', {
      success: result.success,
      sessionId: result.sessionId,
      isFree: result.isFree,
      amount: result.amount
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Error in create payment session API:', error);
    
    // Handle specific error types
    if (error.message === 'Category not found') {
      return res.status(404).json({ 
        error: 'Category not found',
        message: 'The specified quiz category does not exist'
      });
    }
    
    if (error.message === 'User already has access to this category') {
      return res.status(409).json({ 
        error: 'User already has access to this category',
        hasAccess: true
      });
    }

    // Generic error response
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message || 'Failed to create payment session'
    });
  }
}

// Export configuration
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};