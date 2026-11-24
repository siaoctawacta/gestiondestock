#!/usr/bin/env bash
# Prépare l'archive à téléverser sur l'hébergement LWS (dossier htdocs/<sous-domaine>/) :
#   deploy/mm-stockpro.zip  API Laravel (dépendances vendor/ incluses) + application React
#                           compilée dans public/ : un seul sous-domaine sert les deux.
#
# Usage : scripts/build-lws.sh [adresse du sous-domaine]
#         scripts/build-lws.sh https://stockpro.mmconsultingtg.com
# Prérequis sur la machine qui prépare l'archive : PHP 8.2+, Composer, Node 20+, zip.
set -euo pipefail

SITE_URL="${1:-https://stockpro.mmconsultingtg.com}"
SITE_URL="${SITE_URL%/}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy"
WORK="$(mktemp -d)"
APP="$WORK/mm-stockpro"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$OUT" "$APP"
rm -f "$OUT"/*.zip

echo "==> API Laravel (sans les fichiers de développement)"
(cd "$ROOT" && git ls-files --cached --others --exclude-standard backend) | while read -r f; do
  case "$f" in
    backend/tests/*|backend/phpunit.xml|backend/.editorconfig|backend/.gitattributes) continue ;;
  esac
  mkdir -p "$APP/$(dirname "${f#backend/}")"
  cp "$ROOT/$f" "$APP/${f#backend/}"
done
(cd "$APP" && composer install --prefer-dist --no-dev --optimize-autoloader --no-interaction --no-progress --quiet)
# Le fichier .env n'est jamais livré : il se crée sur le serveur à partir de .env.example

echo "==> Application React pour $SITE_URL (API : $SITE_URL/api)"
(cd "$ROOT/frontend" && npm ci --silent && VITE_API_URL="$SITE_URL" npx vite build --outDir "$WORK/front" --emptyOutDir >/dev/null)
# Fusion dans public/ : le .htaccess de Laravel (backend/public/.htaccess) gère l'API et l'application
rm -f "$WORK/front/.htaccess"
find "$WORK/front" -name '*.map' -delete
cp -R "$WORK/front/." "$APP/public/"

(cd "$WORK" && zip -qr "$OUT/mm-stockpro.zip" mm-stockpro -x "*/.git/*")
ls -lh "$OUT"/*.zip
echo "Archive prête : deploy/mm-stockpro.zip (voir README, « Déploiement sur LWS »)."
