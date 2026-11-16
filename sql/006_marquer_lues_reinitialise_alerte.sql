-- sql/006_marquer_lues_reinitialise_alerte.sql
-- Étend marquer_lues_discussion pour effacer l'alerte de modification
-- du côté de l'appelant, en même temps que la remise à zéro du compteur non lu.

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
        end,
        -- on efface l'alerte de modification uniquement du côté de l'appelant :
        -- ouvrir/consulter la discussion vaut acquittement de ce qu'il vient de voir.
        alerte_modification_client = case
            when v_role = 'client' then false
            else alerte_modification_client
        end,
        alerte_modification_pharmacie = case
            when v_role = 'pharmacie' then false
            else alerte_modification_pharmacie
        end
    where id = p_discussion_id;
end;
$$;
