import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_APP_URL = "https://exam-credits.lovable.app/app/admin";

interface SectionHealth {
  section_id: string;
  section_name: string;
  total: number;
  easy: number;
  medium: number;
  hard: number;
  easy_pct: number;
  medium_pct: number;
  hard_pct: number;
  target_easy_pct: number;
  target_medium_pct: number;
  target_hard_pct: number;
  shortages: { difficulty: string; deficit: number; recommended_generate: number }[];
}

interface ExamHealth {
  exam_template_id: string;
  exam_name: string;
  country_id: string;
  total_approved: number;
  easy: number;
  medium: number;
  hard: number;
  easy_pct: number;
  medium_pct: number;
  hard_pct: number;
  target_easy_pct: number;
  target_medium_pct: number;
  target_hard_pct: number;
  health_alert_threshold_pct: number;
  alerts: string[];
  sections: SectionHealth[];
  recommendations: string[];
}

function buildHealthEmailHtml(reports: ExamHealth[]): string {
  const alertExams = reports.filter((r) => r.alerts.length > 0);
  const totalAlerts = alertExams.reduce((s, r) => s + r.alerts.length, 0);

  const examRows = reports
    .map((r) => {
      const statusEmoji = r.alerts.length > 0 ? "🔴" : "🟢";
      const alertsHtml = r.alerts.length > 0
        ? r.alerts.map((a) => `<li style="color:#dc2626;font-size:13px;">${a}</li>`).join("")
        : '<li style="color:#16a34a;font-size:13px;">✅ صحة البنك جيدة</li>';
      const recsHtml = r.recommendations.length > 0
        ? r.recommendations.map((rec) => `<li style="color:#d97706;font-size:13px;">💡 ${rec}</li>`).join("")
        : "";

      return `
        <tr>
          <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
            <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">${statusEmoji} ${r.exam_name}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">إجمالي الأسئلة المعتمدة: ${r.total_approved}</p>
            <table width="100%" style="margin:8px 0;font-size:12px;">
              <tr>
                <td style="color:#16a34a;">سهل: ${r.easy} (${r.easy_pct}% / هدف ${r.target_easy_pct}%)</td>
                <td style="color:#d97706;">متوسط: ${r.medium} (${r.medium_pct}% / هدف ${r.target_medium_pct}%)</td>
                <td style="color:#dc2626;">صعب: ${r.hard} (${r.hard_pct}% / هدف ${r.target_hard_pct}%)</td>
              </tr>
            </table>
            <ul style="margin:4px 0 0;padding-right:16px;">${alertsHtml}${recsHtml}</ul>
          </td>
        </tr>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0891b2,#06b6d4);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;">SARIS Exams</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">تقرير صحة بنك الأسئلة</p>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:32px 40px 16px;">
            <div style="display:inline-block;background:#ecfdf5;border-radius:50%;width:72px;height:72px;line-height:72px;font-size:36px;text-align:center;">📊</div>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:0 40px 24px;">
            <h2 style="margin:0;color:#111827;font-size:22px;font-weight:700;">تقرير صحة بنك الأسئلة</h2>
            <p style="margin:8px 0 0;color:#6b7280;font-size:15px;">
              ${totalAlerts > 0 ? `⚠️ ${totalAlerts} تنبيه في ${alertExams.length} اختبار` : "✅ جميع الاختبارات بحالة جيدة"}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
              ${examRows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:0 40px 40px;">
            <a href="${ADMIN_APP_URL}/bank-health" style="display:inline-block;background:linear-gradient(135deg,#0891b2,#06b6d4);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">📊 فتح لوحة صحة البنك</a>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">تقرير تلقائي من منصة SARIS Exams · ${new Date().toLocaleDateString("ar-SA")}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Get admin email
    const { data: emailRow } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "admin_notification_email")
      .single();

    const adminEmail = emailRow?.value;

    // 2. Get all active exam templates with targets
    const { data: templates } = await admin
      .from("exam_templates")
      .select("id, name_ar, country_id, target_easy_pct, target_medium_pct, target_hard_pct, health_alert_threshold_pct")
      .eq("is_active", true);

    if (!templates || templates.length === 0) {
      return new Response(JSON.stringify({ message: "No active templates" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reports: ExamHealth[] = [];

    for (const tmpl of templates) {
      // Get approved questions grouped by difficulty
      const { data: questions } = await admin
        .from("questions")
        .select("id, difficulty, section_id")
        .eq("is_approved", true)
        .eq("exam_template_id", String(tmpl.id))
        .is("deleted_at", null);

      const qs = questions || [];
      const total = qs.length;
      const easy = qs.filter((q: any) => q.difficulty === "easy").length;
      const medium = qs.filter((q: any) => q.difficulty === "medium").length;
      const hard = qs.filter((q: any) => q.difficulty === "hard").length;

      const easyPct = total > 0 ? Math.round((easy / total) * 100) : 0;
      const mediumPct = total > 0 ? Math.round((medium / total) * 100) : 0;
      const hardPct = total > 0 ? Math.round((hard / total) * 100) : 0;

      const threshold = tmpl.health_alert_threshold_pct || 10;
      const alerts: string[] = [];
      const recommendations: string[] = [];

      if (tmpl.target_easy_pct - easyPct > threshold) {
        const deficit = Math.ceil((tmpl.target_easy_pct - easyPct) * total / 100);
        alerts.push(`نقص أسئلة سهلة: ${easyPct}% مقابل هدف ${tmpl.target_easy_pct}%`);
        recommendations.push(`ولّد ${Math.max(deficit, 10)} سؤال سهل`);
      }
      if (tmpl.target_medium_pct - mediumPct > threshold) {
        const deficit = Math.ceil((tmpl.target_medium_pct - mediumPct) * total / 100);
        alerts.push(`نقص أسئلة متوسطة: ${mediumPct}% مقابل هدف ${tmpl.target_medium_pct}%`);
        recommendations.push(`ولّد ${Math.max(deficit, 10)} سؤال متوسط`);
      }
      if (tmpl.target_hard_pct - hardPct > threshold) {
        const deficit = Math.ceil((tmpl.target_hard_pct - hardPct) * total / 100);
        alerts.push(`نقص أسئلة صعبة: ${hardPct}% مقابل هدف ${tmpl.target_hard_pct}%`);
        recommendations.push(`ولّد ${Math.max(deficit, 10)} سؤال صعب`);
      }

      // Per-section breakdown
      const { data: sections } = await admin
        .from("exam_sections")
        .select("id, name_ar")
        .eq("exam_template_id", tmpl.id);

      const sectionHealths: SectionHealth[] = [];
      for (const sec of (sections || [])) {
        const secQs = qs.filter((q: any) => q.section_id === sec.id);
        const sTotal = secQs.length;
        const sEasy = secQs.filter((q: any) => q.difficulty === "easy").length;
        const sMedium = secQs.filter((q: any) => q.difficulty === "medium").length;
        const sHard = secQs.filter((q: any) => q.difficulty === "hard").length;

        const shortages: { difficulty: string; deficit: number; recommended_generate: number }[] = [];
        const sEasyPct = sTotal > 0 ? Math.round((sEasy / sTotal) * 100) : 0;
        const sMediumPct = sTotal > 0 ? Math.round((sMedium / sTotal) * 100) : 0;
        const sHardPct = sTotal > 0 ? Math.round((sHard / sTotal) * 100) : 0;

        if (tmpl.target_easy_pct - sEasyPct > threshold) {
          const def = Math.max(Math.ceil((tmpl.target_easy_pct - sEasyPct) * sTotal / 100), 5);
          shortages.push({ difficulty: "easy", deficit: tmpl.target_easy_pct - sEasyPct, recommended_generate: def });
        }
        if (tmpl.target_medium_pct - sMediumPct > threshold) {
          const def = Math.max(Math.ceil((tmpl.target_medium_pct - sMediumPct) * sTotal / 100), 5);
          shortages.push({ difficulty: "medium", deficit: tmpl.target_medium_pct - sMediumPct, recommended_generate: def });
        }
        if (tmpl.target_hard_pct - sHardPct > threshold) {
          const def = Math.max(Math.ceil((tmpl.target_hard_pct - sHardPct) * sTotal / 100), 5);
          shortages.push({ difficulty: "hard", deficit: tmpl.target_hard_pct - sHardPct, recommended_generate: def });
        }

        if (shortages.length > 0) {
          for (const s of shortages) {
            const diffLabel = s.difficulty === "easy" ? "سهلة" : s.difficulty === "medium" ? "متوسطة" : "صعبة";
            recommendations.push(`قسم "${sec.name_ar}": ولّد ${s.recommended_generate} سؤال ${diffLabel}`);
          }
        }

        sectionHealths.push({
          section_id: sec.id,
          section_name: sec.name_ar,
          total: sTotal,
          easy: sEasy,
          medium: sMedium,
          hard: sHard,
          easy_pct: sEasyPct,
          medium_pct: sMediumPct,
          hard_pct: sHardPct,
          target_easy_pct: tmpl.target_easy_pct,
          target_medium_pct: tmpl.target_medium_pct,
          target_hard_pct: tmpl.target_hard_pct,
          shortages,
        });
      }

      reports.push({
        exam_template_id: tmpl.id,
        exam_name: tmpl.name_ar,
        country_id: tmpl.country_id,
        total_approved: total,
        easy,
        medium,
        hard,
        easy_pct: easyPct,
        medium_pct: mediumPct,
        hard_pct: hardPct,
        target_easy_pct: tmpl.target_easy_pct,
        target_medium_pct: tmpl.target_medium_pct,
        target_hard_pct: tmpl.target_hard_pct,
        health_alert_threshold_pct: threshold,
        alerts,
        sections: sectionHealths,
        recommendations,
      });
    }

    // 3. Send email if admin email is configured and there are alerts
    const hasAlerts = reports.some((r) => r.alerts.length > 0);
    let emailSent = false;

    if (adminEmail && hasAlerts) {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        const html = buildHealthEmailHtml(reports);
        const totalAlerts = reports.reduce((s, r) => s + r.alerts.length, 0);

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "SARIS Exams <onboarding@resend.dev>",
            to: [adminEmail],
            subject: `📊 تقرير صحة بنك الأسئلة — ${totalAlerts} تنبيه`,
            html,
          }),
        });

        emailSent = response.ok;
        if (!response.ok) {
          const err = await response.text();
          console.error("Resend error:", err);
        }
      }
    }

    return new Response(
      JSON.stringify({ reports, email_sent: emailSent, has_alerts: hasAlerts }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Bank health report error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
