-- sql/004_corriger_apercu_discussions.sql
-- Redéfinit discussion_messages_apres_insertion() comme SEULE version valable
-- (celle qui était dans 002 était incomplète et ne doit plus jamais la remplacer),
-- et ajoute la mise à jour de l'aperçu lors d'une modification ou suppression
-- du DERNIER message d'une discussion.

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

create or replace function public.discussion_messages_apres_modification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Ne touche l'aperçu que si le message modifié est bien le DERNIER
    -- message de sa discussion (comparaison par sa date de création,
    -- verrouillée et donc fiable comme identifiant du "dernier message").
    update public.discussions
    set dernier_extrait = case
            when new.supprime_le is not null then 'Message supprimé'
            else left(new.contenu, 80)
        end,
        dernier_auteur_role = new.auteur_role
    where id = new.discussion_id
      and dernier_message_at = new.cree_le;

    return null;
end;
$$;

drop trigger if exists discussion_messages_apres_modification
    on public.discussion_messages;
create trigger discussion_messages_apres_modification
    after update on public.discussion_messages
    for each row
    execute function public.discussion_messages_apres_modification();
