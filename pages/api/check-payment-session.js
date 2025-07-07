import { checkPaymentSession } from '../../services/payment.js';
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
  console.log(`🌐 [${timestamp}] Check payment session accessed:`, {
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent']
  });

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Allow both GET and POST requests
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only GET and POST requests are allowed'
    });
  }

  try {
    let sessionId, userId;

    // Extract parameters based on request method
    if (req.method === 'GET') {
      sessionId = req.query.sessionId;
      userId = req.query.userId;
    } else { // POST
      sessionId = req.body.sessionId;
      userId = req.body.userId;
    }

    // Validate required fields
    if (!sessionId) {
      return res.status(400).json({ 
        error: 'Missing required field',
        required: ['sessionId'],
        message: 'sessionId is required to check payment session'
      });
    }

    console.log('🔍 Checking payment session:', {
      sessionId,
      userId: userId || 'not provided'
    });

    // Check payment session using service
    const result = await checkPaymentSession(sessionId, userId);

    console.log('✅ Payment session check result:', {
      success: result.success,
      status: result.status,
      hasAccess: result.hasAccess
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Error in check payment session API:', error);
    
    // Handle specific error types
    if (error.message === 'Payment session not found') {
      return res.status(404).json({ 
        error: 'Payment session not found',
        message: 'The specified payment session does not exist or has expired'
      });
    }
    
    if (error.message === 'Unauthorized') {
      return res.status(403).json({ 
        error: 'Unauthorized',
        message: 'You do not have permission to access this payment session'
      });
    }

    // Generic error response
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message || 'Failed to check payment session'
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