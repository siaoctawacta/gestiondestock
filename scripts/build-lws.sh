#!/usr/bin/env bash
# Prépare les deux archives à téléverser sur l'hébergement cPanel LWS :
#   deploy/mm-api.zip       backend Laravel complet, dépendances (vendor/) incluses
#   deploy/mm-frontend.zip  application React compilée pour l'adresse de l'API
#
# Usage : scripts/build-lws.sh [adresse de l'API]
#         scripts/build-lws.sh https://api.mmcosmetiques.com
# Prérequis sur la machine qui prépare les archives : PHP 8.2+, Composer, Node 20+, zip.
set -euo pipefail

API_URL="${1:-https://api.mmcosmetiques.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$OUT"
rm -f "$OUT/mm-api.zip" "$OUT/mm-frontend.zip"

echo "==> Backend Laravel (sans les fichiers de développement)"
mkdir -p "$WORK/mm-api"
(cd "$ROOT" && git ls-files --cached --others --exclude-standard backend) | while read -r f; do
  case "$f" in
    backend/tests/*|backend/phpunit.xml|backend/.editorconfig|backend/.gitattributes) continue ;;
  esac
  mkdir -p "$WORK/mm-api/$(dirname "${f#backend/}")"
  cp "$ROOT/$f" "$WORK/mm-api/${f#backend/}"
done
(cd "$WORK/mm-api" && composer install --prefer-dist --no-dev --optimize-autoloader --no-interaction --no-progress --quiet)
# Le fichier .env n'est jamais livré : il se crée sur le serveur à partir de .env.example
(cd "$WORK" && zip -qr "$OUT/mm-api.zip" mm-api -x "*/.git/*")

echo "==> Frontend React pour l'API $API_URL"
(cd "$ROOT/frontend" && npm ci --silent && VITE_API_URL="$API_URL" npx vite build --outDir "$WORK/mm-frontend" --emptyOutDir >/dev/null)
(cd "$WORK/mm-frontend" && zip -qr "$OUT/mm-frontend.zip" . -x '*.map')

ls -lh "$OUT"/*.zip
echo "Archives prêtes dans deploy/ (voir README, « Déploiement sur LWS »)."
