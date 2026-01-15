#!/bin/bash
# Database Reset Script

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="$PROJECT_ROOT/service/db/memeflow.db"

echo "🗄️  Database Reset"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "$DB_PATH" ]; then
    SIZE=$(du -h "$DB_PATH" | cut -f1)
    echo "Found database: $SIZE"
    rm -f "$DB_PATH"
    echo "✅ Database deleted"
else
    echo "No database found"
fi

echo ""
echo "Database will be recreated on next backend start"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
