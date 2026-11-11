-- 001_chat.sql
-- Messagerie entre le superadmin et les propriétaires de pharmacies.
-- Script idempotent : peut être réexécuté sans erreur.
-- À exécuter à la main dans l'éditeur SQL de Supabase.

-- ============================================================
-- 1. Tables
-- ============================================================

create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    pharmacie_id bigint not null unique
        references public.pharmacies(id) on delete cascade,
    dernier_message_at timestamptz,
    non_lus_admin integer not null default 0,
    non_lus_pharmacie integer not null default 0,
    cree_le timestamptz not null default now()
);

create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null
        references public.conversations(id) on delete cascade,
    auteur_id uuid not null,
    auteur_role text not null check (auteur_role in ('admin', 'pharmacie')),
    contenu text not null check (char_length(contenu) between 1 and 2000),
    piece_jointe_path text,
    cree_le timestamptz not null default now(),
    lu_le timestamptz
);

create index if not exists messages_conversation_cree_idx
    on public.messages (conversation_id, cree_le);

-- ============================================================
-- 2. Contrôle d'accès commun
--    Fonctions security definer : elles lisent pharmacies sans
--    dépendre des politiques RLS de cette table.
-- ============================================================

create or replace function public.acces_pharmacie(p_pharmacie_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_superadmin()
        or exists (
            select 1
            from public.pharmacies p
            where p.id = p_pharmacie_id
              and p.owner_id = auth.uid()
        );
$$;

create or replace function public.acces_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_superadmin()
        or exists (
            select 1
            from public.conversations c
            join public.pharmacies p on p.id = c.pharmacie_id
            where c.id = p_conversation_id
              and p.owner_id = auth.uid()
        );
$$;

-- ============================================================
-- 3. RLS : lecture des conversations, lecture et insertion des messages
-- ============================================================

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists conversations_lecture on public.conversations;
create policy conversations_lecture
    on public.conversations
    for select
    to authenticated
    using (public.acces_pharmacie(pharmacie_id));

-- La création d'une conversation passe uniquement par ouvrir_conversation().
drop policy if exists conversations_insertion on public.conversations;

drop policy if exists messages_lecture on public.messages;
create policy messages_lecture
    on public.messages
    for select
    to authenticated
    using (public.acces_conversation(conversation_id));

drop policy if exists messages_insertion on public.messages;
create policy messages_insertion
    on public.messages
    for insert
    to authenticated
    with check (public.acces_conversation(conversation_id));

-- Aucune politique UPDATE ou DELETE : les messages sont immuables
-- pour les clients. Les compteurs passent par les fonctions definer.

-- ============================================================
-- 4. Auteur imposé par le serveur
-- ============================================================

create or replace function public.messages_avant_insertion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.auteur_id := auth.uid();

    if new.auteur_id is null then
        raise exception 'authentification requise';
    end if;

    new.auteur_role := case
        when public.is_superadmin() then 'admin'
        else 'pharmacie'
    end;

    -- Horodatage serveur : le client ne peut ni antidater ni marquer lu.
    new.cree_le := now();
    new.lu_le := null;

    -- Champ verrouillé jusqu'à la gestion des pièces jointes.
    new.piece_jointe_path := null;

    return new;
end;
$$;

drop trigger if exists messages_avant_insertion on public.messages;
create trigger messages_avant_insertion
    before insert on public.messages
    for each row
    execute function public.messages_avant_insertion();

-- ============================================================
-- 5. Compteurs de non-lus et date du dernier message
-- ============================================================

create or replace function public.messages_apres_insertion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.conversations
    set dernier_message_at = new.cree_le,
        non_lus_admin = non_lus_admin
            + case when new.auteur_role = 'pharmacie' then 1 else 0 end,
        non_lus_pharmacie = non_lus_pharmacie
            + case when new.auteur_role = 'admin' then 1 else 0 end
    where id = new.conversation_id;

    return null;
end;
$$;

drop trigger if exists messages_apres_insertion on public.messages;
create trigger messages_apres_insertion
    after insert on public.messages
    for each row
    execute function public.messages_apres_insertion();

-- ============================================================
-- 6. Fonctions appelées par l'application
-- ============================================================

drop function if exists public.ouvrir_conversation(bigint);

create function public.ouvrir_conversation(p_pharmacie_id bigint)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
    v_conversation public.conversations;
begin
    if not public.acces_pharmacie(p_pharmacie_id) then
        raise exception 'accès refusé';
    end if;

    insert into public.conversations (pharmacie_id)
    values (p_pharmacie_id)
    on conflict (pharmacie_id) do nothing;

    select *
    into v_conversation
    from public.conversations
    where pharmacie_id = p_pharmacie_id;

    if v_conversation.id is null then
        raise exception 'conversation introuvable';
    end if;

    return v_conversation;
end;
$$;

drop function if exists public.marquer_lues(uuid);

create function public.marquer_lues(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text;
    v_non_lus integer;
begin
    if not public.acces_conversation(p_conversation_id) then
        raise exception 'accès refusé';
    end if;

    v_role := case
        when public.is_superadmin() then 'admin'
        else 'pharmacie'
    end;

    update public.messages
    set lu_le = now()
    where conversation_id = p_conversation_id
      and auteur_role <> v_role
      and lu_le is null;

    select count(*)::integer
    into v_non_lus
    from public.messages
    where conversation_id = p_conversation_id
      and lu_le is null
      and auteur_role <> v_role;

    update public.conversations
    set non_lus_admin = case when v_role = 'admin' then v_non_lus else non_lus_admin end,
        non_lus_pharmacie = case when v_role = 'pharmacie' then v_non_lus else non_lus_pharmacie end
    where id = p_conversation_id;
end;
$$;

-- ============================================================
-- 7. Droits
-- ============================================================

revoke all on table public.conversations from anon, authenticated;
grant select on table public.conversations to authenticated;

revoke all on table public.messages from anon, authenticated;
grant select, insert on table public.messages to authenticated;

revoke all on function public.acces_pharmacie(bigint) from public, anon;
grant execute on function public.acces_pharmacie(bigint) to authenticated;

revoke all on function public.acces_conversation(uuid) from public, anon;
grant execute on function public.acces_conversation(uuid) to authenticated;

revoke all on function public.ouvrir_conversation(bigint) from public, anon;
grant execute on function public.ouvrir_conversation(bigint) to authenticated;

revoke all on function public.marquer_lues(uuid) from public, anon;
grant execute on function public.marquer_lues(uuid) to authenticated;

revoke all on function public.messages_avant_insertion() from public, anon, authenticated;
revoke all on function public.messages_apres_insertion() from public, anon, authenticated;

-- ============================================================
-- 8. Temps réel
-- ============================================================

do $$
begin
    if not exists (
        select 1 from pg_publication where pubname = 'supabase_realtime'
    ) then
        raise exception 'publication supabase_realtime introuvable';
    end if;

    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'conversations'
    ) then
        execute 'alter publication supabase_realtime add table public.conversations';
    end if;

    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'messages'
    ) then
        execute 'alter publication supabase_realtime add table public.messages';
    end if;
end;
$$;

notify pgrst, 'reload schema';

-- ============================================================
-- Tests manuels (à exécuter dans une transaction annulée).
-- Remplacer les valeurs entre chevrons par des identifiants réels.
-- ============================================================

-- 1) Le propriétaire A ne voit que sa propre conversation.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_proprietaire_A>","role":"authenticated"}', true);
-- set local role authenticated;
-- select id, pharmacie_id from public.conversations;
-- -- attendu : une seule ligne, celle de la pharmacie de A
-- select * from public.messages
--  where conversation_id = '<uuid_conversation_B>';
-- -- attendu : 0 ligne
-- rollback;

-- 2) Le propriétaire B ne voit pas la conversation de A.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_proprietaire_B>","role":"authenticated"}', true);
-- set local role authenticated;
-- select id, pharmacie_id from public.conversations;
-- -- attendu : une seule ligne, celle de la pharmacie de B
-- select * from public.messages
--  where conversation_id = '<uuid_conversation_A>';
-- -- attendu : 0 ligne
-- rollback;

-- 3) L'auteur est imposé par le serveur, même si le client ment.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_proprietaire_A>","role":"authenticated"}', true);
-- set local role authenticated;
-- insert into public.messages (conversation_id, auteur_id, auteur_role, contenu)
-- values ('<uuid_conversation_A>', '<uuid_proprietaire_B>', 'admin', 'test');
-- select auteur_id, auteur_role from public.messages
--  where conversation_id = '<uuid_conversation_A>'
--  order by cree_le desc limit 1;
-- -- attendu : auteur_id = propriétaire A, auteur_role = 'pharmacie'
-- rollback;

-- 4) Les messages ne peuvent être ni modifiés ni supprimés par le client.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_proprietaire_A>","role":"authenticated"}', true);
-- set local role authenticated;
-- update public.messages set contenu = 'modifié'
--  where conversation_id = '<uuid_conversation_A>';
-- -- attendu : erreur de privilège (UPDATE non accordé)
-- delete from public.messages
--  where conversation_id = '<uuid_conversation_A>';
-- -- attendu : erreur de privilège (DELETE non accordé)
-- rollback;

-- 5) Ouvrir la conversation d'une autre pharmacie est refusé.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_proprietaire_A>","role":"authenticated"}', true);
-- set local role authenticated;
-- select public.ouvrir_conversation(<id_pharmacie_B>);
-- -- attendu : erreur « accès refusé »
-- rollback;

-- 6) Un visiteur non authentifié ne voit rien.
-- begin;
-- set local role anon;
-- select * from public.conversations;
-- -- attendu : erreur de privilège (aucun droit sur la table)
-- rollback;

-- 7) Un superadmin répond : rôle admin et compteur pharmacie incrémenté.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_admin>","role":"authenticated","app_metadata":{"role":"superadmin"}}', true);
-- set local role authenticated;
-- select non_lus_pharmacie from public.conversations
--  where id = '<uuid_conversation_A>';
-- insert into public.messages (conversation_id, contenu)
-- values ('<uuid_conversation_A>', 'réponse du superadmin');
-- select auteur_role from public.messages
--  where conversation_id = '<uuid_conversation_A>'
--  order by cree_le desc limit 1;
-- -- attendu : 'admin'
-- select non_lus_pharmacie from public.conversations
--  where id = '<uuid_conversation_A>';
-- -- attendu : valeur précédente + 1
-- rollback;

-- 8) marquer_lues par la pharmacie remet son compteur à 0 et date les messages admin.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_admin>","role":"authenticated","app_metadata":{"role":"superadmin"}}', true);
-- set local role authenticated;
-- insert into public.messages (conversation_id, contenu)
-- values ('<uuid_conversation_A>', 'message admin à lire');
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_proprietaire_A>","role":"authenticated"}', true);
-- select non_lus_pharmacie from public.conversations
--  where id = '<uuid_conversation_A>';
-- -- attendu : valeur précédente + 1
-- select public.marquer_lues('<uuid_conversation_A>');
-- select non_lus_pharmacie from public.conversations
--  where id = '<uuid_conversation_A>';
-- -- attendu : 0
-- select count(*) from public.messages
--  where conversation_id = '<uuid_conversation_A>'
--    and auteur_role = 'admin'
--    and lu_le is null;
-- -- attendu : 0
-- rollback;

-- Aucun déclencheur d'audit n'est attaché à public.messages :
-- le contenu des conversations ne doit pas être recopié dans audit_log.
