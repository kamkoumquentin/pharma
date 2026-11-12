import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Configuration Supabase manquante : renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local avant de démarrer l'application."
  );
}

const fetchOriginal = globalThis.fetch.bind(globalThis);
const compteursRequetes = new Map();
const fetchAvecCompteur = (input, init) => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  const methode = (init?.method || input?.method || "GET").toUpperCase();
  const chemin = new URL(url, typeof window === "undefined" ? supabaseUrl : window.location.origin).pathname;
  const cle = `${methode} ${chemin}`;
  compteursRequetes.set(cle, (compteursRequetes.get(cle) || 0) + 1);
  return fetchOriginal(input, init);
};

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.__supabaseRequestCounter = {
    reset() {
      compteursRequetes.clear();
    },
    snapshot() {
      return Object.fromEntries(compteursRequetes);
    },
  };
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: process.env.NODE_ENV !== "production" ? fetchAvecCompteur : fetchOriginal,
  },
});
