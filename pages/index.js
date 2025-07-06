// File: pages/index.js

import { useState, useEffect } from 'react';

export default function HomePage() {
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    // Set window origin only on client
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }

    // Test webhook endpoint saat page load
    const testWebhook = async () => {
      try {
        const response = await fetch('/api/webhook');
        const data = await response.json();
        setStatus(data);
      } catch (error) {
        setStatus({ status: 'error', message: error.message });
      } finally {
        setIsLoading(false);
      }
    };

    testWebhook();
  }, []);

  const testWebhookPost = async () => {
    try {
      setIsLoading(true);
      const testPayload = {
        order_id: 'quiz_test_' + Date.now(),
        status: 'paid',
        amount: 50000,
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        webhook_history_id: 'test-' + Date.now()
      };

      const response = await fetch('/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload),
      });

      const result = await response.json();
      alert(`Webhook Test Result:\n${JSON.stringify(result, null, 2)}`);
    } catch (error) {
      alert(`Webhook Test Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const webhookUrl = origin ? `${origin}/api/webhook` : 'Loading...';

  return (
    <div style={{ 
      fontFamily: 'Arial, sans-serif', 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '20px' 
    }}>
      <h1>🔔 Mayar Webhook Server</h1>
      <p>Next.js API untuk menangani webhook pembayaran Mayar</p>

      <div style={{ 
        background: '#f5f5f5', 
        padding: '20px', 
        borderRadius: '8px', 
        margin: '20px 0' 
      }}>
        <h2>Server Status</h2>
        {isLoading ? (
          <p>⏳ Loading...</p>
        ) : (
          <div>
            <p><strong>Status:</strong> {status?.status}</p>
            <p><strong>Message:</strong> {status?.message}</p>
            <p><strong>Framework:</strong> {status?.framework}</p>
            <p><strong>Timestamp:</strong> {status?.timestamp}</p>
          </div>
        )}
      </div>

      <div style={{ 
        background: '#e8f5e8', 
        padding: '20px', 
        borderRadius: '8px', 
        margin: '20px 0' 
      }}>
        <h2>Webhook URL</h2>
        <code style={{ 
          background: 'white', 
          padding: '10px', 
          display: 'block', 
          borderRadius: '4px' 
        }}>
          {webhookUrl}
        </code>
        <p><small>Gunakan URL ini di Mayar dashboard untuk webhook settings</small></p>
      </div>

      <div style={{ margin: '20px 0' }}>
        <h2>Test Webhook</h2>
        <button 
          onClick={testWebhookPost}
          disabled={isLoading}
          style={{
            background: '#0070f3',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isLoading ? '⏳ Testing...' : '🧪 Test POST Webhook'}
        </button>
      </div>

      <div style={{ 
        background: '#fff3cd', 
        padding: '20px', 
        borderRadius: '8px', 
        margin: '20px 0' 
      }}>
        <h2>Endpoints</h2>
        <ul>
          <li><strong>GET /api/webhook</strong> - Test endpoint status</li>
          <li><strong>POST /api/webhook</strong> - Receive Mayar webhooks</li>
          <li><strong>GET /api/health</strong> - Health check</li>
        </ul>
      </div>

      <div style={{ 
        background: '#f8d7da', 
        padding: '20px', 
        borderRadius: '8px', 
        margin: '20px 0' 
      }}>
        <h2>Mayar Configuration</h2>
        <p><strong>Webhook URL:</strong> {webhookUrl}</p>
        <p><strong>Method:</strong> POST</p>
        <p><strong>Content-Type:</strong> application/json</p>
        <p><strong>Events:</strong> Purchase</p>
      </div>
    </div>
  );
}
