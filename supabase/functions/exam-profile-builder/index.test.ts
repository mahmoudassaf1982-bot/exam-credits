import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.test("lock_profile_job: second concurrent lock is rejected", async () => {
  if (!SERVICE_KEY || !SUPABASE_URL) {
    console.log("⚠️ Missing env vars, skipping test");
    return;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Get an admin user for created_by
  const { data: adminRole } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1)
    .single();

  if (!adminRole) {
    console.log("⚠️ No admin user found, skipping test");
    return;
  }

  // Create a test job in 'queued' status
  const { data: job, error: jobErr } = await admin
    .from("ai_jobs")
    .insert({
      type: "profile_builder",
      operation: "infer_dna",
      status: "queued",
      priority: 5,
      created_by: adminRole.user_id,
      idempotency_key: `test_lock_${Date.now()}_${Math.random()}`,
      params_json: { test: true },
      progress_total: 1,
      next_run_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    console.error("Failed to create test job:", jobErr);
    return;
  }

  const jobId = job.id;
  console.log(`✅ Created test job: ${jobId}`);

  try {
    const worker1 = crypto.randomUUID();
    const worker2 = crypto.randomUUID();

    // Send TWO concurrent lock requests
    const [result1, result2] = await Promise.all([
      admin.rpc("lock_profile_job", { p_job_id: jobId, p_worker_id: worker1 }),
      admin.rpc("lock_profile_job", { p_job_id: jobId, p_worker_id: worker2 }),
    ]);

    console.log(`Worker 1 locked: ${result1.data}`);
    console.log(`Worker 2 locked: ${result2.data}`);

    // Exactly one should succeed
    const successCount = [result1.data, result2.data].filter(Boolean).length;
    console.log(`Success count: ${successCount}`);
    assertEquals(successCount, 1, "Exactly ONE worker should acquire the lock");

    // Verify job status
    const { data: updatedJob } = await admin
      .from("ai_jobs")
      .select("status, locked_by")
      .eq("id", jobId)
      .single();

    assertEquals(updatedJob?.status, "running");
    const lockedByOneOfOurs = updatedJob?.locked_by === worker1 || updatedJob?.locked_by === worker2;
    assertEquals(lockedByOneOfOurs, true, "locked_by should be one of the two workers");
    console.log(`✅ Atomic locking verified! Job locked by: ${updatedJob?.locked_by}`);

  } finally {
    await admin.from("ai_jobs").delete().eq("id", jobId);
    console.log("🧹 Cleaned up test job");
  }
});
