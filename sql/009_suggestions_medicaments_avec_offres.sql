-- sql/009_suggestions_medicaments_avec_offres.sql
-- RPC en lecture seule pour les suggestions de noms de médicaments côté pharmacie :
-- ne retourne que les médicaments ayant au moins une offre dans une pharmacie.
-- Script idempotent, à exécuter à la main dans l'éditeur SQL de Supabase.

create or replace function public.lister_medicaments_avec_offres()
returns table (
    id bigint,
    nom text
)
language sql
stable
security definer
set search_path = public
as $$
    select m.id, m.nom::text
    from public.medicaments m
    where exists (
        select 1
        from public.offres o
        where o.id_medicament = m.id
    )
    order by m.nom asc, m.id asc;
$$;

revoke all on function public.lister_medicaments_avec_offres() from public, anon;
grant execute on function public.lister_medicaments_avec_offres() to authenticated;
