export function construireNomFichierImage(empreinteSha256, extension) {
  return `produits/${empreinteSha256}.${extension}`;
}
