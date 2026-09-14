import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "votre_cle_api_gemini_ici") {
      return NextResponse.json(
        { error: "La clé API Gemini n'est pas configurée sur le serveur." },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("document");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "Aucun fichier valide fourni." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = file.type || "image/jpeg";

    const ai = new GoogleGenAI({ apiKey });

    // Modèles Gemini avec stratégie de repli
    const models = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"];
    let rawAnswer = "";
    let derniereErreur = null;

    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              inlineData: {
                data: buffer.toString("base64"),
                mimeType: mimeType
              }
            },
            {
              text: `Analyse ce document (liste de médicaments manuscrite ou PDF) et extrait chaque ligne contenant un nom de médicament et optionnellement un prix.
              Retourne UNIQUEMENT un tableau JSON valide au format strict suivant, sans blocs de code markdown (comme \`\`\`json) et sans aucun autre texte :
              [
                {"produit": "Nom du médicament et son dosage", "prix": nombre_en_chiffre_ou_null}
              ]`
            }
          ],
          config: {
            responseMimeType: "application/json"
          }
        });

        if (response && response.text) {
          rawAnswer = response.text.trim();
          break;
        }
      } catch (err) {
        derniereErreur = err;
        console.warn(`Tentative Gemini avec ${model} échouée:`, err.message);
      }
    }

    if (!rawAnswer) {
      return NextResponse.json(
        { error: "Erreur lors du traitement par l'IA: " + (derniereErreur?.message || "Échec") },
        { status: 500 }
      );
    }

    // Nettoyer les résidus markdown éventuels
    rawAnswer = rawAnswer.replace(/```json/g, "").replace(/```/g, "").trim();

    let jsonResultat;
    try {
      jsonResultat = JSON.parse(rawAnswer);
    } catch (parseError) {
      console.error("Erreur de parsing JSON Gemini :", rawAnswer);
      return NextResponse.json(
        { error: "L'IA a retourné un format JSON invalide." },
        { status: 500 }
      );
    }

    if (!Array.isArray(jsonResultat)) {
      return NextResponse.json(
        { error: "Format invalide reçu de l'IA." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      succes: true,
      produits: jsonResultat.map((item) => ({
        nom: item.produit ? item.produit.trim() : "",
        prix: item.prix || null,
      })).filter((item) => item.nom.length > 0)
    });

  } catch (error) {
    console.error("Erreur API Route /api/import-ai :", error);
    return NextResponse.json(
      { error: "Erreur interne du serveur lors de l'analyse du document." },
      { status: 500 }
    );
  }
}
