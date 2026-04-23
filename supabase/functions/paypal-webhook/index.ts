import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, paypal-auth-algo, paypal-cert-url, paypal-transmission-id, paypal-transmission-sig, paypal-transmission-time'
};

function response(body: Record<string, unknown>, status = 200) {
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
  const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(tokenPayload?.error_description || tokenPayload?.error || 'No se pudo autenticar webhook PayPal');
  }

  return tokenPayload.access_token as string;
}

async function verifyWebhookSignature(params: {
  baseUrl: string;
  accessToken: string;
  webhookId: string;
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
  eventBody: unknown;
}) {
  const verifyResponse = await fetch(`${params.baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      transmission_id: params.transmissionId,
      transmission_time: params.transmissionTime,
      cert_url: params.certUrl,
      auth_algo: params.authAlgo,
      transmission_sig: params.transmissionSig,
      webhook_id: params.webhookId,
      webhook_event: params.eventBody
    })
  });

  const verifyPayload = await verifyResponse.json();
  if (!verifyResponse.ok) {
    throw new Error(verifyPayload?.message || 'No se pudo verificar firma webhook');
  }

  return verifyPayload?.verification_status === 'SUCCESS';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const paypalClientId = Deno.env.get('PAYPAL_CLIENT_ID');
    const paypalSecret = Deno.env.get('PAYPAL_SECRET');
    const paypalWebhookId = Deno.env.get('PAYPAL_WEBHOOK_ID');
    const paypalEnvironment = (Deno.env.get('PAYPAL_ENV') || 'sandbox').toLowerCase();

    if (!supabaseUrl || !serviceRoleKey || !paypalClientId || !paypalSecret || !paypalWebhookId) {
      throw new Error('Faltan variables de entorno para webhook PayPal');
    }

    const eventBody = await req.json();
    const transmissionId = req.headers.get('paypal-transmission-id') || '';
    const transmissionTime = req.headers.get('paypal-transmission-time') || '';
    const certUrl = req.headers.get('paypal-cert-url') || '';
    const authAlgo = req.headers.get('paypal-auth-algo') || '';
    const transmissionSig = req.headers.get('paypal-transmission-sig') || '';

    if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
      return response({ error: 'Headers PayPal incompletos' }, 400);
    }

    const baseUrl = paypalEnvironment === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    const accessToken = await getPayPalAccessToken(baseUrl, paypalClientId, paypalSecret);
    const isValidSignature = await verifyWebhookSignature({
      baseUrl,
      accessToken,
      webhookId: paypalWebhookId,
      transmissionId,
      transmissionTime,
      certUrl,
      authAlgo,
      transmissionSig,
      eventBody
    });

    if (!isValidSignature) {
      return response({ error: 'Firma webhook invalida' }, 401);
    }

    const subscriptionId = eventBody?.resource?.id as string | undefined;
    if (!subscriptionId) {
      return response({ ok: true, skipped: 'Evento sin subscription id' });
    }

    const eventType = (eventBody?.event_type || '').toString();
    let status = 'pending';

    if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') status = 'active';
    else if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') status = 'cancelled';
    else if (eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') status = 'suspended';
    else if (eventType === 'BILLING.SUBSCRIPTION.EXPIRED') status = 'expired';
    else if (eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') status = 'past_due';
    else if (eventType === 'BILLING.SUBSCRIPTION.UPDATED') {
      status = (eventBody?.resource?.status || 'updated').toString().toLowerCase();
    }

    const planMonthlyId = Deno.env.get('PAYPAL_PLAN_MONTHLY_ID') || '';
    const planYearlyId = Deno.env.get('PAYPAL_PLAN_YEARLY_ID') || '';
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const planId = (eventBody?.resource?.plan_id || '').toString();
    const periodEnd = (eventBody?.resource?.billing_info?.next_billing_time || null) as string | null;
    const payerId = (eventBody?.resource?.subscriber?.payer_id || '').toString();
    const customId = (eventBody?.resource?.custom_id || '').toString();
    const planInterval = planId === planYearlyId ? 'yearly' : 'monthly';

    await adminClient
      .from('paypal_subscriptions')
      .upsert({
        paypal_subscription_id: subscriptionId,
        user_id: customId || null,
        paypal_plan_id: planId || null,
        paypal_payer_id: payerId || null,
        plan_interval: planInterval,
        status,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString()
      }, { onConflict: 'paypal_subscription_id' });

    return response({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return response({ error: message }, 500);
  }
});
