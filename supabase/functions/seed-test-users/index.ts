import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const TEST_USERS = [
  { email: "qa1@saris.test", name: "QA Admin", balance: 0, role: "admin", password: "Admin123!" },
  { email: "qa2@saris.test", name: "QA Student 2", balance: 150, role: "user", password: "Test123!" },
  { email: "qa3@saris.test", name: "QA Student 3", balance: 0, role: "user", password: "Test123!" },
  { email: "qa4@saris.test", name: "QA Student 4", balance: 50, role: "user", password: "Test123!" },
  { email: "qa5@saris.test", name: "QA Student 5", balance: 75, role: "user", password: "Test123!" },
  { email: "qa6@saris.test", name: "QA Student 6", balance: 0, role: "user", password: "Test123!" },
  { email: "qa7@saris.test", name: "QA Student 7", balance: 100, role: "user", password: "Test123!" },
  { email: "qa8@saris.test", name: "QA Student 8", balance: 200, role: "user", password: "Test123!" },
  { email: "qa9@saris.test", name: "QA Student 9", balance: 50, role: "user", password: "Test123!" },
  { email: "qa10@saris.test", name: "QA Student 10", balance: 10, role: "user", password: "Test123!" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("N8N_SARIS_KEY");
  if (!apiKey || apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const url = new URL(req.url);
  const action = url.pathname.split("/").pop(); // seed-test-users or last segment

  try {
    const body = await req.json().catch(() => ({}));
    const operation = (body as any).action || "seed"; // "seed" | "cleanup"

    if (operation === "cleanup") {
      return await cleanupTestUsers(admin);
    }

    return await seedTestUsers(admin);
  } catch (e) {
    console.error("[seed-test-users] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function seedTestUsers(admin: any) {
  const results: any[] = [];

  for (const user of TEST_USERS) {
    try {
      // Check if user already exists
      const { data: existingUsers } = await admin.auth.admin.listUsers();
      const existing = existingUsers?.users?.find((u: any) => u.email === user.email);

      let userId: string;

      if (existing) {
        userId = existing.id;
        results.push({ email: user.email, status: "already_exists", id: userId });
      } else {
        // Create user
        const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true,
          user_metadata: {
            name: user.name,
            country_id: "kw",
            country_name: "الكويت",
          },
        });

        if (createErr) {
          results.push({ email: user.email, status: "error", error: createErr.message });
          continue;
        }

        userId = newUser.user.id;
        results.push({ email: user.email, status: "created", id: userId });
      }

      // Ensure wallet has correct balance
      const { data: wallet } = await admin
        .from("wallets")
        .select("id, balance")
        .eq("user_id", userId)
        .single();

      if (wallet) {
        if (wallet.balance !== user.balance) {
          await admin
            .from("wallets")
            .update({ balance: user.balance })
            .eq("user_id", userId);
        }
      }

      // Set role if admin
      if (user.role === "admin") {
        const { data: existingRole } = await admin
          .from("user_roles")
          .select("id")
          .eq("user_id", userId)
          .eq("role", "admin")
          .single();

        if (!existingRole) {
          await admin
            .from("user_roles")
            .insert({ user_id: userId, role: "admin" });
        }
      }
    } catch (e) {
      results.push({
        email: user.email,
        status: "error",
        error: e instanceof Error ? e.message : "Unknown",
      });
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Processed ${results.length} test users`,
      results,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

async function cleanupTestUsers(admin: any) {
  const { data: allUsers } = await admin.auth.admin.listUsers();
  const testUsers = allUsers?.users?.filter((u: any) =>
    u.email?.endsWith("@saris.test")
  ) || [];

  const results: any[] = [];

  for (const user of testUsers) {
    try {
      // Delete related data first
      await admin.from("user_roles").delete().eq("user_id", user.id);
      await admin.from("transactions").delete().eq("user_id", user.id);
      await admin.from("wallets").delete().eq("user_id", user.id);
      await admin.from("profiles").delete().eq("id", user.id);
      await admin.from("exam_sessions").delete().eq("user_id", user.id);
      await admin.from("student_training_recommendations").delete().eq("student_id", user.id);
      await admin.from("student_memory_profile").delete().eq("student_id", user.id);
      await admin.from("student_learning_dna").delete().eq("student_id", user.id);
      await admin.from("student_score_predictions").delete().eq("student_id", user.id);
      await admin.from("student_thinking_reports").delete().eq("student_id", user.id);
      await admin.from("student_recommendation_history").delete().eq("student_id", user.id);
      await admin.from("skill_memory").delete().eq("user_id", user.id);
      await admin.from("score_predictions").delete().eq("user_id", user.id);
      await admin.from("payment_orders").delete().eq("user_id", user.id);
      await admin.from("exam_submissions").delete().eq("user_id", user.id);

      // Delete auth user last
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) {
        results.push({ email: user.email, status: "error", error: error.message });
      } else {
        results.push({ email: user.email, status: "deleted" });
      }
    } catch (e) {
      results.push({
        email: user.email,
        status: "error",
        error: e instanceof Error ? e.message : "Unknown",
      });
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Cleaned up ${results.length} test users`,
      results,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
