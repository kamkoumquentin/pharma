-- sql/005_alerte_modification_messages.sql
-- Signale quand un message déjà lu par son destinataire est ensuite modifié
-- ou supprimé, pour un domaine sensible (santé) où l'info a pu être utilisée
-- avant d'être corrigée.

alter table public.discussions
  add column if not exists alerte_modification_client boolean not null default false,
  add column if not exists alerte_modification_pharmacie boolean not null default false;

create or replace function public.discussion_messages_apres_modification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contenu_modifie boolean;
  v_deja_lu boolean;
  v_est_dernier boolean;
begin
  v_contenu_modifie := (new.contenu is distinct from old.contenu)
                     or (new.supprime_le is distinct from old.supprime_le);

  if not v_contenu_modifie then
    return null; -- rien à faire (ex: simple marquage lu_le)
  end if;

  v_deja_lu := old.lu_le is not null;

  select (dernier_message_at = new.cree_le) into v_est_dernier
  from public.discussions where id = new.discussion_id;

  update public.discussions
  set dernier_extrait = case
        when v_est_dernier and new.supprime_le is not null then 'Message supprimé'
        when v_est_dernier then left(new.contenu, 80)
        else dernier_extrait
      end,
      dernier_auteur_role = case when v_est_dernier then new.auteur_role else dernier_auteur_role end,
      -- l'auteur de l'édition n'alerte PAS lui-même : seul l'autre côté est prévenu,
      -- et seulement si ce message avait déjà été lu avant d'être changé.
      alerte_modification_client = case
        when new.auteur_role = 'pharmacie' and v_deja_lu then true
        else alerte_modification_client
      end,
      alerte_modification_pharmacie = case
        when new.auteur_role = 'client' and v_deja_lu then true
        else alerte_modification_pharmacie
      end
  where id = new.discussion_id;

  return null;
end;
$$;

drop trigger if exists discussion_messages_apres_modification
    on public.discussion_messages;
create trigger discussion_messages_apres_modification
    after update on public.discussion_messages
    for each row
    execute function public.discussion_messages_apres_modification();
