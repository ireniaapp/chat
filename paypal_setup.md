# PayPal + Supabase (mensual y anual)

## 1) Variables en Supabase Edge Functions

Configura estas variables en tu proyecto Supabase:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_SECRET`
- `PAYPAL_ENV` (`sandbox` o `live`)
- `PAYPAL_PLAN_MONTHLY_ID`
- `PAYPAL_PLAN_YEARLY_ID`
- `PAYPAL_WEBHOOK_ID`
- `APP_BASE_URL` (ejemplo: `https://irenia.app`)

## 2) SQL

Ejecuta completo `supabase_tokens.sql` para crear la tabla `paypal_subscriptions` y sus politicas.

## 3) Deploy de funciones

Desde este repo:

```bash
supabase functions deploy create-paypal-subscription
supabase functions deploy paypal-webhook
```

## 4) Webhook en PayPal

Crea un webhook en PayPal apuntando a:

`https://<project-ref>.supabase.co/functions/v1/paypal-webhook`

Eventos recomendados:

- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.UPDATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`

Guarda el `Webhook ID` en `PAYPAL_WEBHOOK_ID`.

## 5) Frontend

La app ya incluye botones en Ajustes:

- `Plan mensual`
- `Plan anual`

Al hacer click, llama a la funcion `create-paypal-subscription` y redirige al checkout de PayPal.