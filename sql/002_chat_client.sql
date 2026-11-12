-- 002_chat_client.sql
-- Messagerie entre les utilisateurs Mediskip et les pharmacies.
-- Totalement séparée de conversations/messages (chat admin).
-- Script idempotent : peut être réexécuté sans erreur.
-- À exécuter à la main dans l'éditeur SQL de Supabase.

-- Types vérifiés dans le schéma : utilisateur.id et medicaments.id sont bigint.
-- Les fonctions current_utilisateur_id() et est_proprietaire_de_pharmacie(bigint)
-- existantes sont réutilisées sans modification.

-- ============================================================
-- 1. Tables
-- ============================================================

create table if not exists public.discussions (
    id uuid primary key default gen_random_uuid(),
    utilisateur_id bigint not null
        references public.utilisateur(id) on delete cascade,
    pharmacie_id bigint not null
        references public.pharmacies(id) on delete cascade,
    dernier_message_at timestamptz,
    non_lus_client integer not null default 0,
    non_lus_pharmacie integer not null default 0,
    cree_le timestamptz not null default now(),
    unique (utilisateur_id, pharmacie_id)
);

create table if not exists public.discussion_messages (
    id uuid primary key default gen_random_uuid(),
    discussion_id uuid not null
        references public.discussions(id) on delete cascade,
    auteur_role text not null check (auteur_role in ('client', 'pharmacie')),
    contenu text not null check (char_length(contenu) between 1 and 500),
    id_medicament bigint
        references public.medicaments(id) on delete set null,
    cree_le timestamptz not null default now(),
    lu_le timestamptz
);

create index if not exists discussion_messages_discussion_cree_idx
    on public.discussion_messages (discussion_id, cree_le);

-- ============================================================
-- 2. RLS : lecture des discussions, lecture et insertion des messages
-- ============================================================

alter table public.discussions enable row level security;
alter table public.discussion_messages enable row level security;

drop policy if exists discussions_lecture on public.discussions;
create policy discussions_lecture
    on public.discussions
    for select
    to authenticated
    using (
        utilisateur_id = public.current_utilisateur_id()
        or public.est_proprietaire_de_pharmacie(pharmacie_id)
    );

drop policy if exists discussion_messages_lecture on public.discussion_messages;
create policy discussion_messages_lecture
    on public.discussion_messages
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.discussions d
            where d.id = discussion_id
        )
    );

drop policy if exists discussion_messages_insertion on public.discussion_messages;
create policy discussion_messages_insertion
    on public.discussion_messages
    for insert
    to authenticated
    with check (
        exists (
            select 1
            from public.discussions d
            where d.id = discussion_id
        )
    );

-- Aucune politique INSERT/UPDATE/DELETE sur discussions.
-- Aucune politique UPDATE/DELETE sur discussion_messages.

-- ============================================================
-- 3. Auteur imposé par le serveur et limite de messages
-- ============================================================

create or replace function public.discussion_messages_avant_insertion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_utilisateur_id bigint;
    v_pharmacie_id bigint;
    v_current_utilisateur_id bigint;
    v_messages_recents integer;
    v_messages_client_consecutifs integer;
    v_messages_pharmacie_recents integer;
begin
    select d.utilisateur_id, d.pharmacie_id
    into v_utilisateur_id, v_pharmacie_id
    from public.discussions d
    where d.id = new.discussion_id;

    if not found then
        raise exception 'discussion introuvable';
    end if;

    v_current_utilisateur_id := public.current_utilisateur_id();

    if v_current_utilisateur_id is not null
       and v_current_utilisateur_id = v_utilisateur_id then
        -- Sérialise les envois d'un client, y compris les insertions directes.
        perform pg_advisory_xact_lock(hashtext(v_current_utilisateur_id::text));

        select count(*)::integer
        into v_messages_recents
        from public.discussion_messages dm
        join public.discussions d on d.id = dm.discussion_id
        where d.utilisateur_id = v_current_utilisateur_id
          and dm.auteur_role = 'client'
          and dm.cree_le >= now() - interval '1 minute';

        if v_messages_recents >= 10 then
            raise exception 'limite de 10 messages par minute atteinte';
        end if;

        if not exists (
            select 1
            from public.pharmacies p
            where p.id = v_pharmacie_id
              and p.visible is true
              and coalesce(p.statut, '') <> 'suspendu'
        ) then
            raise exception 'pharmacie introuvable ou indisponible';
        end if;

        select count(*)::integer
        into v_messages_client_consecutifs
        from (
            select dm.auteur_role
            from public.discussion_messages dm
            where dm.discussion_id = new.discussion_id
            order by dm.cree_le desc, dm.id desc
            limit 3
        ) derniers_messages
        where derniers_messages.auteur_role = 'client';

        if v_messages_client_consecutifs = 3 then
            raise exception 'Attendez la réponse de la pharmacie';
        end if;

        new.auteur_role := 'client';
    elsif public.est_proprietaire_de_pharmacie(v_pharmacie_id) then
        perform pg_advisory_xact_lock(hashtext(v_pharmacie_id::text));

        select count(*)::integer
        into v_messages_pharmacie_recents
        from public.discussion_messages dm
        join public.discussions d on d.id = dm.discussion_id
        where d.pharmacie_id = v_pharmacie_id
          and dm.auteur_role = 'pharmacie'
          and dm.cree_le >= now() - interval '1 minute';

        if v_messages_pharmacie_recents >= 20 then
            raise exception 'limite de 20 messages par minute atteinte pour la pharmacie';
        end if;

        new.auteur_role := 'pharmacie';
    else
        raise exception 'accès refusé';
    end if;

    new.cree_le := now();
    new.lu_le := null;
    new.contenu := btrim(new.contenu);

    return new;
end;
$$;

drop trigger if exists discussion_messages_avant_insertion
    on public.discussion_messages;
create trigger discussion_messages_avant_insertion
    before insert on public.discussion_messages
    for each row
    execute function public.discussion_messages_avant_insertion();

-- ============================================================
-- 4. Compteurs de non-lus et date du dernier message
-- ============================================================

create or replace function public.discussion_messages_apres_insertion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.discussions
    set dernier_message_at = new.cree_le,
        non_lus_client = non_lus_client
            + case when new.auteur_role = 'pharmacie' then 1 else 0 end,
        non_lus_pharmacie = non_lus_pharmacie
            + case when new.auteur_role = 'client' then 1 else 0 end
    where id = new.discussion_id;

    return null;
end;
$$;

drop trigger if exists discussion_messages_apres_insertion
    on public.discussion_messages;
create trigger discussion_messages_apres_insertion
    after insert on public.discussion_messages
    for each row
    execute function public.discussion_messages_apres_insertion();

-- ============================================================
-- 5. Fonctions appelées par l'application
-- ============================================================

create or replace function public.demander_a_pharmacie(
    p_pharmacie_id bigint,
    p_id_medicament bigint,
    p_contenu text
)
returns public.discussions
language plpgsql
security definer
set search_path = public
as $$
declare
    v_utilisateur_id bigint;
    v_discussion public.discussions;
    v_nouvelles_discussions integer;
begin
    v_utilisateur_id := public.current_utilisateur_id();

    if v_utilisateur_id is null then
        raise exception 'authentification requise';
    end if;

    p_contenu := btrim(p_contenu);
    if p_contenu is null or p_contenu = '' then
        raise exception 'Le message ne peut pas être vide';
    end if;

    if p_id_medicament is not null and not exists (
        select 1
        from public.medicaments m
        where m.id = p_id_medicament
    ) then
        raise exception 'Médicament introuvable';
    end if;

    if not exists (
        select 1
        from public.pharmacies p
        where p.id = p_pharmacie_id
          and p.visible is true
          and coalesce(p.statut, '') <> 'suspendu'
    ) then
        raise exception 'pharmacie introuvable ou indisponible';
    end if;

    -- Sérialise les ouvertures pour éviter de dépasser la limite simultanément.
    perform pg_advisory_xact_lock(hashtext(v_utilisateur_id::text));

    select d.*
    into v_discussion
    from public.discussions d
    where d.utilisateur_id = v_utilisateur_id
      and d.pharmacie_id = p_pharmacie_id;

    if not found then
        select count(*)::integer
        into v_nouvelles_discussions
        from public.discussions d
        where d.utilisateur_id = v_utilisateur_id
          and d.cree_le >= now() - interval '1 hour';

        if v_nouvelles_discussions >= 5 then
            raise exception 'limite de 5 nouvelles discussions par heure atteinte';
        end if;

        insert into public.discussions (utilisateur_id, pharmacie_id)
        values (v_utilisateur_id, p_pharmacie_id)
        on conflict (utilisateur_id, pharmacie_id) do nothing;

        select d.*
        into v_discussion
        from public.discussions d
        where d.utilisateur_id = v_utilisateur_id
          and d.pharmacie_id = p_pharmacie_id;
    end if;

    insert into public.discussion_messages (
        discussion_id,
        auteur_role,
        contenu,
        id_medicament
    )
    values (
        v_discussion.id,
        'client',
        p_contenu,
        p_id_medicament
    );

    select d.*
    into v_discussion
    from public.discussions d
    where d.id = v_discussion.id;

    return v_discussion;
end;
$$;

create or replace function public.marquer_lues_discussion(p_discussion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_utilisateur_id bigint;
    v_pharmacie_id bigint;
    v_role text;
    v_non_lus integer;
begin
    select d.utilisateur_id, d.pharmacie_id
    into v_utilisateur_id, v_pharmacie_id
    from public.discussions d
    where d.id = p_discussion_id;

    if not found then
        raise exception 'discussion introuvable';
    end if;

    if public.current_utilisateur_id() = v_utilisateur_id then
        v_role := 'client';
    elsif public.est_proprietaire_de_pharmacie(v_pharmacie_id) then
        v_role := 'pharmacie';
    else
        raise exception 'accès refusé';
    end if;

    update public.discussion_messages
    set lu_le = now()
    where discussion_id = p_discussion_id
      and auteur_role <> v_role
      and lu_le is null;

    select count(*)::integer
    into v_non_lus
    from public.discussion_messages
    where discussion_id = p_discussion_id
      and lu_le is null
      and auteur_role <> v_role;

    update public.discussions
    set non_lus_client = case
            when v_role = 'client' then v_non_lus
            else non_lus_client
        end,
        non_lus_pharmacie = case
            when v_role = 'pharmacie' then v_non_lus
            else non_lus_pharmacie
        end
    where id = p_discussion_id;
end;
$$;

-- La purge est réservée au rôle serveur Supabase, jamais aux clients connectés.
create or replace function public.purger_discussions(p_jours integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_supprimees integer;
begin
    if coalesce(auth.role(), '') <> 'service_role' then
        raise exception 'accès refusé';
    end if;

    if p_jours is null or p_jours < 1 then
        raise exception 'p_jours doit être supérieur ou égal à 1';
    end if;

    delete from public.discussions d
    where coalesce(d.dernier_message_at, d.cree_le)
        < now() - make_interval(days => p_jours);

    get diagnostics v_supprimees = row_count;
    return v_supprimees;
end;
$$;

-- ============================================================
-- 6. Droits
-- ============================================================

revoke all on table public.discussions from public, anon, authenticated;
grant select on table public.discussions to authenticated;

revoke all on table public.discussion_messages from public, anon, authenticated;
grant select, insert on table public.discussion_messages to authenticated;

revoke all on function public.demander_a_pharmacie(bigint, bigint, text)
    from public, anon;
grant execute on function public.demander_a_pharmacie(bigint, bigint, text)
    to authenticated;

revoke all on function public.marquer_lues_discussion(uuid) from public, anon;
grant execute on function public.marquer_lues_discussion(uuid) to authenticated;

revoke all on function public.purger_discussions(integer)
    from public, anon, authenticated;
grant execute on function public.purger_discussions(integer) to service_role;

revoke all on function public.discussion_messages_avant_insertion()
    from public, anon, authenticated;
revoke all on function public.discussion_messages_apres_insertion()
    from public, anon, authenticated;

-- ============================================================
-- 7. Temps réel
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
          and tablename = 'discussions'
    ) then
        execute 'alter publication supabase_realtime add table public.discussions';
    end if;

    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'discussion_messages'
    ) then
        execute 'alter publication supabase_realtime add table public.discussion_messages';
    end if;
end;
$$;

notify pgrst, 'reload schema';

-- ============================================================
-- Tests manuels (à exécuter séparément dans une transaction annulée).
-- Remplacer les valeurs entre chevrons par des identifiants réels.
-- Les erreurs attendues interrompent la transaction : exécuter chaque
-- scénario séparément puis faire rollback.
-- ============================================================

-- 1) Un client ne lit/écrit pas le chat admin et ne peut pas l'ouvrir.
-- Lecture : les requêtes ne doivent retourner aucune ligne.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_client>","role":"authenticated"}', true);
-- set local role authenticated;
-- select * from public.conversations;
-- select * from public.messages;
-- rollback;
--
-- Écriture dans messages : attendu, erreur RLS « new row violates row-level security policy ».
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_client>","role":"authenticated"}', true);
-- set local role authenticated;
-- insert into public.messages (conversation_id, contenu)
-- values ('<uuid_conversation_admin>', 'test client');
-- rollback;
--
-- Écriture dans conversations : attendu, erreur de privilège (INSERT non accordé).
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_client>","role":"authenticated"}', true);
-- set local role authenticated;
-- insert into public.conversations (pharmacie_id) values (<id_pharmacie>);
-- rollback;
--
-- Ouverture : attendu, erreur « accès refusé ».
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_client>","role":"authenticated"}', true);
-- set local role authenticated;
-- select public.ouvrir_conversation(<id_pharmacie>);
-- rollback;

-- 2) Le superadmin, qui n'est ni utilisateur Mediskip ni propriétaire,
--    ne voit aucune ligne de cette messagerie.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_superadmin>","role":"authenticated","app_metadata":{"role":"superadmin"}}', true);
-- set local role authenticated;
-- select * from public.discussions;
-- -- attendu : 0 ligne
-- select * from public.discussion_messages;
-- -- attendu : 0 ligne
-- rollback;

-- 3) Un client ne voit pas la discussion d'un autre client.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_client_A>","role":"authenticated"}', true);
-- set local role authenticated;
-- select * from public.discussions;
-- -- attendu : uniquement les discussions de A
-- select * from public.discussion_messages
--  where discussion_id = '<uuid_discussion_B>';
-- -- attendu : 0 ligne
-- rollback;

-- 4) Une pharmacie ne voit que ses discussions et ne peut pas en ouvrir.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_proprietaire_A>","role":"authenticated"}', true);
-- set local role authenticated;
-- select * from public.discussions;
-- -- attendu : uniquement les discussions de la pharmacie A
-- select * from public.discussions
--  where id = '<uuid_discussion_pharmacie_B>';
-- -- attendu : 0 ligne
-- rollback;
--
-- Une pharmacie ne peut pas créer de discussion directement : attendu,
-- erreur de privilège (aucune permission INSERT sur discussions).
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_proprietaire_A>","role":"authenticated"}', true);
-- set local role authenticated;
-- insert into public.discussions (utilisateur_id, pharmacie_id)
-- values (<id_utilisateur>, <id_pharmacie_A>);
-- rollback;

-- 5) Un compte anonyme n'accède pas aux tables et ne peut pas appeler le RPC.
-- begin;
-- set local role anon;
-- select * from public.discussions;
-- -- attendu : erreur de privilège (aucun droit sur la table)
-- rollback;
--
-- begin;
-- set local role anon;
-- select public.demander_a_pharmacie(<id_pharmacie_visible>, null, 'test');
-- -- attendu : erreur de privilège (aucun droit d'exécution)
-- rollback;

-- 6) Le rôle choisi est ignoré et un client ne peut pas écrire dans
--    la discussion d'un autre client.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_client_A>","role":"authenticated"}', true);
-- set local role authenticated;
-- insert into public.discussion_messages (discussion_id, auteur_role, contenu)
-- values ('<uuid_discussion_A>', 'pharmacie', 'test')
-- returning auteur_role;
-- -- attendu : auteur_role = 'client'
-- rollback;
--
-- Écriture dans une discussion de B : attendu, erreur RLS.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_client_A>","role":"authenticated"}', true);
-- set local role authenticated;
-- insert into public.discussion_messages (discussion_id, auteur_role, contenu)
-- values ('<uuid_discussion_B>', 'client', 'test');
-- rollback;

-- 7) Le 6e nouvel échange en une heure est refusé.
-- Utiliser six pharmacies visibles distinctes et un client sans discussion
-- récente avec celles-ci. La transaction annulée ne conserve pas les tests.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_client>","role":"authenticated"}', true);
-- set local role authenticated;
-- select public.demander_a_pharmacie(<id_pharmacie_1>, null, 'test 1');
-- select public.demander_a_pharmacie(<id_pharmacie_2>, null, 'test 2');
-- select public.demander_a_pharmacie(<id_pharmacie_3>, null, 'test 3');
-- select public.demander_a_pharmacie(<id_pharmacie_4>, null, 'test 4');
-- select public.demander_a_pharmacie(<id_pharmacie_5>, null, 'test 5');
-- select public.demander_a_pharmacie(<id_pharmacie_6>, null, 'test 6');
-- -- attendu sur le 6e appel : erreur « limite de 5 nouvelles discussions par heure atteinte »
-- rollback;

-- 8a) Un JWT authentifié sans ligne utilisateur est refusé par le RPC et
--     ne voit aucune discussion.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_sans_utilisateur>","role":"authenticated"}', true);
-- set local role authenticated;
-- select * from public.discussions;
-- -- attendu : 0 ligne
-- rollback;
--
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_sans_utilisateur>","role":"authenticated"}', true);
-- set local role authenticated;
-- select public.demander_a_pharmacie(<id_pharmacie_visible>, null, 'test');
-- -- attendu : erreur « authentification requise »
-- rollback;

-- 8b) Un message composé de cinq espaces est refusé après btrim.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_client>","role":"authenticated"}', true);
-- set local role authenticated;
-- insert into public.discussion_messages (discussion_id, auteur_role, contenu)
-- values ('<uuid_discussion_client>', 'client', '     ');
-- -- attendu : erreur de contrainte sur contenu (longueur minimale de 1)
-- rollback;

-- 8c) Le 4e message client consécutif sans réponse de la pharmacie est refusé.
-- begin;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_client>","role":"authenticated"}', true);
-- set local role authenticated;
-- insert into public.discussion_messages (discussion_id, auteur_role, contenu)
-- values ('<uuid_discussion_client>', 'client', 'message 1');
-- insert into public.discussion_messages (discussion_id, auteur_role, contenu)
-- values ('<uuid_discussion_client>', 'client', 'message 2');
-- insert into public.discussion_messages (discussion_id, auteur_role, contenu)
-- values ('<uuid_discussion_client>', 'client', 'message 3');
-- insert into public.discussion_messages (discussion_id, auteur_role, contenu)
-- values ('<uuid_discussion_client>', 'client', 'message 4');
-- -- attendu sur le 4e insert : « Attendez la réponse de la pharmacie »
-- rollback;

-- 8d) Un client ne peut plus écrire si sa pharmacie n'est plus visible.
-- À lancer avec un rôle de test autorisé à modifier pharmacies.
-- begin;
-- update public.pharmacies
-- set visible = false
-- where id = <id_pharmacie_discussion>;
-- select set_config('request.jwt.claims',
--     '{"sub":"<uuid_client>","role":"authenticated"}', true);
-- set local role authenticated;
-- insert into public.discussion_messages (discussion_id, auteur_role, contenu)
-- values ('<uuid_discussion_client>', 'client', 'test');
-- -- attendu : erreur « pharmacie introuvable ou indisponible »
-- rollback;
