// Amorce le resolution de l'alias « @/* » avant le script de test :
// node --import ne declare pas lui-meme les crochets de resolution.
import { register } from "node:module";

register("./chargeur-tests.mjs", import.meta.url);
