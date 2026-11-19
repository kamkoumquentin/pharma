-- sql/008_nettoyer_medicaments_orphelins.sql
-- Supprime automatiquement un médicament du catalogue partagé lorsqu'il n'est
-- plus utilisé par aucune offre ni aucune autre table (suivis, consultations,
-- messages de discussion, notifications, ou toute autre FK vers medicaments).
-- Script idempotent, à exécuter à la main dans l'éditeur SQL de Supabase.
-- Aucun nettoyage rétroactif automatique : la requête SELECT en fin de script
-- permet de vérifier manuellement les médicaments actuellement orphelins.

-- ============================================================
-- 1. Fonction de suppression conditionnelle
-- ============================================================

create or replace function public.supprimer_medicament_si_orphelin(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_fk record;
    v_est_reference boolean;
begin
    if p_id is null then
        return;
    end if;

    -- Verrouiller la ligne pour éviter qu'une offre ou un suivi soit créé
    -- en parallèle pendant la vérification.
    perform 1
    from public.medicaments m
    where m.id = p_id
    for update;

    if not found then
        return;
    end if;

    -- Contrôles explicites sur les tables connues du schéma.
    if exists (
        select 1
        from public.offres o
        where o.id_medicament = p_id
    ) then
        return;
    end if;

    if exists (
        select 1
        from public.abonnements_medicament a
        where a.id_medicament = p_id
          and a.id_pharmacie is null
          and a.actif = true
    ) then
        return;
    end if;

    if exists (
        select 1
        from public.discussion_messages dm
        where dm.id_medicament = p_id
    ) then
        return;
    end if;

    -- Contrôle dynamique de toutes les autres clés étrangères pointant vers
    -- public.medicaments(id) (consultations, notifications, et toute autre
    -- table du schéma), quel que soit le nom de la colonne référençante.
    -- abonnements_medicament est exclu ici car seules les alertes globales
    -- actives (id_pharmacie is null et actif = true) bloquent la suppression.
    for v_fk in
        select
            n.nspname as schema_name,
            c.relname as table_name,
            a.attname as column_name
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a
            on a.attrelid = con.conrelid
           and a.attnum = con.conkey[1]
        where con.contype = 'f'
          and con.confrelid = 'public.medicaments'::regclass
          and array_length(con.conkey, 1) = 1
          and not (n.nspname = 'public' and c.relname = 'abonnements_medicament')
    loop
        execute format(
            'select exists (select 1 from %I.%I where %I = $1)',
            v_fk.schema_name,
            v_fk.table_name,
            v_fk.column_name
        )
        into v_est_reference
        using p_id;

        if v_est_reference then
            return;
        end if;
    end loop;

    delete from public.medicaments
    where id = p_id;
end;
$$;

revoke all on function public.supprimer_medicament_si_orphelin(bigint) from public, anon, authenticated;

-- ============================================================
-- 2. Triggers sur public.offres (avec gestion d'exception)
-- ============================================================

create or replace function public.trg_offres_supprimer_medicament_orphelin_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pharmacie_nom  text;
    v_medicament_nom text;
begin
    begin
        select p.nom::text
        into v_pharmacie_nom
        from public.pharmacies p
        where p.id = old.id_pharmacie;

        select m.nom::text
        into v_medicament_nom
        from public.medicaments m
        where m.id = old.id_medicament;

        insert into public.notifications
            (utilisateur_id, type, id_medicament, id_pharmacie, titre, corps)
        select
            a.utilisateur_id,
            'suivi_retire',
            old.id_medicament,
            old.id_pharmacie,
            'Suivi arrêté',
            coalesce(v_pharmacie_nom, 'Cette pharmacie')
                || ' ne propose plus '
                || coalesce(v_medicament_nom, 'ce médicament')
                || '. Votre suivi a été arrêté.'
        from public.abonnements_medicament a
        where a.id_pharmacie = old.id_pharmacie
          and a.id_medicament = old.id_medicament
          and a.actif;

        delete from public.abonnements_medicament
        where id_pharmacie = old.id_pharmacie
          and id_medicament = old.id_medicament;

        perform public.supprimer_medicament_si_orphelin(old.id_medicament);
    exception
        when others then
            raise warning
                'Nettoyage médicament orphelin ignoré après DELETE offre (id_medicament=%): %',
                old.id_medicament,
                sqlerrm;
    end;

    return old;
end;
$$;

create or replace function public.trg_offres_supprimer_medicament_orphelin_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if old.id_medicament is distinct from new.id_medicament then
        begin
            perform public.supprimer_medicament_si_orphelin(old.id_medicament);
        exception
            when others then
                raise warning
                    'Nettoyage médicament orphelin ignoré après UPDATE offre (ancien id_medicament=%): %',
                    old.id_medicament,
                    sqlerrm;
        end;
    end if;

    return new;
end;
$$;

drop trigger if exists offres_nettoyer_medicament_after_delete on public.offres;
create trigger offres_nettoyer_medicament_after_delete
    after delete on public.offres
    for each row
    execute function public.trg_offres_supprimer_medicament_orphelin_delete();

drop trigger if exists offres_nettoyer_medicament_after_update on public.offres;
create trigger offres_nettoyer_medicament_after_update
    after update of id_medicament on public.offres
    for each row
    when (old.id_medicament is distinct from new.id_medicament)
    execute function public.trg_offres_supprimer_medicament_orphelin_update();

-- ============================================================
-- 3. Audit en lecture seule (à valider manuellement avant tout nettoyage)
-- ============================================================

-- 3a. Vérifier toutes les clés étrangères qui référencent public.medicaments(id)
select
    n.nspname as schema_table,
    c.relname as table_referencante,
    a.attname as colonne_fk,
    con.conname as nom_contrainte,
    case con.confdeltype
        when 'a' then 'NO ACTION'
        when 'r' then 'RESTRICT'
        when 'c' then 'CASCADE'
        when 'n' then 'SET NULL'
        when 'd' then 'SET DEFAULT'
    end as regle_on_delete
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a
    on a.attrelid = con.conrelid
   and a.attnum = con.conkey[1]
where con.contype = 'f'
  and con.confrelid = 'public.medicaments'::regclass
order by n.nspname, c.relname;

-- 3b. Lister les médicaments actuellement orphelins (sans aucune suppression)
select
    m.id,
    m.nom
from public.medicaments m
where not exists (select 1 from public.offres o where o.id_medicament = m.id)
  and not exists (
      select 1
      from public.abonnements_medicament a
      where a.id_medicament = m.id
        and a.id_pharmacie is null
        and a.actif = true
  )
  and not exists (select 1 from public.consultations c where c.id_medicament = m.id)
  and not exists (select 1 from public.discussion_messages dm where dm.id_medicament = m.id)
  and not exists (select 1 from public.notifications n where n.id_medicament = m.id)
order by m.id;
