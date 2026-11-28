"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { 
  PencilIcon, 
  ArrowPathIcon,
  MapIcon 
} from "@heroicons/react/24/solid";
import { supabase } from "@/app/lib/supabaseClient";
import { logErreur } from "@/app/lib/logger";
import { useToast } from "@/app/components/Toast";
import {
  ASPECT_RATIO_4_3,
  BUCKET_PHARMACIE_PHOTOS,
  chargerImageOrientee,
  extraireCheminStorage,
  formaterErreurEnvoiPhoto,
  formaterTailleKo,
  genererPhotoRecadree4x3,
  validerFichierPhoto,
} from "@/app/lib/photoPharmacie";

const MedicalMapPinIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
    <path d="M9.5 8h5v2h-5z" fill="white" />
    <path d="M11 6.5h2v5h-2z" fill="white" />
  </svg>
);

export default function Modification({
  info,
  token,
  onUpdate,
  section,
  embedded = false,
  onTabStateChange,
}) {
  const [nom, setNom] = useState(info?.nom || "");
  const [ville, setVille] = useState(info?.ville || "");
  const [emplacement, setEmplacement] = useState(info?.emplacement || "");
  const [coordonnees, setCoordonnees] = useState({
    lat: info?.latitude ?? null,
    lng: info?.longitude ?? null,
  });
  const [photo, setPhoto] = useState(null);
  const [photoMeta, setPhotoMeta] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(info?.photo || "");
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState("");
  const [sourceDimensions, setSourceDimensions] = useState(null);
  const [cropOffset, setCropOffset] = useState({ x: 0.5, y: 0.5 });
  const [photoError, setPhotoError] = useState("");
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  const fileInputRef = useRef(null);
  const previewBoxRef = useRef(null);
  const sourceImageRef = useRef(null);
  const dragStateRef = useRef(null);
  const cropOffsetRef = useRef({ x: 0.5, y: 0.5 });
  const showToast = useToast();

  const valeursInitiales = useMemo(() => ({
    nom: info?.nom || "",
    ville: info?.ville || "",
    emplacement: info?.emplacement || "",
    latitude: info?.latitude ?? null,
    longitude: info?.longitude ?? null,
    photo: info?.photo || "",
  }), [info]);

  const estModifie = Boolean(
    nom !== valeursInitiales.nom ||
    ville !== valeursInitiales.ville ||
    emplacement !== valeursInitiales.emplacement ||
    coordonnees.lat !== valeursInitiales.latitude ||
    coordonnees.lng !== valeursInitiales.longitude ||
    photo
  );

  const nettoyerEditionPhoto = useCallback(() => {
    if (sourceImageRef.current) {
      sourceImageRef.current.cleanup?.();
      sourceImageRef.current = null;
    }
    setSourcePreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return "";
    });
    setPhotoPreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return info?.photo || "";
    });
    setPhoto(null);
    setPhotoMeta(null);
    setSourceDimensions(null);
    setCropOffset({ x: 0.5, y: 0.5 });
    cropOffsetRef.current = { x: 0.5, y: 0.5 };
    setPhotoError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [info?.photo]);

  useEffect(() => {
    return () => {
      if (sourceImageRef.current) {
        sourceImageRef.current.cleanup?.();
        sourceImageRef.current = null;
      }
    };
  }, []);

  const annuler = useCallback(() => {
    setNom(info?.nom || "");
    setVille(info?.ville || "");
    setEmplacement(info?.emplacement || "");
    setCoordonnees({ lat: info?.latitude ?? null, lng: info?.longitude ?? null });
    nettoyerEditionPhoto();
  }, [info, nettoyerEditionPhoto]);

  const sauvegarder = useCallback(async () => {
    if (!info?.id) {
      return { success: false, error: "Identifiant de pharmacie introuvable." };
    }
    if (section === "general" && !nom.trim()) {
      return { success: false, error: "Le nom de la pharmacie est obligatoire." };
    }

    setLoading(true);
    try {
      const modifications = section === "general"
        ? { nom: nom.trim() }
        : {
            ville: ville.trim() || null,
            emplacement: emplacement.trim(),
          };
      if (section === "adresse" && coordonnees.lat !== null) {
        modifications.latitude = parseFloat(coordonnees.lat);
      }
      if (section === "adresse" && coordonnees.lng !== null) {
        modifications.longitude = parseFloat(coordonnees.lng);
      }

      let nouveauCheminStorage = null;
      const anciennePhotoUrl = valeursInitiales.photo;
      if (section === "general" && photo) {
        try {
          const ext = photo.type === "image/webp" ? "webp" : "jpg";
          const filename = `${info.id}/devanture-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from(BUCKET_PHARMACIE_PHOTOS)
            .upload(filename, photo, {
              contentType: photo.type,
              upsert: false,
            });

          if (upErr) {
            const msg = formaterErreurEnvoiPhoto(upErr);
            setPhotoError(msg);
            return { success: false, error: msg };
          }

          nouveauCheminStorage = filename;
          const { data: urlData } = supabase.storage
            .from(BUCKET_PHARMACIE_PHOTOS)
            .getPublicUrl(filename);

          if (!urlData?.publicUrl) {
            await supabase.storage.from(BUCKET_PHARMACIE_PHOTOS).remove([filename]);
            const msg = "URL publique de la photo indisponible.";
            setPhotoError(msg);
            return { success: false, error: msg };
          }

          modifications.photo = urlData.publicUrl;
        } catch (storageErr) {
          logErreur("ModifierProfil", "téléversement de la photo de la pharmacie", storageErr, {
            pharmacieId: info.id,
            section,
          });
          const msg = formaterErreurEnvoiPhoto(storageErr);
          setPhotoError(msg);
          return { success: false, error: msg };
        }
      }

      const { data: updatedData, error: updateErr } = await supabase
        .from("pharmacies")
        .update(modifications)
        .eq("id", info.id)
        .select("id, nom, ville, emplacement, photo, telephone, latitude, longitude")
        .single();

      if (updateErr) {
        if (nouveauCheminStorage) {
          await supabase.storage
            .from(BUCKET_PHARMACIE_PHOTOS)
            .remove([nouveauCheminStorage])
            .catch(() => {});
        }
        logErreur("ModifierProfil", "mise à jour du profil pharmacie", updateErr, {
          pharmacieId: info.id,
          section,
        });
        return {
          success: false,
          error: formaterErreurEnvoiPhoto(updateErr),
        };
      }

      if (nouveauCheminStorage && anciennePhotoUrl) {
        const ancienChemin = extraireCheminStorage(anciennePhotoUrl, BUCKET_PHARMACIE_PHOTOS);
        if (ancienChemin && ancienChemin !== nouveauCheminStorage) {
          const { error: delErr } = await supabase.storage
            .from(BUCKET_PHARMACIE_PHOTOS)
            .remove([ancienChemin]);
          if (delErr) {
            logErreur("ModifierProfil", "suppression de l'ancienne photo", delErr, {
              pharmacieId: info.id,
              ancienChemin,
            });
          }
        }
      }

      onUpdate?.(updatedData);
      if (section === "general") {
        setNom(updatedData.nom || "");
        if (sourceImageRef.current) {
          sourceImageRef.current.cleanup?.();
          sourceImageRef.current = null;
        }
        setSourcePreviewUrl((prev) => {
          if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
          return "";
        });
        setPhotoPreview((prev) => {
          if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
          return updatedData.photo || "";
        });
        setPhoto(null);
        setPhotoMeta(null);
        setSourceDimensions(null);
        setCropOffset({ x: 0.5, y: 0.5 });
        cropOffsetRef.current = { x: 0.5, y: 0.5 };
        setPhotoError("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        setVille(updatedData.ville || "");
        setEmplacement(updatedData.emplacement || "");
        setCoordonnees({
          lat: updatedData.latitude ?? null,
          lng: updatedData.longitude ?? null,
        });
      }
      return { success: true };
    } catch (error) {
      logErreur("ModifierProfil", "sauvegarde du profil pharmacie", error, {
        pharmacieId: info.id,
        section,
      });
      return { success: false, error: formaterErreurEnvoiPhoto(error) };
    } finally {
      setLoading(false);
    }
  }, [coordonnees.lat, coordonnees.lng, emplacement, info, nom, onUpdate, photo, section, valeursInitiales.photo, ville]);

  useEffect(() => {
    onTabStateChange?.(section, { dirty: estModifie, cancel: annuler, save: sauvegarder, loading });
  }, [annuler, estModifie, loading, onTabStateChange, sauvegarder, section]);

  const changerPosition = () => {
    setGpsLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoordonnees({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          showToast("Position GPS mise à jour avec succès !", "success");
          setGpsLoading(false);
        },
        (error) => {
          showToast("Erreur lors de la récupération de la position : " + error.message, "error");
          setGpsLoading(false);
        }
      );
    } else {
      showToast("La géolocalisation n'est pas supportée par votre navigateur.", "error");
      setGpsLoading(false);
    }
  };

  const valider = async (e) => {
    e.preventDefault();
    const result = await sauvegarder();
    if (!embedded) {
      showToast(
        result.success
          ? result.warning || "Modifications enregistrées avec succès !"
          : result.error,
        result.success && !result.warning ? "success" : "error"
      );
    }
  };

  const regenererApercuRecadre = useCallback(async (offset) => {
    const imgData = sourceImageRef.current;
    if (!imgData) return;
    try {
      const resultat = await genererPhotoRecadree4x3(
        imgData.source,
        imgData.width,
        imgData.height,
        offset
      );
      setPhoto(resultat.file);
      setPhotoMeta({
        width: resultat.width,
        height: resultat.height,
        size: resultat.size,
        format: resultat.mimeType === "image/webp" ? "WebP" : "JPEG",
      });
      setPhotoPreview((prev) => {
        if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return URL.createObjectURL(resultat.blob);
      });
    } catch (err) {
      setPhotoError(err?.message || "Impossible de recadrer cette image.");
    }
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validerFichierPhoto(file);
    if (!validation.valide) {
      setPhotoError(validation.erreur);
      showToast(validation.erreur, "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setPhotoProcessing(true);
    setPhotoError("");
    try {
      const chargee = await chargerImageOrientee(file);
      if (sourceImageRef.current) {
        sourceImageRef.current.cleanup?.();
      }
      sourceImageRef.current = chargee;

      const offsetInitial = { x: 0.5, y: 0.5 };
      setCropOffset(offsetInitial);
      cropOffsetRef.current = offsetInitial;
      setSourceDimensions({ width: chargee.width, height: chargee.height });
      setSourcePreviewUrl((prev) => {
        if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });

      await regenererApercuRecadre(offsetInitial);
    } catch (err) {
      const msg = err?.message || "Impossible de charger cette image.";
      setPhotoError(msg);
      showToast(msg, "error");
    } finally {
      setPhotoProcessing(false);
    }
  };

  const estRecadrageDeplacable = Boolean(
    sourceDimensions &&
      Math.abs(sourceDimensions.width / sourceDimensions.height - ASPECT_RATIO_4_3) > 0.015
  );

  const handlePreviewPointerDown = (e) => {
    if (!estRecadrageDeplacable || !previewBoxRef.current || !sourceDimensions) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffset: cropOffsetRef.current,
    };
  };

  const handlePreviewPointerMove = (e) => {
    if (!dragStateRef.current || !previewBoxRef.current || !sourceDimensions) return;
    const rect = previewBoxRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const imgRatio = sourceDimensions.width / sourceDimensions.height;
    const { startX, startY, startOffset } = dragStateRef.current;
    let nextX = startOffset.x;
    let nextY = startOffset.y;

    if (imgRatio > ASPECT_RATIO_4_3) {
      const renderedWidth = rect.height * imgRatio;
      const overflowX = renderedWidth - rect.width;
      if (overflowX > 1) {
        nextX = Math.min(1, Math.max(0, startOffset.x - (e.clientX - startX) / overflowX));
      }
    } else {
      const renderedHeight = rect.width / imgRatio;
      const overflowY = renderedHeight - rect.height;
      if (overflowY > 1) {
        nextY = Math.min(1, Math.max(0, startOffset.y - (e.clientY - startY) / overflowY));
      }
    }

    const next = { x: nextX, y: nextY };
    cropOffsetRef.current = next;
    setCropOffset(next);
  };

  const handlePreviewPointerEnd = () => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    regenererApercuRecadre(cropOffsetRef.current);
  };

  const enregistrerPhoto = async () => {
    const result = await sauvegarder();
    if (embedded) {
      showToast(
        result.success ? "Photo de la devanture enregistrée." : result.error,
        result.success ? "success" : "error",
        result.success ? 4000 : 7000
      );
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
      
      {!embedded && <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
          <PencilIcon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-gray-800 text-lg">Paramètres Pharmacie</h2>
          <p className="text-xs text-gray-400">Modifiez les informations publiques de votre pharmacie</p>
        </div>
      </div>}

      <form onSubmit={valider} className="space-y-4">
        
        {section === "general" && <>
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Nom de la pharmacie *
          </label>
          <input 
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition" 
            type="text" 
            placeholder="Nouveau nom" 
          />
        </div>
        <div className="flex flex-col space-y-2">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Photo de la pharmacie
          </label>
          <p className="px-1 text-xs leading-relaxed text-gray-600">
            Photo de la devanture : prise de face, enseigne visible, en pleine journée, en format paysage. Elle aide les clients à vous reconnaître dans la rue.
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />

          {photoError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
            >
              {photoError}
            </div>
          )}

          {photo && sourcePreviewUrl ? (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/20 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Aperçu client (4:3 paysage)
                  </span>
                  <div
                    ref={previewBoxRef}
                    onPointerDown={handlePreviewPointerDown}
                    onPointerMove={handlePreviewPointerMove}
                    onPointerUp={handlePreviewPointerEnd}
                    onPointerCancel={handlePreviewPointerEnd}
                    className={`relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100 select-none touch-none ${
                      estRecadrageDeplacable ? "cursor-grab active:cursor-grabbing" : ""
                    }`}
                  >
                    <img
                      src={sourcePreviewUrl}
                      alt="Aperçu 4:3 de la devanture"
                      draggable={false}
                      style={{
                        objectPosition: `${cropOffset.x * 100}% ${cropOffset.y * 100}%`,
                      }}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  {estRecadrageDeplacable && (
                    <p className="text-[11px] text-gray-500">
                      Faites glisser l&apos;image pour ajuster le cadrage.
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-start space-y-1.5">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Liste Mediskip (80×80)
                  </span>
                  <div className="h-20 w-20 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
                    {photoPreview && (
                      <img
                        src={photoPreview}
                        alt="Vignette carrée 80 par 80"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  {photoMeta && (
                    <span className="text-[11px] text-gray-500">
                      {photoMeta.width}×{photoMeta.height} · {formaterTailleKo(photoMeta.size)} · {photoMeta.format}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={enregistrerPhoto}
                  disabled={loading || photoProcessing}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                >
                  {loading ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || photoProcessing}
                  className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-50"
                >
                  Choisir une autre photo
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <div className="aspect-[4/3] w-32 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Photo actuelle de la pharmacie"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-gray-400">
                    Aucune photo
                  </div>
                )}
              </div>
              <div className="flex flex-col items-start gap-2">
                {photoPreview && (
                  <div className="flex items-center gap-2">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                      <img
                        src={photoPreview}
                        alt="Vignette carrée actuelle"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <span className="text-[11px] text-gray-500">Vignette 80×80</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photoProcessing || loading}
                  className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {photoProcessing
                    ? "Traitement de l'image..."
                    : photoPreview
                      ? "Choisir une autre photo"
                      : "Choisir une photo"}
                </button>
              </div>
            </div>
          )}
        </div>
        </>}

        {section === "adresse" && <>
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Ville
          </label>
          <div className="relative">
            <MapIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600/70" />
            <input 
              value={ville}
              onChange={(e) => setVille(e.target.value)}
              className="w-full h-11 pl-11 pr-4 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition" 
              type="text" 
              placeholder="Ex: Bafoussam, Douala, Yaoundé..." 
            />
          </div>
        </div>

        {/* Emplacement */}
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide px-1">
            Quartier
          </label>
          <div className="relative">
            <MedicalMapPinIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600/70" />
            <input 
              value={emplacement}
              onChange={(e) => setEmplacement(e.target.value)}
              className="w-full h-11 pl-11 pr-4 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition" 
              type="text" 
              placeholder="Ex: Face hôpital de district" 
            />
          </div>
        </div>

        {/* GPS Coordinates */}
        <div className="flex items-center justify-between bg-emerald-50/30 border border-emerald-100 rounded-xl p-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Position GPS enregistrée</span>
            <span className="text-xs text-gray-700 font-mono mt-1 font-semibold">
              {coordonnees.lat && coordonnees.lng 
                ? `Lat: ${Number(coordonnees.lat).toFixed(6)}, Lng: ${Number(coordonnees.lng).toFixed(6)}`
                : "Non spécifiée"
              }
            </span>
          </div>
          <button 
            type="button"
            onClick={changerPosition}
            disabled={gpsLoading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${gpsLoading ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>
        </>}

        {/* Action Buttons */}
        {!embedded && <div className="w-full border-t border-gray-100 pt-6 mt-6 flex justify-end gap-3">
          <button 
            type="button"
            onClick={annuler}
            className="px-6 py-2.5 border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-semibold text-gray-600 transition cursor-pointer shadow-sm"
          >
            Annuler
          </button>
          <button 
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-600/15 active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Enregistrement..." : "Valider les modifications"}
          </button>
        </div>}

      </form>
    </div>
  );
}