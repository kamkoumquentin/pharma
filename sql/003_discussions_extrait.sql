-- 003_discussions_extrait.sql
-- Ajoute l'extrait et le rôle du dernier message aux discussions.
-- Script idempotent : peut être réexécuté sans erreur.
-- À exécuter à la main dans l'éditeur SQL de Supabase.

-- ============================================================
-- 1. Extrait et rôle du dernier message
-- ============================================================

alter table public.discussions
    add column if not exists dernier_extrait text;

alter table public.discussions
    add column if not exists dernier_auteur_role text
        check (dernier_auteur_role in ('client', 'pharmacie'));

-- ============================================================
-- 2. Mise à jour après insertion d'un message
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
        dernier_extrait = left(new.contenu, 80),
        dernier_auteur_role = new.auteur_role,
        non_lus_client = non_lus_client
            + case when new.auteur_role = 'pharmacie' then 1 else 0 end,
        non_lus_pharmacie = non_lus_pharmacie
            + case when new.auteur_role = 'client' then 1 else 0 end
    where id = new.discussion_id;

    return null;
end;
$$;

-- ============================================================
-- 3. Rattrapage des discussions existantes
-- ============================================================

update public.discussions d
set dernier_extrait = dernier_message.contenu,
    dernier_auteur_role = dernier_message.auteur_role
from (
    select distinct on (dm.discussion_id)
        dm.discussion_id,
        left(dm.contenu, 80) as contenu,
        dm.auteur_role
    from public.discussion_messages dm
    order by dm.discussion_id, dm.cree_le desc, dm.id desc
) dernier_message
where d.id = dernier_message.discussion_id;

-- ============================================================
-- 4. Index de tri des discussions
-- ============================================================

create index if not exists discussions_pharmacie_dernier_message_idx
    on public.discussions (pharmacie_id, dernier_message_at desc);

create index if not exists discussions_utilisateur_dernier_message_idx
    on public.discussions (utilisateur_id, dernier_message_at desc);

-- ============================================================
-- 5. Tests manuels (à lancer avec un rôle autorisé)
-- ============================================================

-- 1) Après l'envoi d'un message, la discussion contient son extrait
--    et le rôle de son auteur.
-- begin;
-- insert into public.discussion_messages (discussion_id, auteur_role, contenu)
-- values ('<uuid_discussion>', 'client', 'Bonjour, ce message est un test.')
-- returning discussion_id;
-- select dernier_extrait, dernier_auteur_role
-- from public.discussions
-- where id = '<uuid_discussion>';
-- -- attendu : extrait = « Bonjour, ce message est un test. »,
-- --           dernier_auteur_role = 'client'
-- rollback;
--
-- 2) Un message de 300 caractères donne un extrait de 80 caractères.
-- begin;
-- insert into public.discussion_messages (discussion_id, auteur_role, contenu)
-- values ('<uuid_discussion>', 'pharmacie', repeat('x', 300))
-- returning discussion_id;
-- select char_length(dernier_extrait) as longueur_extrait,
--        dernier_auteur_role
-- from public.discussions
-- where id = '<uuid_discussion>';
-- -- attendu : longueur_extrait = 80, dernier_auteur_role = 'pharmacie'
-- rollback;
