-- sql/010_notifications_suivi_retire.sql
-- Élargit la contrainte CHECK sur public.notifications(type) pour accepter
-- les notifications in-app de suivi arrêté ('suivi_retire').
-- Script idempotent, à exécuter à la main dans l'éditeur SQL de Supabase.

do $migration$
declare
    v_conname text;
begin
    for v_conname in
        select con.conname
        from pg_constraint con
        join pg_attribute att
          on att.attrelid = con.conrelid
         and att.attnum = any(con.conkey)
        where con.conrelid = 'public.notifications'::regclass
          and con.contype = 'c'
          and att.attname = 'type'
    loop
        execute format(
            'alter table public.notifications drop constraint %I',
            v_conname
        );
    end loop;

    alter table public.notifications
        add constraint notifications_type_check
        check (type in ('medicament_disponible', 'suivi_retire'));
end
$migration$;
