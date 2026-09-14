"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix pour les icones par défaut de Leaflet sous Next.js
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Icône personnalisée pour "Ma Pharmacie" (en vert ou d'une autre couleur pour se démarquer)
const myPharmacyIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Composant pour recentrer la carte quand les résultats changent ou qu'une pharmacie est sélectionnée
function MapUpdater({ pharmacies, selectedPharmacieId, markerRefs }) {
  const map = useMap();
  useEffect(() => {
    if (selectedPharmacieId && markerRefs.current[selectedPharmacieId]) {
      const marker = markerRefs.current[selectedPharmacieId];
      map.flyTo(marker.getLatLng(), 15, { animate: true, duration: 1 });
      // Laisse le temps à l'animation de se terminer avant d'ouvrir la popup
      setTimeout(() => marker.openPopup(), 1000);
    } else if (pharmacies.length > 0 && !selectedPharmacieId) {
      const bounds = L.latLngBounds(
        pharmacies.filter(p => p.latitude && p.longitude).map(p => [p.latitude, p.longitude])
      );
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [pharmacies, map, selectedPharmacieId, markerRefs]);
  return null;
}

export default function MapComponent({ pharmacies, center = [5.36, -4.00], userPharmacieId, selectedPharmacieId }) { 
  const [mapKey, setMapKey] = useState(0);
  const [enlargedImage, setEnlargedImage] = useState(null);
  const markerRefs = require('react').useRef({});

  useEffect(() => {
    // Force la création d'un nouveau conteneur pour corriger l'erreur de "reused instance" avec React Strict Mode
    setMapKey(Date.now());
    
    return () => {
      // Nettoyage lors du démontage pour Leaflet
      setMapKey(0);
    }
  }, []);

  if (mapKey === 0) return <div className="w-full h-full bg-gray-100 flex items-center justify-center">Chargement...</div>;

  return (
    <>
      <MapContainer key={mapKey} center={center} zoom={12} style={{ height: "100%", width: "100%", borderRadius: "0.75rem", zIndex: 0 }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      <MapUpdater pharmacies={pharmacies} selectedPharmacieId={selectedPharmacieId} markerRefs={markerRefs} />
      
      {pharmacies.map((pharmacie) => {
        if (!pharmacie.latitude || !pharmacie.longitude) return null;
        
        const isMyPharmacie = pharmacie.id === userPharmacieId;
        
        return (
          <Marker 
            key={pharmacie.id} 
            position={[pharmacie.latitude, pharmacie.longitude]}
            icon={isMyPharmacie ? myPharmacyIcon : new L.Icon.Default()}
            zIndexOffset={isMyPharmacie ? 1000 : 0}
            ref={(ref) => {
              if (ref) markerRefs.current[pharmacie.id] = ref;
            }}
          >
            <Popup className="custom-popup" minWidth={200}>
              <div className="flex flex-col bg-white rounded-xl overflow-hidden shadow-sm" style={{ margin: "-14px", width: "220px" }}>
                {/* Section Image (Haut) */}
                <div className="bg-gray-50 h-32 w-full flex items-center justify-center p-2 relative">
                  {pharmacie.image ? (
                    <img 
                      src={pharmacie.image} 
                      alt={pharmacie.medicament} 
                      onClick={() => setEnlargedImage(pharmacie.image)}
                      className="max-h-full max-w-full object-contain drop-shadow-sm cursor-pointer hover:scale-105 transition-transform"
                      title="Cliquez pour agrandir"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded-md flex items-center justify-center text-gray-400 text-xs">Image</div>
                  )}
                  {isMyPharmacie && (
                    <span className="absolute top-1 right-1 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                      Vous
                    </span>
                  )}
                </div>
                
                {/* Ligne séparatrice */}
                <div className="h-px w-full bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>

                {/* Section Infos (Bas) */}
                <div className="p-3 flex flex-col items-center text-center">
                  <p className="text-gray-500 text-[10px] font-medium mb-1 truncate w-full">
                    {pharmacie.nom}
                  </p>
                  <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wide mb-1 line-clamp-2 leading-tight">
                    {pharmacie.medicament || "Produit"}
                  </h4>
                  
                  <span className="font-black text-gray-800 text-lg tracking-tight mt-1">
                    {pharmacie.prix ? `${pharmacie.prix} FCFA` : 'Prix NC'}
                  </span>
                  
                  <span className={`text-[9px] mt-2 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    pharmacie.disponibilite === "disponible" 
                      ? "bg-green-50 text-green-700" 
                      : "bg-red-50 text-red-700"
                  }`}>
                    {pharmacie.disponibilite === "disponible" ? "En stock" : "Rupture"}
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
      </MapContainer>

      {/* Modal pour afficher l'image en grand */}
      {enlargedImage && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-4xl max-h-full w-full h-full flex items-center justify-center">
            <button 
              className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black p-2 rounded-full transition-colors"
              onClick={(e) => { e.stopPropagation(); setEnlargedImage(null); }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img 
              src={enlargedImage} 
              alt="Médicament en grand" 
              className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()} 
            />
          </div>
        </div>
      )}
    </>
  );
}
