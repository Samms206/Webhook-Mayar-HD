// ========================================
// QUIZ APP - TESFREE COUPON TEST SCENARIO
// Comprehensive testing untuk TESFREE coupon + normal payments
// ========================================

const https = require('https');

// Configuration
const WEBHOOK_URL = 'https://webhook-mayar-hd-u2cl.vercel.app/api/webhook';
const API_BASE = 'https://webhook-mayar-hd-u2cl.vercel.app/api';

// Test scenarios
const TEST_SCENARIOS = {
  // Scenario 1: TESFREE coupon (your testing scenario)
  TESFREE_COUPON: {
    event: "payment.received",
    data: {
      id: `tesfree-${Date.now()}`,
      transactionId: `tesfree-${Date.now()}`,
      status: "SUCCESS",
      transactionStatus: "paid",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      merchantId: "d3910a1b-ac66-4bc4-898a-cc3b4500d0f6",
      merchantName: "Halo Designers",
      merchantEmail: "designershalo@gmail.com",
      customerName: "Testing User",
      customerEmail: "sam@gmail.com",
      customerMobile: "084123675123",
      amount: 0, // After TESFREE coupon
      originalAmount: 50000, // Original price
      isAdminFeeBorneByCustomer: null,
      isChannelFeeBorneByCustomer: null,
      productId: "329b77e4-4332-4464-aed4-d8dfe790759b",
      productName: "Tes KUISSS",
      productDescription: "<p>Ini kuis dengan kupon TESFREE</p>\n",
      productType: "webinar",
      qty: 1,
      couponUsed: "TESFREE", // Your testing coupon
      paymentMethod: "transfer"
    }
  },

  // Scenario 2: Normal payment (regular users)
  NORMAL_PAYMENT: {
    event: "payment.received",
    data: {
      id: `normal-${Date.now()}`,
      transactionId: `normal-${Date.now()}`,
      status: "SUCCESS",
      transactionStatus: "paid",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      merchantId: "d3910a1b-ac66-4bc4-898a-cc3b4500d0f6",
      merchantName: "Halo Designers",
      merchantEmail: "designershalo@gmail.com",
      customerName: "Regular User",
      customerEmail: "user@example.com",
      customerMobile: "081234567890",
      amount: 50000, // Full payment
      isAdminFeeBorneByCustomer: null,
      isChannelFeeBorneByCustomer: null,
      productId: "329b77e4-4332-4464-aed4-d8dfe790759b",
      productName: "Tes KUISSS",
      productDescription: "<p>Ini kuis normal payment</p>\n",
      productType: "webinar",
      qty: 1,
      couponUsed: null, // No coupon
      paymentMethod: "bank_transfer"
    }
  }
};

// HTTP request helper
async function sendRequest(url, data, method = 'POST') {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = method === 'POST' ? JSON.stringify(data) : null;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + (urlObj.search || ''),
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Quiz-App-TESFREE-Test/1.0'
      }
    };

    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = (urlObj.protocol === 'https:' ? https : require('http')).request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

// Create payment session
async function createPaymentSession(email, categoryId = 1) {
  console.log(`\n📝 Creating payment session for email: ${email}`);
  
  try {
    const sessionData = {
      userId: `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      categoryId: categoryId,
      userEmail: email
    };

    const response = await sendRequest(`${API_BASE}/create-payment-session`, sessionData);
    
    if (response.statusCode !== 200) {
      console.error('❌ HTTP Error:', response.statusCode, response.body);
      return null;
    }

    const result = JSON.parse(response.body);

    console.log('✅ Payment session created:', {
      success: result.success,
      sessionId: result.sessionId,
      amount: result.amount,
      isFree: result.isFree,
      categoryName: result.categoryName
    });

    return result;
  } catch (error) {
    console.error('❌ Error creating payment session:', error);
    return null;
  }
}

// Check payment session status
async function checkPaymentSession(sessionId) {
  console.log(`\n🔍 Checking payment session: ${sessionId}`);
  
  try {
    const response = await sendRequest(`${API_BASE}/check-payment-session?sessionId=${sessionId}`, {}, 'GET');
    const result = JSON.parse(response.body);

    console.log('✅ Session status:', {
      success: result.success,
      status: result.status,
      hasAccess: result.hasAccess,
      sessionInfo: result.sessionInfo
    });

    return result;
  } catch (error) {
    console.error('❌ Error checking payment session:', error);
    return null;
  }
}

// Test webhook processing
async function testWebhook(scenario, webhookData) {
  console.log(`\n🎯 Testing webhook scenario: ${scenario}`);
  
  try {
    const response = await sendRequest(WEBHOOK_URL, webhookData);
    const result = JSON.parse(response.body);

    console.log('✅ Webhook result:', {
      success: result.success,
      processed: result.processed,
      matchingMethod: result.matchingMethod,
      message: result.message
    });

    if (result.success && result.data) {
      console.log('💳 Payment details:', {
        originalAmount: result.data.originalAmount,
        actualAmount: result.data.actualAmount,
        discount: result.data.discount,
        discountPercentage: result.data.discountPercentage + '%',
        couponUsed: result.data.couponUsed || 'None',
        accessType: result.data.accessType
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Webhook test failed:', error);
    return null;
  }
}

// Main comprehensive test
async function runComprehensiveTest() {
  console.log('🎫 QUIZ APP - TESFREE COUPON COMPREHENSIVE TEST');
  console.log('================================================\n');

  // Health check first
  console.log('🔍 Checking webhook health...');
  try {
    const healthResponse = await sendRequest(WEBHOOK_URL, {}, 'GET');
    const healthResult = JSON.parse(healthResponse.body);
    console.log('✅ Webhook health:', {
      status: healthResult.status,
      version: healthResult.version,
      framework: healthResult.framework,
      testfreSupport: healthResult.supported_scenarios?.includes('tesfree_coupon_0')
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
  }

  // TEST 1: TESFREE Coupon Scenario (Your testing case)
  console.log('\n' + '='.repeat(50));
  console.log('🎯 TEST 1: TESFREE COUPON SCENARIO');
  console.log('='.repeat(50));

  const testEmail = 'sam@gmail.com';
  
  // Step 1: Create payment session with normal price
  const testSession = await createPaymentSession(testEmail);
  if (!testSession || !testSession.success) {
    console.error('❌ Cannot proceed with test - session creation failed');
    return;
  }

  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Step 2: Process TESFREE webhook
  const testfreeWebhook = {
    ...TEST_SCENARIOS.TESFREE_COUPON,
    data: {
      ...TEST_SCENARIOS.TESFREE_COUPON.data,
      customerEmail: testEmail,
      transactionId: `tesfree-${testSession.sessionId}-${Date.now()}`
    }
  };

  const testfreeResult = await testWebhook('TESFREE_COUPON', testfreeWebhook);
  
  // Step 3: Check session status after webhook
  if (testfreeResult && testfreeResult.success) {
    await checkPaymentSession(testSession.sessionId);
  }

  // TEST 2: Normal Payment Scenario (Regular users)
  console.log('\n' + '='.repeat(50));
  console.log('🎯 TEST 2: NORMAL PAYMENT SCENARIO');
  console.log('='.repeat(50));

  const normalEmail = 'user@example.com';
  
  // Step 1: Create payment session
  const normalSession = await createPaymentSession(normalEmail);
  if (normalSession && normalSession.success) {
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 2: Process normal payment webhook
    const normalWebhook = {
      ...TEST_SCENARIOS.NORMAL_PAYMENT,
      data: {
        ...TEST_SCENARIOS.NORMAL_PAYMENT.data,
        customerEmail: normalEmail,
        transactionId: `normal-${normalSession.sessionId}-${Date.now()}`
      }
    };

    const normalResult = await testWebhook('NORMAL_PAYMENT', normalWebhook);
    
    // Step 3: Check session status
    if (normalResult && normalResult.success) {
      await checkPaymentSession(normalSession.sessionId);
    }
  }

  // TEST 3: Edge Cases
  console.log('\n' + '='.repeat(50));
  console.log('🎯 TEST 3: EDGE CASES');
  console.log('='.repeat(50));

  // Test 3a: Webhook without session (should fail gracefully)
  console.log('\n🧪 Test 3a: Webhook without corresponding session');
  const orphanWebhook = {
    ...TEST_SCENARIOS.TESFREE_COUPON,
    data: {
      ...TEST_SCENARIOS.TESFREE_COUPON.data,
      customerEmail: 'orphan@example.com',
      transactionId: `orphan-${Date.now()}`
    }
  };
  await testWebhook('ORPHAN_WEBHOOK', orphanWebhook);

  // Test 3b: Multiple sessions, one webhook
  console.log('\n🧪 Test 3b: Multiple sessions from same email');
  const multiEmail = 'multi@example.com';
  await createPaymentSession(multiEmail);
  await createPaymentSession(multiEmail);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const multiWebhook = {
    ...TEST_SCENARIOS.TESFREE_COUPON,
    data: {
      ...TEST_SCENARIOS.TESFREE_COUPON.data,
      customerEmail: multiEmail,
      transactionId: `multi-${Date.now()}`
    }
  };
  await testWebhook('MULTIPLE_SESSIONS', multiWebhook);

  console.log('\n🏁 COMPREHENSIVE TEST COMPLETED!');
  console.log('='.repeat(50));
  console.log('\n📋 SUMMARY:');
  console.log('✅ TESFREE coupon scenario tested');
  console.log('✅ Normal payment scenario tested');
  console.log('✅ Edge cases tested');
  console.log('\n🎯 TESFREE coupon should work for your testing!');
  console.log('💰 Regular users will pay full amount (50000)');
}

// Individual test functions for manual testing
async function testTestfreeCouponOnly() {
  console.log('🎫 TESTING TESFREE COUPON ONLY\n');
  
  const email = 'sam@gmail.com';
  const session = await createPaymentSession(email);
  
  if (session && session.success) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const webhook = {
      ...TEST_SCENARIOS.TESFREE_COUPON,
      data: {
        ...TEST_SCENARIOS.TESFREE_COUPON.data,
        customerEmail: email
      }
    };
    
    await testWebhook('TESFREE_ONLY', webhook);
    await checkPaymentSession(session.sessionId);
  }
}

async function testNormalPaymentOnly() {
  console.log('💳 TESTING NORMAL PAYMENT ONLY\n');
  
  const email = 'normal@example.com';
  const session = await createPaymentSession(email);
  
  if (session && session.success) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const webhook = {
      ...TEST_SCENARIOS.NORMAL_PAYMENT,
      data: {
        ...TEST_SCENARIOS.NORMAL_PAYMENT.data,
        customerEmail: email
      }
    };
    
    await testWebhook('NORMAL_ONLY', webhook);
    await checkPaymentSession(session.sessionId);
  }
}

// Export functions for module usage
module.exports = {
  runComprehensiveTest,
  testTestfreeCouponOnly,
  testNormalPaymentOnly,
  createPaymentSession,
  checkPaymentSession,
  testWebhook
};

// Run comprehensive test if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--tesfree-only')) {
    testTestfreeCouponOnly().catch(console.error);
  } else if (args.includes('--normal-only')) {
    testNormalPaymentOnly().catch(console.error);
  } else {
    runComprehensiveTest().catch(console.error);
  }
}