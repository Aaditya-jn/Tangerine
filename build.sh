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

read -p "Install to ~/Applications and add a launcher icon? [y/N] " REPLY
if [[ "$REPLY" =~ ^[Yy]$ ]]; then
  mkdir -p ~/Applications
  cp "$APPIMAGE" ~/Applications/Tangerine.AppImage
  chmod +x ~/Applications/Tangerine.AppImage

  # Desktop entry (so it shows in app launchers / can be pinned to a dock).
  # StartupWMClass must match app.setName('Tangerine') in main.js, or the
  # dock/taskbar can't reliably match the running window back to this
  # launcher icon (this is what makes the "app is running" indicator dot
  # work on GNOME/Dash-to-Dock, KDE, etc.).
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
StartupWMClass=Tangerine
DESK

  # Copy icon for launcher
  cp assets/icon.png ~/Applications/tangerine.png

  echo "✅ Installed to ~/Applications/Tangerine.AppImage"
  echo "✅ Launcher added — you can now pin it to your dock"
  echo ""

  read -p "Also launch automatically when you log in? [y/N] " AUTOREPLY
  if [[ "$AUTOREPLY" =~ ^[Yy]$ ]]; then
    mkdir -p ~/.config/autostart
    cat > ~/.config/autostart/tangerine.desktop <<AUTO
[Desktop Entry]
Name=Tangerine
Exec=$HOME/Applications/Tangerine.AppImage --no-sandbox
Terminal=false
Type=Application
X-GNOME-Autostart-enabled=true
StartupWMClass=Tangerine
AUTO
    echo "✅ Added to autostart"
    echo "   (to undo later: rm ~/.config/autostart/tangerine.desktop)"
  else
    echo "Skipped autostart — launch it yourself from the dock/launcher."
  fi

  echo ""
  echo "Run now with:"
  echo "  ~/Applications/Tangerine.AppImage --no-sandbox"
else
  echo ""
  echo "Run the AppImage directly:"
  echo "  chmod +x '$APPIMAGE' && '$APPIMAGE' --no-sandbox"
fi
