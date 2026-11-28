export const BUCKET_PHARMACIE_PHOTOS = "pharmacie-photos";
export const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo
export const MAX_PHOTO_WIDTH = 1280;
export const ASPECT_RATIO_4_3 = 4 / 3;
const TARGET_PHOTO_BYTES = 320 * 1024; // ~300 Ko
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

/**
 * Valide le type (JPEG, PNG, WebP) et la taille (<= 10 Mo) d'un fichier image.
 */
export function validerFichierPhoto(file) {
  if (!file) {
    return { valide: false, erreur: "Aucun fichier sélectionné." };
  }

  const mime = (file.type || "").toLowerCase();
  const ext = (file.name || "").split(".").pop()?.toLowerCase() || "";
  const typeValide = mime ? ACCEPTED_IMAGE_TYPES.has(mime) : ACCEPTED_EXTENSIONS.has(ext);

  if (!typeValide) {
    return {
      valide: false,
      erreur: "Format non supporté. Veuillez choisir une image JPEG, PNG ou WebP.",
    };
  }

  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return {
      valide: false,
      erreur: "L'image dépasse 10 Mo. Veuillez choisir un fichier plus léger.",
    };
  }

  return { valide: true, erreur: null };
}

/**
 * Charge une image en corrigeant automatiquement son orientation EXIF.
 */
export async function chargerImageOrientee(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.(),
      };
    } catch {
      // Repli sur HTMLImageElement si createImageBitmap avec options n'est pas supporté
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Impossible de lire cette image."));
      el.src = objectUrl;
    });
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5));
}

/**
 * Calcule la fenêtre de recadrage 4:3 et les dimensions finales (<= 1280 px de large).
 */
export function calculerZoneRecadrage4x3(width, height, offset = { x: 0.5, y: 0.5 }) {
  const ratio = width / height;
  let sw = width;
  let sh = height;

  if (ratio > ASPECT_RATIO_4_3) {
    sh = height;
    sw = height * ASPECT_RATIO_4_3;
  } else {
    sw = width;
    sh = width / ASPECT_RATIO_4_3;
  }

  const xNorm = clamp01(offset?.x);
  const yNorm = clamp01(offset?.y);
  const sx = Math.max(0, (width - sw) * xNorm);
  const sy = Math.max(0, (height - sh) * yNorm);

  const targetWidth = Math.max(1, Math.min(MAX_PHOTO_WIDTH, Math.round(sw)));
  const targetHeight = Math.max(1, Math.round(targetWidth * (3 / 4)));

  return { sx, sy, sw, sh, targetWidth, targetHeight };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Échec de la compression de l'image."));
      },
      type,
      quality
    );
  });
}

/**
 * Recadre en 4:3 paysage, redimensionne (max 1280 px) et compresse en WebP/JPEG (~300 Ko).
 */
export async function genererPhotoRecadree4x3(source, width, height, offset = { x: 0.5, y: 0.5 }) {
  const { sx, sy, sw, sh, targetWidth, targetHeight } = calculerZoneRecadrage4x3(
    width,
    height,
    offset
  );

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Votre navigateur ne supporte pas le traitement d'image.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

  let mimeType = "image/webp";
  let blob = await canvasToBlob(canvas, mimeType, 0.82);

  // Certains navigateurs retournent image/png si l'encodage WebP n'est pas supporté
  if (blob.type !== "image/webp") {
    mimeType = "image/jpeg";
    blob = await canvasToBlob(canvas, mimeType, 0.82);
  }

  // Ajuster la qualité si le fichier reste nettement au-dessus de ~300 Ko
  for (const q of [0.72, 0.62]) {
    if (blob.size <= TARGET_PHOTO_BYTES) break;
    const candidate = await canvasToBlob(canvas, mimeType, q);
    if (candidate.type === mimeType) {
      blob = candidate;
    }
  }

  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  const file = new File([blob], `devanture.${ext}`, { type: mimeType });

  return {
    file,
    blob,
    width: targetWidth,
    height: targetHeight,
    size: blob.size,
    mimeType,
  };
}

/**
 * Extrait le chemin d'un objet dans le bucket Supabase Storage à partir de son URL publique.
 */
export function extraireCheminStorage(url, bucket = BUCKET_PHARMACIE_PHOTOS) {
  if (!url || typeof url !== "string") return null;
  try {
    const pathname = new URL(url, "https://placeholder.local").pathname;
    const prefixes = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
    ];
    for (const prefix of prefixes) {
      const idx = pathname.indexOf(prefix);
      if (idx !== -1) {
        const rawPath = pathname.slice(idx + prefix.length);
        return rawPath ? decodeURIComponent(rawPath) : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Formate une erreur réseau ou Storage Supabase en message utilisateur clair.
 */
export function formaterErreurEnvoiPhoto(error) {
  const msg = String(error?.message || error?.error_description || "").toLowerCase();
  const status = error?.status ?? error?.statusCode;

  if (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("network request failed")
  ) {
    return "Erreur réseau : impossible d'envoyer la photo. Vérifiez votre connexion internet et réessayez.";
  }

  if (
    status === 403 ||
    status === 401 ||
    msg.includes("row-level security") ||
    msg.includes("unauthorized") ||
    msg.includes("permission") ||
    msg.includes("policy")
  ) {
    return "Accès refusé : seul le propriétaire de la pharmacie peut enregistrer cette photo.";
  }

  return error?.message || "Erreur inattendue pendant l'envoi de la photo.";
}

export function formaterTailleKo(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  return `${Math.round(bytes / 1024)} Ko`;
}
