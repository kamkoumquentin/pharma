-- sql/007_changer_medicament_offre.sql
-- Permet à une pharmacie active de réaffecter une de ses offres vers un autre
-- médicament du catalogue partagé (trouvé sans casse ni accents, ou créé),
-- sans jamais modifier medicaments.nom, et en déplaçant ou supprimant les
-- suivis clients (abonnements_medicament) chez cette pharmacie selon la
-- similarité entre l'ancien et le nouveau nom.

create or replace function public.changer_medicament_offre(
    p_id_offre bigint,
    p_nouveau_nom text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    c_seuil_similarite constant real := 0.6;
    v_nom_propre text;
    v_pharmacie_id bigint;
    v_pharmacie_nom text;
    v_ancien_medicament_id bigint;
    v_ancien_medicament_nom text;
    v_nouveau_medicament_id bigint;
    v_nouveau_medicament_nom text;
    v_similarite real;
begin
    v_nom_propre := regexp_replace(btrim(coalesce(p_nouveau_nom, '')), '\s+', ' ', 'g');
    if v_nom_propre = '' then
        raise exception 'Le nom du médicament est obligatoire.';
    end if;

    -- Vérifier que l'offre existe, appartient à la pharmacie de l'utilisateur
    -- connecté et que cette pharmacie est active.
    select o.id_pharmacie, p.nom, o.id_medicament, m_ancien.nom
    into v_pharmacie_id, v_pharmacie_nom, v_ancien_medicament_id, v_ancien_medicament_nom
    from public.offres o
    join public.pharmacies p on p.id = o.id_pharmacie
    join public.medicaments m_ancien on m_ancien.id = o.id_medicament
    where o.id = p_id_offre
      and p.owner_id = auth.uid()
      and p.statut = 'actif'
    for update of o;

    if not found then
        raise exception 'Offre introuvable, accès refusé ou pharmacie inactive.';
    end if;

    -- Réutiliser la logique de résolution de importer_offre_unique :
    -- recherche insensible à la casse et aux accents, sinon création.
    select m.id, m.nom
    into v_nouveau_medicament_id, v_nouveau_medicament_nom
    from public.medicaments m
    where lower(extensions.unaccent(regexp_replace(btrim(m.nom), '\s+', ' ', 'g')))
        = lower(extensions.unaccent(v_nom_propre))
    order by m.id asc
    limit 1;

    if v_nouveau_medicament_id is null then
        begin
            insert into public.medicaments (nom)
            values (v_nom_propre)
            returning id, nom into v_nouveau_medicament_id, v_nouveau_medicament_nom;
        exception
            when unique_violation then
                select m.id, m.nom
                into v_nouveau_medicament_id, v_nouveau_medicament_nom
                from public.medicaments m
                where lower(extensions.unaccent(regexp_replace(btrim(m.nom), '\s+', ' ', 'g')))
                    = lower(extensions.unaccent(v_nom_propre))
                order by m.id asc
                limit 1;
        end;
    end if;

    if v_nouveau_medicament_id is null then
        raise exception 'Impossible de trouver ou créer le médicament.';
    end if;

    if v_nouveau_medicament_id = v_ancien_medicament_id then
        return jsonb_build_object(
            'id_offre', p_id_offre,
            'id_medicament', v_nouveau_medicament_id,
            'nom', v_nouveau_medicament_nom
        );
    end if;

    -- Refuser si cette pharmacie possède déjà une autre offre pour ce médicament.
    if exists (
        select 1
        from public.offres o2
        where o2.id_pharmacie = v_pharmacie_id
          and o2.id_medicament = v_nouveau_medicament_id
          and o2.id <> p_id_offre
    ) then
        raise exception 'Votre pharmacie possède déjà une offre pour ce médicament.';
    end if;

    -- Comparer les noms normalisés : si la similarité est suffisante (>= c_seuil_similarite),
    -- déplacer les suivis clients vers le nouveau médicament sans doublon ;
    -- sinon (changement de médicament), supprimer les suivis de cette pharmacie
    -- sur l'ancien médicament, avant de réaffecter l'offre.
    v_similarite := similarity(
        lower(extensions.unaccent(regexp_replace(btrim(coalesce(v_ancien_medicament_nom, '')), '\s+', ' ', 'g'))),
        lower(extensions.unaccent(regexp_replace(btrim(coalesce(v_nouveau_medicament_nom, '')), '\s+', ' ', 'g')))
    );

    if v_similarite >= c_seuil_similarite then
        delete from public.abonnements_medicament a_ancien
        where a_ancien.id_pharmacie = v_pharmacie_id
          and a_ancien.id_medicament = v_ancien_medicament_id
          and exists (
              select 1
              from public.abonnements_medicament a_nouveau
              where a_nouveau.id_pharmacie = v_pharmacie_id
                and a_nouveau.id_medicament = v_nouveau_medicament_id
                and a_nouveau.utilisateur_id = a_ancien.utilisateur_id
          );

        update public.abonnements_medicament
        set id_medicament = v_nouveau_medicament_id
        where id_pharmacie = v_pharmacie_id
          and id_medicament = v_ancien_medicament_id;
    else
        insert into public.notifications
            (utilisateur_id, type, id_medicament, id_pharmacie, titre, corps)
        select
            a.utilisateur_id,
            'suivi_retire',
            v_ancien_medicament_id,
            v_pharmacie_id,
            'Suivi arrêté',
            coalesce(v_pharmacie_nom, 'Cette pharmacie')
                || ' ne propose plus '
                || coalesce(v_ancien_medicament_nom, 'ce médicament')
                || '. Votre suivi a été arrêté.'
        from public.abonnements_medicament a
        where a.id_pharmacie = v_pharmacie_id
          and a.id_medicament = v_ancien_medicament_id
          and a.actif;

        delete from public.abonnements_medicament
        where id_pharmacie = v_pharmacie_id
          and id_medicament = v_ancien_medicament_id;
    end if;

    -- Réaffecter l'offre vers le bon médicament.
    update public.offres
    set id_medicament = v_nouveau_medicament_id
    where id = p_id_offre
      and id_pharmacie = v_pharmacie_id;

    return jsonb_build_object(
        'id_offre', p_id_offre,
        'id_medicament', v_nouveau_medicament_id,
        'nom', v_nouveau_medicament_nom
    );
end;
$$;

revoke all on function public.changer_medicament_offre(bigint, text) from public;
grant execute on function public.changer_medicament_offre(bigint, text) to authenticated;
