-- Esquema limpio para la app de Irenia.
-- Ejecuta solo este archivo en Supabase.

-- ------------------------------------------------------------
-- Saldo por usuario
-- ------------------------------------------------------------
create table if not exists public.user_credits (
    user_id uuid primary key references auth.users(id) on delete cascade,
    balance integer not null default 2,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.user_credits enable row level security;

drop policy if exists "Users can read their own credits" on public.user_credits;
create policy "Users can read their own credits"
    on public.user_credits
    for select
    using (auth.uid() = user_id);

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

create or replace function public.handle_new_user_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.user_credits (user_id, balance)
    values (new.id, 2)
    on conflict (user_id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user_credits();

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

-- ------------------------------------------------------------
-- Conversaciones
-- ------------------------------------------------------------
create table if not exists public.conversations (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null default 'Nuevo chat',
    messages jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists conversations_user_id_updated_at_idx
    on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

drop policy if exists "Users can read their own conversations" on public.conversations;
create policy "Users can read their own conversations"
    on public.conversations
    for select
    using (auth.uid() = user_id);

drop policy if exists "Users can insert their own conversations" on public.conversations;
create policy "Users can insert their own conversations"
    on public.conversations
    for insert
    with check (auth.uid() = user_id);

drop policy if exists "Users can update their own conversations" on public.conversations;
create policy "Users can update their own conversations"
    on public.conversations
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own conversations" on public.conversations;
create policy "Users can delete their own conversations"
    on public.conversations
    for delete
    using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Nota
-- ------------------------------------------------------------
-- No uses una tabla public.users con este proyecto.
-- Si más adelante quieres guardar perfil, crea public.profiles separado de auth.users.
