// ========================================
// QUIZ APP - WEBHOOK MAYAR HOMEPAGE
// Fixed hydration error version
// ========================================

import { useState, useEffect } from 'react';

export default function Home() {
  const [webhookStatus, setWebhookStatus] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    // Set webhook URL on client only
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/webhook`);
    }

    checkWebhookStatus();
    checkHealthStatus();
  }, []);

  const checkWebhookStatus = async () => {
    try {
      const response = await fetch('/api/webhook');
      const data = await response.json();
      setWebhookStatus(data);
    } catch (error) {
      console.error('Failed to check webhook status:', error);
    }
  };

  const checkHealthStatus = async () => {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      setHealthStatus(data);
    } catch (error) {
      console.error('Failed to check health status:', error);
    }
  };

  const testWebhook = async () => {
    try {
      const testPayload = {
        event: 'payment.received',
        data: {
          id: 'test-' + Date.now(),
          transactionId: 'test-tx-' + Date.now(),
          status: 'SUCCESS',
          transactionStatus: 'paid',
          amount: 0,
          customerEmail: 'test@example.com',
          customerName: 'Test User'
        }
      };

      const response = await fetch('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });

      const result = await response.json();
      alert(`Test Result: ${JSON.stringify(result, null, 2)}`);
    } catch (error) {
      alert(`Test Failed: ${error.message}`);
    }
  };

  return (
    <div style={{ 
      fontFamily: 'Arial, sans-serif', 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '20px',
      lineHeight: '1.6'
    }}>
      <h1>🚀 Quiz App - Mayar Webhook Server</h1>
      
      <div style={{ 
        background: '#f0f8ff', 
        padding: '15px', 
        borderRadius: '8px', 
        marginBottom: '20px' 
      }}>
        <h2>📊 Server Status</h2>
        
        {webhookStatus && (
          <div style={{ marginBottom: '15px' }}>
            <h3>Webhook Endpoint</h3>
            <p><strong>Status:</strong> {webhookStatus.status}</p>
            <p><strong>Version:</strong> {webhookStatus.version}</p>
            <p><strong>URL:</strong> <code>{webhookStatus.webhook_url}</code></p>
          </div>
        )}

        {healthStatus && (
          <div>
            <h3>Health Check</h3>
            <p><strong>Status:</strong> {healthStatus.status}</p>
            <p><strong>Database:</strong> {healthStatus.services?.database}</p>
            <p><strong>Uptime:</strong> {healthStatus.system?.uptime}</p>
          </div>
        )}
      </div>

      <div style={{ 
        background: '#fff5f5', 
        padding: '15px', 
        borderRadius: '8px', 
        marginBottom: '20px' 
      }}>
        <h2>🔧 Configuration</h2>
        <p><strong>Webhook URL for Mayar:</strong></p>
        <code style={{ 
          background: '#f0f0f0', 
          padding: '8px', 
          borderRadius: '4px', 
          display: 'block',
          margin: '10px 0'
        }}>
          {webhookUrl || '/api/webhook'}
        </code>
        
        <p><strong>Required Fields:</strong></p>
        <ul>
          <li>event: "payment.received"</li>
          <li>data.transactionId</li>
          <li>data.status: "SUCCESS"</li>
          <li>data.customerEmail</li>
          <li>data.amount (can be 0 for free)</li>
        </ul>
      </div>

      <div style={{ 
        background: '#f0fff0', 
        padding: '15px', 
        borderRadius: '8px', 
        marginBottom: '20px' 
      }}>
        <h2>🧪 Testing</h2>
        <p>Test webhook dengan sample payload:</p>
        <button 
          onClick={testWebhook}
          style={{
            background: '#007bff',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Test Webhook
        </button>
      </div>

      <div style={{ 
        background: '#fffaf0', 
        padding: '15px', 
        borderRadius: '8px' 
      }}>
        <h2>📝 API Documentation</h2>
        <p><strong>GET /api/webhook</strong> - Status check dan test payload</p>
        <p><strong>POST /api/webhook</strong> - Process Mayar payment webhooks</p>
        <p><strong>GET /api/health</strong> - Health check dan system info</p>
        
        <p style={{ marginTop: '20px' }}>
          <strong>Repository:</strong> Quiz App Webhook Mayar<br/>
          <strong>Framework:</strong> Next.js<br/>
          <strong>Deploy:</strong> Vercel
        </p>
      </div>
    </div>
  );
}
