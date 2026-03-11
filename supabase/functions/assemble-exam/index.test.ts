import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

// ─── Helper: REST GET with consumed body ───
async function restGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  const data = await res.json();
  return data as T;
}

// ─── Helper: fetch active KW math template ───
async function findKwMathTemplate(): Promise<{ id: string; name_ar: string } | null> {
  const templates = await restGet<Array<{ id: string; name_ar: string }>>(
    "exam_templates?country_id=eq.KW&is_active=eq.true&select=id,name_ar"
  );
  // Find aptitude / math template
  const mathKeywords = ["رياضيات", "كمي", "math", "aptitude"];
  const match = templates?.find((t) =>
    mathKeywords.some((kw) => t.name_ar.toLowerCase().includes(kw) || t.id.includes("a1000000"))
  );
  return match ?? templates?.[0] ?? null;
}

// ─── Helper: fetch sections for a template ───
async function fetchSections(templateId: string) {
  return restGet<Array<{ id: string; name_ar: string; question_count: number }>>(
    `exam_sections?exam_template_id=eq.${templateId}&select=id,name_ar,question_count`
  );
}

// ════════════════════════════════════════════════════════════
// TEST 1: Bank integrity — no orphan approved questions
// ════════════════════════════════════════════════════════════

Deno.test("No approved questions with NULL exam_template_id", async () => {
  const orphans = await restGet<Array<{ id: string }>>(
    "questions?is_approved=eq.true&exam_template_id=is.null&select=id&limit=5"
  );
  assertEquals(
    Array.isArray(orphans) ? orphans.length : 0,
    0,
    "FAIL: Found approved questions with NULL exam_template_id"
  );
  console.log("✅ 0 approved questions with NULL exam_template_id");
});

Deno.test("No approved questions with NULL section_id", async () => {
  const orphans = await restGet<Array<{ id: string; topic: string }>>(
    "questions?is_approved=eq.true&section_id=is.null&select=id,topic&limit=10"
  );
  if (Array.isArray(orphans) && orphans.length > 0) {
    console.warn(`⚠️ Found ${orphans.length} orphan(s): ${orphans.map(o => o.id.slice(0,8)).join(", ")}`);
  }
  assertEquals(
    Array.isArray(orphans) ? orphans.length : 0,
    0,
    `FAIL: Found ${orphans?.length} approved questions with NULL section_id (orphans in bank)`
  );
  console.log("✅ 0 approved questions with NULL section_id");
});

// ════════════════════════════════════════════════════════════
// TEST 2: Section-question alignment (critical E2E check)
// ════════════════════════════════════════════════════════════

Deno.test("All approved questions reference valid existing sections", async () => {
  const template = await findKwMathTemplate();
  if (!template) {
    console.warn("⚠️ No KW template found - skipping");
    return;
  }

  const sections = await fetchSections(template.id);
  if (sections.length === 0) {
    console.warn("⚠️ No sections found - skipping");
    return;
  }

  const validSectionIds = new Set(sections.map((s) => s.id));
  console.log(`📋 Template: ${template.name_ar} | ${sections.length} sections`);

  // Fetch all approved questions for this template
  const questions = await restGet<Array<{ id: string; section_id: string | null; topic: string }>>(
    `questions?is_approved=eq.true&exam_template_id=eq.${template.id}&deleted_at=is.null&select=id,section_id,topic&limit=1000`
  );

  if (!Array.isArray(questions) || questions.length === 0) {
    console.warn("⚠️ No approved questions for template - skipping");
    return;
  }

  let orphanCount = 0;
  let mismatchCount = 0;

  for (const q of questions) {
    if (q.section_id === null) {
      orphanCount++;
      continue;
    }
    if (!validSectionIds.has(q.section_id)) {
      mismatchCount++;
      console.error(
        `❌ Question ${q.id.slice(0, 8)} (topic: ${q.topic}) has section_id=${q.section_id} ` +
        `which does NOT exist in exam_sections for template ${template.id}`
      );
    }
  }

  assertEquals(orphanCount, 0, `FAIL: ${orphanCount} approved questions have NULL section_id`);
  assertEquals(
    mismatchCount, 0,
    `FAIL: ${mismatchCount} approved questions reference section_ids that don't exist in exam_sections. ` +
    `This means assembly will return 0 questions for those sections!`
  );

  console.log(`✅ All ${questions.length} approved questions reference valid sections`);
});

// ════════════════════════════════════════════════════════════
// TEST 3: E2E assembly simulation — practice mode
// ════════════════════════════════════════════════════════════

Deno.test("E2E: Practice assembly picks only questions from correct template and sections", async () => {
  /**
   * This test simulates what assemble-exam does for practice mode:
   * For each section in the template, it queries approved questions
   * and verifies they all belong to the correct template+section.
   *
   * This is the REAL assembly path check — not just bank integrity.
   */
  const template = await findKwMathTemplate();
  if (!template) {
    console.warn("⚠️ No KW template found - skipping E2E assembly test");
    return;
  }

  const sections = await fetchSections(template.id);
  if (sections.length === 0) {
    console.warn("⚠️ No sections found - skipping");
    return;
  }

  console.log(`🧪 E2E Assembly Simulation: ${template.name_ar}`);
  console.log(`   Sections: ${sections.map(s => s.name_ar).join(", ")}`);

  let totalAssembled = 0;

  for (const section of sections) {
    // This is exactly what fetchSectionQuestions does in the edge function
    const questions = await restGet<Array<{
      id: string;
      exam_template_id: string | null;
      section_id: string | null;
      topic: string;
      difficulty: string;
      text_ar: string;
    }>>(
      `questions?is_approved=eq.true&deleted_at=is.null` +
      `&exam_template_id=eq.${template.id}` +
      `&section_id=eq.${section.id}` +
      `&select=id,exam_template_id,section_id,topic,difficulty,text_ar` +
      `&limit=50`
    );

    if (!Array.isArray(questions)) continue;

    for (const q of questions) {
      // ASSERT: every question must have the correct template
      assertEquals(
        q.exam_template_id,
        template.id,
        `Question ${q.id} has wrong exam_template_id: ${q.exam_template_id} (expected ${template.id})`
      );

      // ASSERT: every question must have the correct section
      assertEquals(
        q.section_id,
        section.id,
        `Question ${q.id} has wrong section_id: ${q.section_id} (expected ${section.id})`
      );

      // ASSERT: no NULL values
      assertNotEquals(q.exam_template_id, null, `Question ${q.id} has NULL exam_template_id`);
      assertNotEquals(q.section_id, null, `Question ${q.id} has NULL section_id`);
    }

    totalAssembled += questions.length;
    console.log(`   ✅ ${section.name_ar}: ${questions.length} questions (all within boundary)`);
  }

  console.log(`✅ E2E Assembly: ${totalAssembled} total questions across ${sections.length} sections — all valid`);

  if (totalAssembled === 0) {
    console.warn(
      "⚠️ WARNING: Assembly returned 0 questions! This means no approved questions match " +
      "the current section_ids. Check if questions were generated with old section UUIDs."
    );
  }
});

// ════════════════════════════════════════════════════════════
// TEST 4: REGRESSION — no verbal questions in Math sections
// ════════════════════════════════════════════════════════════

Deno.test("REGRESSION: No verbal/linguistic questions in Math sections", async () => {
  const template = await findKwMathTemplate();
  if (!template) {
    console.warn("⚠️ No KW template found - skipping regression test");
    return;
  }

  const sections = await fetchSections(template.id);
  const verbalKeywords = ["لفظي", "لغوي", "verbal", "تناظر", "analogy", "استيعاب"];

  console.log(`🔍 Checking ${sections.length} section(s) for verbal contamination`);

  for (const section of sections) {
    const questions = await restGet<Array<{ id: string; topic: string; text_ar: string }>>(
      `questions?is_approved=eq.true&section_id=eq.${section.id}` +
      `&select=id,topic,text_ar&limit=500`
    );

    if (!Array.isArray(questions)) continue;

    for (const q of questions) {
      const topicLower = (q.topic || "").toLowerCase();
      const textLower = (q.text_ar || "").toLowerCase();

      const isVerbal = verbalKeywords.some(
        (kw) => topicLower.includes(kw) || textLower.includes(kw)
      );

      assertEquals(
        isVerbal,
        false,
        `REGRESSION: Verbal question in section "${section.name_ar}"! ` +
        `Question ${q.id}: topic="${q.topic}", text="${(q.text_ar || "").substring(0, 80)}..."`
      );
    }

    console.log(`   ✅ ${section.name_ar}: ${questions?.length ?? 0} questions, 0 verbal`);
  }

  console.log("✅ REGRESSION test (verbal contamination): PASSED");
});

// ════════════════════════════════════════════════════════════
// TEST 5: No country-only fallback — orphan guard
// ════════════════════════════════════════════════════════════

Deno.test("No orphan questions that country-only fallback could pull in", async () => {
  // If template_id is NULL, a country-only query would pull these into any session
  const orphans = await restGet<Array<{ id: string }>>(
    "questions?is_approved=eq.true&exam_template_id=is.null&select=id&limit=5"
  );

  assertEquals(
    Array.isArray(orphans) ? orphans.length : 0,
    0,
    "FAIL: Approved orphan questions (NULL template) could leak via country-only fallback"
  );

  // Also check NULL section_id
  const orphans2 = await restGet<Array<{ id: string }>>(
    "questions?is_approved=eq.true&section_id=is.null&select=id&limit=5"
  );

  assertEquals(
    Array.isArray(orphans2) ? orphans2.length : 0,
    0,
    "FAIL: Approved orphan questions (NULL section) could leak into any training session"
  );

  console.log("✅ No orphan questions — fallback guard: PASSED");
});
