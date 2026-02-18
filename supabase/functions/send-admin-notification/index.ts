import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_APP_URL = 'https://exam-credits.lovable.app/app/admin';

function buildNewUserEmail(data: Record<string, string>) {
  return {
    subject: '🆕 مستخدم جديد في SARIS Exams',
    html: `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">SARIS Exams</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">لوحة الإدارة - إشعار فوري</p>
          </td>
        </tr>
        <!-- Icon Badge -->
        <tr>
          <td style="text-align:center;padding:32px 40px 16px;">
            <div style="display:inline-block;background:#ecfdf5;border-radius:50%;width:72px;height:72px;line-height:72px;font-size:36px;text-align:center;">🆕</div>
          </td>
        </tr>
        <!-- Title -->
        <tr>
          <td style="text-align:center;padding:0 40px 24px;">
            <h2 style="margin:0;color:#111827;font-size:22px;font-weight:700;">مستخدم جديد انضم للمنصة!</h2>
            <p style="margin:8px 0 0;color:#6b7280;font-size:15px;">تم تسجيل مستخدم جديد في SARIS Exams للتو.</p>
          </td>
        </tr>
        <!-- Details Card -->
        <tr>
          <td style="padding:0 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">الاسم</p>
                  <p style="margin:4px 0 0;color:#111827;font-size:16px;font-weight:600;">${data.name || 'غير محدد'}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">البريد الإلكتروني</p>
                  <p style="margin:4px 0 0;color:#111827;font-size:15px;" dir="ltr">${data.email || 'غير محدد'}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">الدولة</p>
                  <p style="margin:4px 0 0;color:#111827;font-size:15px;">${data.countryName || 'غير محدد'}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">وقت التسجيل</p>
                  <p style="margin:4px 0 0;color:#111827;font-size:15px;" dir="ltr">${new Date(data.createdAt).toLocaleString('ar-SA')}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- CTA Button -->
        <tr>
          <td style="text-align:center;padding:0 40px 40px;">
            <a href="${ADMIN_APP_URL}/users" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.3px;">👤 عرض المستخدم في لوحة الإدارة</a>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">هذا إشعار تلقائي من منصة SARIS Exams · لا تحتاج للرد</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

function buildPointsPurchaseEmail(data: Record<string, string | number>) {
  return {
    subject: '💰 عملية شراء نقاط ناجحة - SARIS Exams',
    html: `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#059669,#10b981);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;">SARIS Exams</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">لوحة الإدارة - إشعار فوري</p>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:32px 40px 16px;">
            <div style="display:inline-block;background:#fef9c3;border-radius:50%;width:72px;height:72px;line-height:72px;font-size:36px;text-align:center;">💰</div>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:0 40px 24px;">
            <h2 style="margin:0;color:#111827;font-size:22px;font-weight:700;">عملية شراء نقاط ناجحة!</h2>
            <p style="margin:8px 0 0;color:#6b7280;font-size:15px;">أتمّ مستخدم عملية شراء نقاط بنجاح.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">اسم المستخدم</p>
                  <p style="margin:4px 0 0;color:#111827;font-size:16px;font-weight:600;">${data.userName}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">عدد النقاط</p>
                  <p style="margin:4px 0 0;color:#059669;font-size:20px;font-weight:800;">${data.pointsAmount} نقطة</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">المبلغ المدفوع</p>
                  <p style="margin:4px 0 0;color:#111827;font-size:18px;font-weight:700;" dir="ltr">$${Number(data.priceUsd).toFixed(2)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">وقت العملية</p>
                  <p style="margin:4px 0 0;color:#111827;font-size:14px;" dir="ltr">${new Date(String(data.createdAt)).toLocaleString('ar-SA')}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:0 40px 40px;">
            <a href="${ADMIN_APP_URL}/stats" style="display:inline-block;background:linear-gradient(135deg,#059669,#10b981);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">📊 عرض الإحصائيات في لوحة الإدارة</a>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">هذا إشعار تلقائي من منصة SARIS Exams · لا تحتاج للرد</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

function buildDiamondSubscriptionEmail(data: Record<string, string | number>) {
  return {
    subject: '💎 مشترك ماسي جديد! - SARIS Exams',
    html: `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;">SARIS Exams</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">لوحة الإدارة - إشعار فوري</p>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:32px 40px 16px;">
            <div style="display:inline-block;background:#ede9fe;border-radius:50%;width:72px;height:72px;line-height:72px;font-size:36px;text-align:center;">💎</div>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:0 40px 24px;">
            <h2 style="margin:0;color:#111827;font-size:22px;font-weight:700;">مشترك ماسي جديد!</h2>
            <p style="margin:8px 0 0;color:#6b7280;font-size:15px;">مستخدم جديد فعّل اشتراك Diamond السنوي.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">اسم المشترك</p>
                  <p style="margin:4px 0 0;color:#111827;font-size:16px;font-weight:600;">${data.userName}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">نوع الاشتراك</p>
                  <p style="margin:4px 0 0;color:#7c3aed;font-size:16px;font-weight:700;">💎 Diamond سنوي</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">المبلغ المدفوع</p>
                  <p style="margin:4px 0 0;color:#111827;font-size:18px;font-weight:700;" dir="ltr">$${Number(data.priceUsd).toFixed(2)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">وقت الاشتراك</p>
                  <p style="margin:4px 0 0;color:#111827;font-size:14px;" dir="ltr">${new Date(String(data.createdAt)).toLocaleString('ar-SA')}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:0 40px 40px;">
            <a href="${ADMIN_APP_URL}/users" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">💎 عرض المشتركين في لوحة الإدارة</a>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">هذا إشعار تلقائي من منصة SARIS Exams · لا تحتاج للرد</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const body = await req.json();
    const { type, adminEmail, data } = body;

    if (!adminEmail || !type || !data) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let emailContent: { subject: string; html: string };

    if (type === 'new_user') {
      emailContent = buildNewUserEmail(data);
    } else if (type === 'points_pack') {
      emailContent = buildPointsPurchaseEmail(data);
    } else if (type === 'diamond_yearly' || type === 'subscription') {
      emailContent = buildDiamondSubscriptionEmail(data);
    } else {
      // Generic payment email for unknown types
      emailContent = buildPointsPurchaseEmail(data);
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SARIS Exams <onboarding@resend.dev>',
        to: [adminEmail],
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Resend API error:', result);
      throw new Error(`Resend API error [${response.status}]: ${JSON.stringify(result)}`);
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('send-admin-notification error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
