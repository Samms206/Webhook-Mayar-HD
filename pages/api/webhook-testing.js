import { createClient } from "@supabase/supabase-js";

// Hardcoded credentials (⚠️ only for development/testing)
const SUPABASE_URL = "https://jqfshjsabiuiofgsqgli.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZnNoanNhYml1aW9mZ3NxZ2xpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkxNDIxMCwiZXhwIjoyMDY3NDkwMjEwfQ.wcfMnFWc8NE5HD-uEG9TlVChFr8sQ9ubSDc-3KkBw6M";
const MAYAR_SIGNATURE_TOKEN =
  "9c3ce9627b2423266beee72ab31ec31bd37fec5a12c88081fade214986bed154349e4d5ee91facd9f64f2d8525e11b9408788f44d9860db3a3fc95c416324724";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Fungsi untuk logging dengan timestamp
function logWithTimestamp(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(`[${timestamp}] Data:`, JSON.stringify(data, null, 2));
  }
}

export default async function handler(req, res) {
  // Log semua request yang masuk
  logWithTimestamp("🔄 Incoming request", {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
  });

  if (req.method === "GET") {
    // Cek koneksi Supabase
    try {
      logWithTimestamp("🔍 Running health check...");
      
      const { data: userCheck, error: userError } = await supabase
        .from("users")
        .select("id")
        .limit(1);

      const { data: productCheck, error: productError } = await supabase
        .from("products")
        .select("id")
        .limit(1);

      const mayarTokenSet = !!MAYAR_SIGNATURE_TOKEN;

      const healthStatus = {
        status: "Webhook endpoint is running ✅",
        supabaseConnected: !userError && !productError,
        usersTableAccessible: !userError,
        productsTableAccessible: !productError,
        mayarSignatureTokenSet: mayarTokenSet,
        time: new Date().toISOString(),
      };

      logWithTimestamp("✅ Health check completed", healthStatus);
      return res.status(200).json(healthStatus);
    } catch (err) {
      logWithTimestamp("❌ Health check failed", { error: err.message });
      return res.status(500).json({
        error: "Internal Server Error during health check",
        detail: err.message,
      });
    }
  }

  if (req.method !== "POST") {
    logWithTimestamp("❌ Method not allowed", { method: req.method });
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Validasi signature - Mayar menggunakan x-callback-token
  const signature = req.headers["x-callback-token"] || req.headers["x-signature"];
  logWithTimestamp("🔐 Signature check", {
    receivedSignature: signature,
    expectedSignature: MAYAR_SIGNATURE_TOKEN,
    signatureMatch: signature === MAYAR_SIGNATURE_TOKEN,
    xCallbackToken: req.headers["x-callback-token"],
    xSignature: req.headers["x-signature"],
  });

  // Aktifkan validasi signature
  if (!signature) {
    logWithTimestamp("⚠️ No signature header received (checked both x-callback-token and x-signature)");
    return res.status(403).json({ error: "Missing signature header" });
  }

  if (signature !== MAYAR_SIGNATURE_TOKEN) {
    logWithTimestamp("❌ Signature mismatch!", {
      received: signature,
      expected: MAYAR_SIGNATURE_TOKEN,
    });
    return res.status(403).json({ error: "Invalid signature" });
  }

  // Validasi body request
  if (!req.body) {
    logWithTimestamp("❌ Empty request body");
    return res.status(400).json({ error: "Empty request body" });
  }

  const { event, data } = req.body;
  
  logWithTimestamp("📦 Webhook payload received", {
    event: event,
    data: data,
    fullBody: req.body,
  });

  // Validasi event dan data
  if (!event) {
    logWithTimestamp("❌ Missing event field");
    return res.status(400).json({ error: "Missing event field" });
  }

  if (!data) {
    logWithTimestamp("❌ Missing data field");
    return res.status(400).json({ error: "Missing data field" });
  }

  // Proses event payment.received
  if (event === "payment.received" && data.transactionStatus === "paid") {
    logWithTimestamp("💰 Processing payment.received event");
    
    // Validasi field yang dibutuhkan
    const { customerEmail, productId, transactionId } = data;
    
    logWithTimestamp("🔍 Extracted payment data", {
      customerEmail,
      productId,
      transactionId,
    });

    // Validasi field yang dibutuhkan
    if (!customerEmail) {
      logWithTimestamp("❌ Missing customerEmail");
      return res.status(400).json({ error: "Missing customerEmail" });
    }

    if (!productId) {
      logWithTimestamp("❌ Missing productId");
      return res.status(400).json({ error: "Missing productId" });
    }

    if (!transactionId) {
      logWithTimestamp("❌ Missing transactionId");
      return res.status(400).json({ error: "Missing transactionId" });
    }

    try {
      // Cari user berdasarkan email
      logWithTimestamp("🔍 Looking up user by email", { email: customerEmail });
      
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("email", customerEmail)
        .single();

      if (userError) {
        logWithTimestamp("❌ Error querying user", { error: userError });
        return res.status(500).json({ error: "Database error when looking up user", detail: userError.message });
      }

      if (!user) {
        logWithTimestamp("❌ User not found", { email: customerEmail });
        
        // Tambahan: Cek apakah ada user dengan email yang mirip
        const { data: similarUsers } = await supabase
          .from("users")
          .select("id, email")
          .ilike("email", `%${customerEmail.split('@')[0]}%`);
        
        logWithTimestamp("🔍 Similar users found", similarUsers);
        
        return res.status(404).json({ 
          error: "User not found", 
          searchedEmail: customerEmail,
          similarUsers: similarUsers || []
        });
      }

      logWithTimestamp("✅ User found", { userId: user.id });

      // Update transaksi
      logWithTimestamp("🔄 Updating transaction", {
        userId: user.id,
        productId: productId,
        transactionId: transactionId,
      });

      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          status: "completed",
          mayar_transaction_id: transactionId,
          updated_at: new Date().toISOString(),
        })
        .match({
          user_id: user.id,
          product_id: productId,
        });

      if (updateError) {
        logWithTimestamp("❌ Error updating transaction", { error: updateError });
        
        // Cek apakah transaksi ada
        const { data: existingTransaction } = await supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .eq("product_id", productId);
        
        logWithTimestamp("🔍 Existing transactions", existingTransaction);
        
        return res.status(500).json({ 
          error: "Error updating transaction", 
          detail: updateError.message,
          existingTransactions: existingTransaction || []
        });
      }

      logWithTimestamp("✅ Transaction updated successfully");
      return res.status(200).json({ 
        success: true, 
        message: "Payment processed successfully",
        transactionId: transactionId 
      });

    } catch (err) {
      logWithTimestamp("❌ Unexpected error during payment processing", { error: err.message });
      return res.status(500).json({ 
        error: "Internal server error", 
        detail: err.message 
      });
    }
  }

  // Log untuk event lain
  logWithTimestamp("ℹ️ Event received but not processed", {
    event: event,
    transactionStatus: data?.transactionStatus,
  });

  return res.status(200).json({ 
    received: true, 
    message: "Webhook received but not processed",
    event: event,
    status: data?.transactionStatus 
  });
}