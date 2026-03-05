-- Step 3: Stripe webhook apply function (idempotent)
-- Run AFTER step2-subscription-rls.sql
-- Purpose:
-- - Add event dedup key
-- - Add safe apply RPC for webhook worker (service_role only)

begin;

alter table public.billing_subscription_events
  add column if not exists provider_event_id text;

create unique index if not exists uq_billing_subscription_events_provider_event
  on public.billing_subscription_events(provider, provider_event_id)
  where provider_event_id is not null;

create unique index if not exists uq_billing_subscriptions_stripe_customer
  on public.billing_subscriptions(stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists uq_billing_subscriptions_stripe_subscription
  on public.billing_subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

create or replace function public.apply_subscription_webhook(
  p_user_id uuid,
  p_plan_code text,
  p_status text,
  p_trial_ends_at timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_event_type text,
  p_provider_event_id text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_status not in (
    'inactive',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'incomplete',
    'unpaid'
  ) then
    raise exception 'invalid status: %', p_status;
  end if;

  insert into public.billing_subscriptions (
    user_id,
    plan_code,
    status,
    trial_ends_at,
    current_period_end,
    cancel_at_period_end,
    stripe_customer_id,
    stripe_subscription_id,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    coalesce(nullif(p_plan_code, ''), 'starter_monthly'),
    p_status,
    p_trial_ends_at,
    p_current_period_end,
    coalesce(p_cancel_at_period_end, false),
    nullif(p_stripe_customer_id, ''),
    nullif(p_stripe_subscription_id, ''),
    now(),
    now()
  )
  on conflict (user_id) do update
  set
    plan_code = excluded.plan_code,
    status = excluded.status,
    trial_ends_at = excluded.trial_ends_at,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    updated_at = now();

  insert into public.billing_subscription_events (
    user_id,
    provider,
    provider_event_id,
    event_type,
    payload,
    created_at
  )
  values (
    p_user_id,
    'stripe',
    nullif(p_provider_event_id, ''),
    coalesce(nullif(p_event_type, ''), 'unknown'),
    coalesce(p_payload, '{}'::jsonb),
    now()
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.apply_subscription_webhook(
  uuid, text, text, timestamptz, timestamptz, boolean, text, text, text, text, jsonb
) from public;

revoke all on function public.apply_subscription_webhook(
  uuid, text, text, timestamptz, timestamptz, boolean, text, text, text, text, jsonb
) from anon, authenticated;

grant execute on function public.apply_subscription_webhook(
  uuid, text, text, timestamptz, timestamptz, boolean, text, text, text, text, jsonb
) to service_role;

comment on function public.apply_subscription_webhook(
  uuid, text, text, timestamptz, timestamptz, boolean, text, text, text, text, jsonb
)
is 'Applies Stripe webhook state to billing_subscriptions and logs billing_subscription_events.';

commit;
