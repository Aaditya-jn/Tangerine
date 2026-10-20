#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building AppImage..."
npx electron-builder --linux AppImage --publish never

APPIMAGE=$(find dist -name "*.AppImage" | head -1)
if [ -z "$APPIMAGE" ]; then echo "❌ Build failed"; exit 1; fi

echo "✅ Built: $APPIMAGE"

read -p "Install to ~/Applications? [y/N] " REPLY
if [[ "$REPLY" =~ ^[Yy]$ ]]; then
  mkdir -p ~/Applications
  cp "$APPIMAGE" ~/Applications/Tangerine.AppImage
  chmod +x ~/Applications/Tangerine.AppImage
  cp assets/icon.png ~/Applications/tangerine.png

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
StartupNotify=false
StartupWMClass=Tangerine
DESK

  update-desktop-database ~/.local/share/applications 2>/dev/null || true
  echo "✅ Installed"

  read -p "Launch at login? [y/N] " AUTOSTART
  if [[ "$AUTOSTART" =~ ^[Yy]$ ]]; then
    mkdir -p ~/.config/autostart
    cat > ~/.config/autostart/tangerine.desktop <<AUTO
[Desktop Entry]
Name=Tangerine
Exec=$HOME/Applications/Tangerine.AppImage --no-sandbox
Terminal=false
Type=Application
X-GNOME-Autostart-enabled=true
AUTO
    echo "✅ Autostart enabled"
  else
    rm -f ~/.config/autostart/tangerine.desktop
    echo "ℹ️  No autostart"
  fi
else
  echo "Run: chmod +x '$APPIMAGE' && '$APPIMAGE' --no-sandbox"
fi
