-- Tabla de saldos por usuario
create table if not exists public.user_credits (
    user_id uuid primary key references auth.users(id) on delete cascade,
    balance integer not null default 100,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.user_credits enable row level security;

-- Cada usuario solo puede ver su propio saldo
drop policy if exists "Users can read their own credits" on public.user_credits;
create policy "Users can read their own credits"
    on public.user_credits
    for select
    using (auth.uid() = user_id);

-- Cada usuario solo puede crear o actualizar su propio saldo
drop policy if exists "Users can insert their own credits" on public.user_credits;
create policy "Users can insert their own credits"
    on public.user_credits
    for insert
    with check (auth.uid() = user_id);

drop policy if exists "Users can update their own credits" on public.user_credits;
create policy "Users can update their own credits"
    on public.user_credits
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Crear saldo inicial al registrarse
create or replace function public.handle_new_user_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.user_credits (user_id, balance)
    values (new.id, 100)
    on conflict (user_id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user_credits();

-- Descuento atomico de tokens por turno
create or replace function public.consume_credits(p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    current_balance integer;
begin
    if p_amount is null or p_amount <= 0 then
        raise exception 'Invalid amount';
    end if;

    update public.user_credits
    set balance = balance - p_amount,
        updated_at = now()
    where user_id = auth.uid()
      and balance >= p_amount
    returning balance into current_balance;

    if not found then
        raise exception 'Insufficient credits';
    end if;

    return current_balance is not null;
end;
$$;

revoke all on function public.consume_credits(integer) from public;
grant execute on function public.consume_credits(integer) to authenticated;
