#!/usr/bin/env bash
# Setup script for suth-helpdesk-assets (Linux/macOS)
# Usage:
#   ./setup.sh            -> install deps + create DB + run schema/migrations
#   ./setup.sh --seed     -> also load seed_dummy_data.sql
#   ./setup.sh --fresh    -> force `npm install` even if node_modules exists

set -euo pipefail
cd "$(dirname "$0")"

SEED=false
FRESH=false
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=true ;;
    --fresh) FRESH=true ;;
  esac
done

echo "== Checking prerequisites =="
command -v node >/dev/null 2>&1 || { echo "Node.js not found. Install Node 20+ first."; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "npm not found."; exit 1; }
command -v mysql >/dev/null 2>&1 || { echo "mysql client not found. Install MySQL and make sure 'mysql' is on PATH."; exit 1; }
echo "Node: $(node -v) | npm: $(npm -v)"

echo ""
echo "== Backend: dependencies =="
cd backend
if [ ! -f .env ]; then
  echo ".env not found, copying from .env.example"
  cp .env.example .env
  echo "!! Edit backend/.env with your DB credentials before continuing, then re-run this script."
  exit 1
fi
if [ "$FRESH" = true ] || [ ! -d node_modules ]; then
  npm install
else
  echo "node_modules already present, skipping (use --fresh to force reinstall)"
fi

# Load DB config from .env (strip \r in case of CRLF line endings)
DB_HOST=$(grep -m1 '^DB_HOST=' .env | cut -d= -f2- | tr -d '\r')
DB_USER=$(grep -m1 '^DB_USER=' .env | cut -d= -f2- | tr -d '\r')
DB_PASSWORD=$(grep -m1 '^DB_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')
DB_NAME=$(grep -m1 '^DB_NAME=' .env | cut -d= -f2- | tr -d '\r')
DB_HOST=${DB_HOST:-localhost}
DB_USER=${DB_USER:-root}

MYSQL_ARGS=(-h "$DB_HOST" -u "$DB_USER")
if [ -n "$DB_PASSWORD" ]; then
  MYSQL_ARGS+=(-p"$DB_PASSWORD")
fi

cd ..

echo ""
echo "== Database: creating '$DB_NAME' if it doesn't exist =="
mysql "${MYSQL_ARGS[@]}" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4;"

echo "== Database: applying schema.sql =="
mysql "${MYSQL_ARGS[@]}" "$DB_NAME" < database/schema.sql

echo "== Database: applying migrations =="
for f in database/migration_*.sql; do
  echo "  -> $f"
  mysql "${MYSQL_ARGS[@]}" "$DB_NAME" < "$f"
done

if [ "$SEED" = true ]; then
  echo "== Database: loading seed_dummy_data.sql =="
  mysql "${MYSQL_ARGS[@]}" "$DB_NAME" < database/seed_dummy_data.sql
fi

echo ""
echo "== Frontend: dependencies =="
cd frontend
if [ "$FRESH" = true ] || [ ! -d node_modules ]; then
  npm install
else
  echo "node_modules already present, skipping (use --fresh to force reinstall)"
fi
cd ..

echo ""
echo "✅ Setup complete."
echo "Next steps (run in two terminals):"
echo "  cd backend  && npm run dev   # API on http://localhost:3000"
echo "  cd frontend && npm run dev   # Web app on http://localhost:5173"
echo "Login: admin / admin123 (change this before real use)"
