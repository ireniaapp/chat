import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

type PlanInterval = 'monthly' | 'yearly';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

async function getPayPalAccessToken(baseUrl: string, clientId: string, secret: string) {
  const auth = btoa(`${clientId}:${secret}`);
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || 'No se pudo autenticar con PayPal');
  }

  return payload.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const paypalClientId = Deno.env.get('PAYPAL_CLIENT_ID');
    const paypalSecret = Deno.env.get('PAYPAL_SECRET');
    const paypalEnvironment = (Deno.env.get('PAYPAL_ENV') || 'sandbox').toLowerCase();
    const paypalPlanMonthly = Deno.env.get('PAYPAL_PLAN_MONTHLY_ID');
    const paypalPlanYearly = Deno.env.get('PAYPAL_PLAN_YEARLY_ID');
    const appBaseUrl = Deno.env.get('APP_BASE_URL');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error('Config incompleta de Supabase en Edge Function');
    }

    if (!paypalClientId || !paypalSecret || !paypalPlanMonthly || !paypalPlanYearly || !appBaseUrl) {
      throw new Error('Faltan variables PAYPAL_* o APP_BASE_URL');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'No autorizado' }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'Sesion invalida' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const planInterval = body?.planInterval as PlanInterval;
    if (planInterval !== 'monthly' && planInterval !== 'yearly') {
      return jsonResponse({ error: 'planInterval invalido' }, 400);
    }

    const planId = planInterval === 'monthly' ? paypalPlanMonthly : paypalPlanYearly;
    const baseUrl = paypalEnvironment === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    const accessToken = await getPayPalAccessToken(baseUrl, paypalClientId, paypalSecret);

    const subscribeResponse = await fetch(`${baseUrl}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        plan_id: planId,
        custom_id: userData.user.id,
        application_context: {
          brand_name: 'Irenia',
          user_action: 'SUBSCRIBE_NOW',
          return_url: `${appBaseUrl}/index.html?paypal=success`,
          cancel_url: `${appBaseUrl}/index.html?paypal=cancel`
        }
      })
    });

    const subscribePayload = await subscribeResponse.json();
    if (!subscribeResponse.ok) {
      const message = subscribePayload?.message || subscribePayload?.name || 'No se pudo crear suscripcion PayPal';
      throw new Error(message);
    }

    const approvalLink = Array.isArray(subscribePayload?.links)
      ? subscribePayload.links.find((item: { rel?: string }) => item.rel === 'approve')
      : null;

    if (!approvalLink?.href) {
      throw new Error('PayPal no devolvio link de aprobacion');
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    await adminClient
      .from('paypal_subscriptions')
      .upsert({
        user_id: userData.user.id,
        paypal_subscription_id: subscribePayload.id,
        plan_interval: planInterval,
        status: (subscribePayload.status || 'APPROVAL_PENDING').toLowerCase(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'paypal_subscription_id' });

    return jsonResponse({
      approvalUrl: approvalLink.href,
      subscriptionId: subscribePayload.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return jsonResponse({ error: message }, 500);
  }
});
