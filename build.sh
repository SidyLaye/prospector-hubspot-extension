#!/bin/bash
# build.sh — Build des packages pour chaque store

set -e

VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")
DIST="dist"

echo "🔨 Build Prospector v$VERSION"
mkdir -p $DIST

# ── Chrome / Edge / Opera ──────────────────────────────────────────────────────
echo "📦 Building Chrome/Edge/Opera package..."
rm -rf /tmp/prospector-chrome
cp -r . /tmp/prospector-chrome
cd /tmp/prospector-chrome
# Supprimer les fichiers Firefox-only et dev
rm -f manifest.firefox.json src/background.firefox.js build.sh .gitignore
cd - > /dev/null
cd /tmp && zip -r prospector-chrome.zip prospector-chrome/ -x "*.DS_Store" "*.git*"
mv /tmp/prospector-chrome.zip $DIST/
echo "  ✓ dist/prospector-chrome.zip"

# ── Firefox ───────────────────────────────────────────────────────────────────
echo "📦 Building Firefox package..."
rm -rf /tmp/prospector-firefox
cp -r . /tmp/prospector-firefox
cd /tmp/prospector-firefox
# Remplacer le manifest
cp manifest.firefox.json manifest.json
rm -f manifest.firefox.json build.sh .gitignore
cd - > /dev/null
cd /tmp && zip -r prospector-firefox.zip prospector-firefox/ -x "*.DS_Store" "*.git*"
mv /tmp/prospector-firefox.zip $DIST/
echo "  ✓ dist/prospector-firefox.zip"

echo ""
echo "✅ Build terminé:"
ls -lh $DIST/
echo ""
echo "📋 Liens de soumission:"
echo "  Firefox AMO  → https://addons.mozilla.org/developers/addon/submit/upload-listed"
echo "  Edge Add-ons → https://partner.microsoft.com/dashboard/microsoftedge/newExtension"
echo "  Opera Add-ons → https://addons.opera.com/developer/upload/"
echo ""
echo "💡 Pour signer Firefox avec web-ext:"
echo "  npm install -g web-ext"
echo "  web-ext sign --source-dir=. --api-key=\$AMO_KEY --api-secret=\$AMO_SECRET"
