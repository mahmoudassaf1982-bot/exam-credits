import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Verify caller is admin
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

  const { data: roleCheck } = await callerClient.from('user_roles').select('role').eq('user_id', caller.id).eq('role', 'admin').single();
  if (!roleCheck) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });

  // Use service role for admin operations
  const admin = createClient(supabaseUrl, serviceKey);

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    if (req.method === 'GET' && action === 'list') {
      // List all users with profiles + wallets + roles
      const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const userIds = authUsers.users.map((u) => u.id);

      const [profilesRes, walletsRes, rolesRes] = await Promise.all([
        admin.from('profiles').select('*').in('id', userIds),
        admin.from('wallets').select('*').in('user_id', userIds),
        admin.from('user_roles').select('*').in('user_id', userIds),
      ]);

      const profileMap = Object.fromEntries((profilesRes.data || []).map((p) => [p.id, p]));
      const walletMap = Object.fromEntries((walletsRes.data || []).map((w) => [w.user_id, w]));
      const rolesMap: Record<string, string[]> = {};
      for (const r of rolesRes.data || []) {
        if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
        rolesMap[r.user_id].push(r.role);
      }

      const users = authUsers.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        banned_until: u.banned_until,
        name: profileMap[u.id]?.name || '',
        country_name: profileMap[u.id]?.country_name || '',
        balance: walletMap[u.id]?.balance ?? 0,
        roles: rolesMap[u.id] || ['user'],
      }));

      return new Response(JSON.stringify({ users }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (req.method === 'POST') {
      const body = await req.json();

      if (action === 'set_role') {
        const { user_id, role } = body;
        // Remove existing roles first
        await admin.from('user_roles').delete().eq('user_id', user_id);
        if (role !== 'user') {
          await admin.from('user_roles').insert({ user_id, role });
        }
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (action === 'adjust_balance') {
        const { user_id, delta, reason } = body;
        // Get current balance
        const { data: wallet } = await admin.from('wallets').select('balance').eq('user_id', user_id).single();
        const current = wallet?.balance ?? 0;
        const newBalance = Math.max(0, current + delta);
        await admin.from('wallets').update({ balance: newBalance }).eq('user_id', user_id);
        await admin.from('transactions').insert({
          user_id,
          type: delta >= 0 ? 'credit' : 'debit',
          amount: Math.abs(delta),
          reason: 'admin_adjustment',
          meta_json: { note: reason || 'Admin manual adjustment' },
        });
        return new Response(JSON.stringify({ success: true, new_balance: newBalance }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (action === 'reset_password') {
        const { email } = body;
        await admin.auth.admin.generateLink({ type: 'recovery', email });
        // Send via Supabase built-in email
        const { error } = await admin.auth.resetPasswordForEmail(email);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (action === 'ban_user') {
        const { user_id, ban } = body;
        const { error } = await admin.auth.admin.updateUserById(user_id, {
          ban_duration: ban ? '87600h' : 'none',
        });
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (action === 'delete_user') {
        const { user_id } = body;
        const { error } = await admin.auth.admin.deleteUser(user_id);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
