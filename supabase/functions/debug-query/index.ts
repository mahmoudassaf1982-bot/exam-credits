import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Test 1: Count with head
  const { count: c1, error: e1 } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("is_approved", true)
    .eq("country_id", "kw")
    .eq("language", "ar")
    .eq("section_id", "9018e8a2-b115-4d5b-b46a-24f571fb3849");

  // Test 2: Select id only
  const { data: d2, error: e2 } = await admin
    .from("questions")
    .select("id")
    .eq("is_approved", true)
    .eq("country_id", "kw")
    .eq("language", "ar")
    .eq("section_id", "9018e8a2-b115-4d5b-b46a-24f571fb3849")
    .limit(50);

  // Test 3: Select id + difficulty
  const { data: d3, error: e3 } = await admin
    .from("questions")
    .select("id, difficulty")
    .eq("is_approved", true)
    .eq("country_id", "kw")
    .eq("language", "ar")
    .eq("section_id", "9018e8a2-b115-4d5b-b46a-24f571fb3849")
    .limit(50);

  // Test 4: Select all columns
  const { data: d4, error: e4 } = await admin
    .from("questions")
    .select("*")
    .eq("is_approved", true)
    .eq("country_id", "kw")
    .eq("language", "ar")
    .eq("section_id", "9018e8a2-b115-4d5b-b46a-24f571fb3849")
    .limit(50);

  // Test 5: No filters at all
  const { data: d5, error: e5 } = await admin
    .from("questions")
    .select("id")
    .eq("section_id", "9018e8a2-b115-4d5b-b46a-24f571fb3849")
    .limit(50);

  // Test 6: Direct REST call
  const resp = await fetch(`${supabaseUrl}/rest/v1/questions?select=id&section_id=eq.9018e8a2-b115-4d5b-b46a-24f571fb3849&limit=50`, {
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Accept": "application/json",
      "Prefer": "count=exact",
    },
  });
  const d6 = await resp.json();
  const cr6 = resp.headers.get("content-range");

  return new Response(JSON.stringify({
    test1_count: { count: c1, error: e1?.message },
    test2_id_only: { count: d2?.length, error: e2?.message },
    test3_id_diff: { count: d3?.length, error: e3?.message },
    test4_all_cols: { count: d4?.length, error: e4?.message },
    test5_no_filters: { count: d5?.length, error: e5?.message },
    test6_direct_rest: { count: d6?.length, content_range: cr6 },
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
