// ─────────────────────────────────────────────────────────────────────────
// Upload/suppression de la photo de profil d'un joueur — stockée sur
// Firebase Storage (jamais en local, jamais dans Firestore directement : on
// n'y enregistre que l'URL de téléchargement, dans le champ avatarPhotoUrl
// de la fiche joueur). La photo est toujours redimensionnée et recompressée
// côté navigateur avant l'envoi, afin de fonctionner à partir de n'importe
// quelle galerie (iPhone/HEIC, Android, Samsung, Google Pixel...) sans jamais
// envoyer un fichier de plusieurs dizaines de Mo.
// ─────────────────────────────────────────────────────────────────────────
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../firebase";

const MAX_DIMENSION = 512; // px — largement suffisant pour un avatar rond
const JPEG_QUALITY = 0.85;
const MAX_SOURCE_SIZE_BYTES = 20 * 1024 * 1024; // 20 Mo avant compression

// Convertit n'importe quelle photo (HEIC, JPEG, PNG, WebP...) en un JPEG
// carré, recadré au centre et redimensionné — évite d'envoyer des photos de
// plusieurs Mo prises directement par un smartphone moderne.
async function resizeImageFile(file) {
  if (file.size > MAX_SOURCE_SIZE_BYTES) {
    throw new Error("Cette photo est trop volumineuse (max 20 Mo). Choisissez-en une autre.");
  }

  // "imageOrientation: from-image" applique automatiquement la rotation EXIF
  // (photo prise en portrait sur un téléphone) — supporté par les navigateurs
  // récents ; ignoré silencieusement sur les plus anciens.
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (e) {
    bitmap = await createImageBitmap(file);
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = MAX_DIMENSION;
  canvas.height = MAX_DIMENSION;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, MAX_DIMENSION, MAX_DIMENSION);
  bitmap.close?.();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Impossible de traiter cette image."))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

// Redimensionne puis envoie sur Firebase Storage (chemin avatars/{playerId}.jpg
// — toujours le même nom, donc une nouvelle photo remplace l'ancienne au lieu
// d'accumuler des fichiers orphelins) et retourne l'URL de téléchargement à
// enregistrer sur la fiche joueur (champ avatarPhotoUrl).
export async function uploadAvatarPhoto(playerId, file) {
  const blob = await resizeImageFile(file);
  const fileRef = ref(storage, `avatars/${playerId}.jpg`);
  await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(fileRef);
}

// Supprime la photo stockée — appelée quand un joueur revient à l'emoji.
// Les erreurs (fichier déjà absent, etc.) sont ignorées : l'essentiel est de
// retirer le champ avatarPhotoUrl de la fiche joueur, ce que l'appelant fait
// séparément juste après.
export async function deleteAvatarPhoto(playerId) {
  try {
    await deleteObject(ref(storage, `avatars/${playerId}.jpg`));
  } catch (e) {
    // Ignoré : le fichier n'existe peut-être déjà plus.
  }
}
