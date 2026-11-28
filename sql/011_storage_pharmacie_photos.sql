-- 011_storage_pharmacie_photos.sql
-- Politiques Supabase Storage pour le bucket "pharmacie-photos".
-- Chaque pharmacie écrit ses photos dans le dossier "<pharmacie_id>/...".
-- Script idempotent : peut être réexécuté sans erreur dans l'éditeur SQL de Supabase.

-- 1. S'assurer que le bucket public existe
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pharmacie-photos',
  'pharmacie-photos',
  true,
  10485760, -- 10 Mo
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 2. Lecture publique des photos de pharmacie
drop policy if exists "pharmacie_photos_lecture_publique" on storage.objects;
create policy "pharmacie_photos_lecture_publique"
on storage.objects
for select
to public
using (bucket_id = 'pharmacie-photos');

-- 3. Insertion réservée au propriétaire de la pharmacie dans son dossier "<pharmacie_id>/..."
drop policy if exists "pharmacie_photos_insertion_proprietaire" on storage.objects;
create policy "pharmacie_photos_insertion_proprietaire"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pharmacie-photos'
  and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and public.est_proprietaire_de_pharmacie(((storage.foldername(name))[1])::bigint)
);

-- 4. Mise à jour réservée au propriétaire
drop policy if exists "pharmacie_photos_maj_proprietaire" on storage.objects;
create policy "pharmacie_photos_maj_proprietaire"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pharmacie-photos'
  and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and public.est_proprietaire_de_pharmacie(((storage.foldername(name))[1])::bigint)
)
with check (
  bucket_id = 'pharmacie-photos'
  and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and public.est_proprietaire_de_pharmacie(((storage.foldername(name))[1])::bigint)
);

-- 5. Suppression réservée au propriétaire (remplacement de l'ancienne photo)
drop policy if exists "pharmacie_photos_suppression_proprietaire" on storage.objects;
create policy "pharmacie_photos_suppression_proprietaire"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pharmacie-photos'
  and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and public.est_proprietaire_de_pharmacie(((storage.foldername(name))[1])::bigint)
);
