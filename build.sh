#!/usr/bin/env bash
# Tangerine – one-shot build script
# Builds the AppImage and optionally installs it

set -e
cd "$(dirname "$0")"

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building AppImage..."
npx electron-builder --linux AppImage --publish never

APPIMAGE=$(find dist -name "*.AppImage" | head -1)

if [ -z "$APPIMAGE" ]; then
  echo "❌ Build failed — no AppImage found in dist/"
  exit 1
fi

echo ""
echo "✅ Built: $APPIMAGE"
echo ""

read -p "Install to ~/Applications and add to autostart? [y/N] " REPLY
if [[ "$REPLY" =~ ^[Yy]$ ]]; then
  mkdir -p ~/Applications
  cp "$APPIMAGE" ~/Applications/Tangerine.AppImage
  chmod +x ~/Applications/Tangerine.AppImage

  # Desktop entry (so it shows in app launchers)
  mkdir -p ~/.local/share/applications
  cat > ~/.local/share/applications/tangerine.desktop <<DESK
[Desktop Entry]
Name=Tangerine
Comment=Drag-to-convert file converter
Exec=$HOME/Applications/Tangerine.AppImage --no-sandbox
Icon=$HOME/Applications/tangerine.png
Terminal=false
Type=Application
Categories=Utility;
StartupNotify=true
DESK

  # Copy icon for launcher
  cp assets/icon.png ~/Applications/tangerine.png

  # Autostart
  mkdir -p ~/.config/autostart
  cat > ~/.config/autostart/tangerine.desktop <<AUTO
[Desktop Entry]
Name=Tangerine
Exec=$HOME/Applications/Tangerine.AppImage --no-sandbox
Terminal=false
Type=Application
X-GNOME-Autostart-enabled=true
AUTO

  echo "✅ Installed to ~/Applications/Tangerine.AppImage"
  echo "✅ Added to autostart (starts with your desktop session)"
  echo ""
  echo "Run now with:"
  echo "  ~/Applications/Tangerine.AppImage --no-sandbox"
else
  echo ""
  echo "Run the AppImage directly:"
  echo "  chmod +x '$APPIMAGE' && '$APPIMAGE' --no-sandbox"
fi
