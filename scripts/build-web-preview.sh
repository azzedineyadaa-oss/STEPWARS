#!/usr/bin/env bash
# Construit l'aperçu web jouable (mode démo) dans un dossier autonome, servi
# depuis n'importe quelle adresse : chemins relatifs, un seul bundle, et une
# page qui ne réécrit pas son URL. Usage : scripts/build-web-preview.sh [dossier]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(cd "$(dirname "${1:-$ROOT/dist-preview}")" && pwd)/$(basename "${1:-dist-preview}")"
cd "$ROOT"

# Réglages propres à l'aperçu, appliqués le temps de l'export seulement.
cp app.json app.json.preview-backup
trap 'mv app.json.preview-backup app.json' EXIT
node -e '
  const fs = require("fs");
  const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
  const e = app.expo;
  e.experiments = { ...e.experiments, baseUrl: "." };
  e.plugins = e.plugins.map((p) => (p === "expo-router" ? ["expo-router", { asyncRoutes: { web: false } }] : p));
  e.web = { output: "single", bundler: "metro" };
  fs.writeFileSync("app.json", JSON.stringify(app, null, 2));
'

# Sans clés Supabase : l'aperçu reste en mode démo.
rm -rf "$OUT"
env -u EXPO_PUBLIC_SUPABASE_URL -u EXPO_PUBLIC_SUPABASE_KEY CI=1 npx expo export --platform web --output-dir "$OUT" >/dev/null

# Les noms commençant par « _ » sont réservés par certains hébergeurs.
mv "$OUT/_expo" "$OUT/app-bundle"
rm -f "$OUT/metadata.json"
ENTRY="$(ls "$OUT/app-bundle/static/js/web/")"

cat > "$OUT/index.html" <<HTML
<title>StepWars</title>
<meta name="description" content="Aperçu jouable de StepWars : guerre d'équipes, duels et séries de pas.">
<meta name="theme-color" content="#0B0C17">
<style>
  :root { color-scheme: dark; --bg: #0B0C17; }
  html, body { height: 100%; background: var(--bg); }
  body { overflow: hidden; }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<script>
  // L'app garde sa navigation en mémoire sans réécrire l'adresse de la page,
  // pour qu'un rechargement retombe toujours sur l'aperçu.
  (function () {
    var push = history.pushState.bind(history);
    var replace = history.replaceState.bind(history);
    history.pushState = function (state) { return push(state, ''); };
    history.replaceState = function (state) { return replace(state, ''); };
  })();
</script>
<noscript>StepWars a besoin de JavaScript.</noscript>
<div id="root"></div>
<script src="./app-bundle/static/js/web/$ENTRY" defer></script>
HTML

echo "Aperçu prêt : $OUT/index.html"
