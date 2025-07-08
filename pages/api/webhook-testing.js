import { createClient } from "@supabase/supabase-js";

// Hardcoded credentials (⚠️ only for development/testing)
const SUPABASE_URL = "https://jqfshjsabiuiofgsqgli.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZnNoanNhYml1aW9mZ3NxZ2xpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkxNDIxMCwiZXhwIjoyMDY3NDkwMjEwfQ.wcfMnFWc8NE5HD-uEG9TlVChFr8sQ9ubSDc-3KkBw6M";
const MAYAR_SIGNATURE_TOKEN =
  "9c3ce9627b2423266beee72ab31ec31bd37fec5a12c88081fade214986bed154349e4d5ee91facd9f64f2d8525e11b9408788f44d9860db3a3fc95c416324724";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Cek koneksi Supabase
    try {
      const { data: userCheck, error: userError } = await supabase
        .from("users")
        .select("id")
        .limit(1);

      const { data: productCheck, error: productError } = await supabase
        .from("products")
        .select("id")
        .limit(1);

      const mayarTokenSet = !!MAYAR_SIGNATURE_TOKEN;

      return res.status(200).json({
        status: "Webhook endpoint is running ✅",
        supabaseConnected: !userError && !productError,
        usersTableAccessible: !userError,
        productsTableAccessible: !productError,
        mayarSignatureTokenSet: mayarTokenSet,
        time: new Date().toISOString(),
      });
    } catch (err) {
      return res.status(500).json({
        error: "Internal Server Error during health check",
        detail: err.message,
      });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const signature = req.headers["x-signature"];
  if (!signature) {
    console.warn("⚠️ No x-signature header received");
    return res.status(403).json({ error: "Missing x-signature header" });
  }

  if (signature !== MAYAR_SIGNATURE_TOKEN) {
    console.warn("❌ Signature mismatch!", {
      received: signature,
      expected: MAYAR_SIGNATURE_TOKEN,
    });
    return res.status(403).json({ error: "Invalid signature" });
  }

  const { event, data } = req.body;

  if (event === "payment.received" && data.transactionStatus === "paid") {
    const { customerEmail, productId, transactionId } = data;

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("email", customerEmail)
      .single();

    if (!user) return res.status(404).json({ error: "User not found" });

    const { error } = await supabase
      .from("transactions")
      .update({
        status: "completed",
        mayar_transaction_id: transactionId,
      })
      .match({
        user_id: user.id,
        product_id: productId,
      });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ success: true });
  }

  return res.status(200).json({ received: true });
}
