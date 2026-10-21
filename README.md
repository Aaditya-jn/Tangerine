# 🍊 Tangerine for Linux

> Select a file, press `Ctrl+Space` — a radial menu pops up with conversion options. Pick one. Done.

A background Linux utility, built with Electron. No window sitting on your desktop, no drag-and-drop — just a tray icon and a global hotkey. Converts images, videos, audio, PDFs, documents and archives, all locally, no cloud, no upload.

---

## ✨ Features

- **Lives in your tray** — no window, no dock clutter, until you need it
- **Global hotkey** (`Ctrl+Space`) opens a radial menu at your cursor for the file you last copied
- **Radial menu** with format-aware conversion options
- **Images** → JPG, PNG, WebP, PDF + Compress, Resize, Grayscale, Rotate
- **PDFs** → Word (DOCX), JPG, PNG, TXT + Compress, Split pages
- **Videos** → MP4, MKV, AVI, MOV, WebM + Extract Audio, Trim
- **Audio** → MP3, WAV, OGG, FLAC, AAC + Trim
- **Documents** → PDF, DOCX, ODT, RTF, TXT (via LibreOffice)
- **Archives** → Extract, Repack as ZIP / TAR.GZ / 7Z
- **Native OS notifications** on success/failure — no window needed
- **History window** — last 10 conversions, click to open
- **Settings window** — output folder, image quality, auto-open, theme
- Packaged as **AppImage** — one file, no install needed

---

## 🚀 How it works

1. Select a file in your file manager (Nautilus, Nemo, Thunar, etc.)
2. Press **`Ctrl+C`** to copy it
3. Press **`Ctrl+Space`** — the radial menu appears at your cursor
4. Pick a format — done. You'll get a native notification when it's finished.

If nothing's on the clipboard when you press the hotkey, a normal file picker opens instead, so it never does nothing silently.

> There's no universal cross-desktop API for "what file is currently selected" — Nautilus, Nemo, Thunar etc. don't expose one consistently. Copying first is what makes this reliable across file managers instead of being Nautilus-only or broken on half of them.

---

## 🖥️ Requirements

```bash
sudo apt install imagemagick ffmpeg libreoffice pandoc poppler-utils ghostscript
sudo apt install p7zip-full unrar   # optional, for 7z/rar
sudo apt install libfuse2           # Ubuntu 22.04+ for AppImage
```

---

## 📦 Install & run

```bash
git clone https://github.com/Aaditya-jn/Tangerine
cd Tangerine
chmod +x build.sh && ./build.sh
```

The build script asks two questions:
- Install to `~/Applications` with a launcher icon? (lets you pin it to your dock)
- Also launch automatically on login? (say yes if you want it always running in the background without starting it yourself)

### Run without building

```bash
npm install
npm start
```

### Launch on every boot (without re-running build.sh)

```bash
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
```

To undo: `rm ~/.config/autostart/tangerine.desktop`

---

## 🗂️ Project structure
src/
main.js ← Electron main process: tray, hotkey, file detection, IPC
preload.js ← Secure bridge between main and renderer windows
settings.js ← Read/write ~/.config/tangerine/settings.json
converter.js ← All conversion logic (imagemagick, ffmpeg, libreoffice, gs)
renderer/
radial.html ← Radial conversion menu (appears at cursor)
settings.html ← Settings window
history.html ← Recent-conversions window
assets/
icon.png ← App icon (512×512)
build.sh ← One-shot build + install script

---

## ⚙️ Settings

| Setting | Default | Description |
|---|---|---|
| Output folder | `~/Desktop` | Where converted files are saved |
| Image quality | 75 | Compression quality (10–100) |
| Auto-open | Off | Open file immediately after conversion |
| Theme | Auto | Light / Dark / Auto |

---

## 🔧 Tech stack

- [Electron](https://www.electronjs.org/) — background app shell, tray, global shortcuts
- [ImageMagick](https://imagemagick.org/) — image conversion
- [FFmpeg](https://ffmpeg.org/) — video & audio conversion
- [LibreOffice headless](https://www.libreoffice.org/) — document conversion
- [Ghostscript](https://www.ghostscript.com/) — PDF compression
- [Poppler](https://poppler.freedesktop.org/) — PDF text extraction

---

## 📝 License

MIT © Aaditya Jain
