# 🍊 Tangerine for Linux

> Drag a file onto the drop zone — a radial menu pops up with conversion options. Pick one. Done.

A Linux clone of [Tangerine for macOS](https://github.com/thameem/tangerine), built with Electron. Converts images, videos, audio, PDFs, documents and archives — all locally, no cloud, no upload.

---

## ✨ Features

- **Drag & drop** any file onto the floating drop zone
- **Radial menu** with format-aware conversion options
- **Images** → JPG, PNG, WebP, PDF + Compress, Resize, Grayscale, Rotate
- **PDFs** → Word (DOCX), JPG, PNG, TXT + Compress, Split pages
- **Videos** → MP4, MKV, AVI, MOV, WebM + Extract Audio, Trim
- **Audio** → MP3, WAV, OGG, FLAC, AAC + Trim
- **Documents** → PDF, DOCX, ODT, RTF, TXT (via LibreOffice)
- **Archives** → Extract, Repack as ZIP / TAR.GZ / 7Z
- **Progress ring** — real-time % for ffmpeg conversions
- **History panel** — last 10 conversions, click to open
- **Settings** — output folder, image quality, auto-open, theme
- **Always on top**, movable, never steals focus
- Packaged as **AppImage** — one file, no install needed

---

## 🖥️ Requirements

```bash
sudo apt install imagemagick ffmpeg libreoffice pandoc poppler-utils ghostscript
sudo apt install p7zip-full unrar   # optional, for 7z/rar
sudo apt install libfuse2           # Ubuntu 22.04+ for AppImage
```

---

## 🚀 Run from source

```bash
git clone https://github.com/Aaditya-jn/Tangerine
cd Tangerine
npm install
npm start
```

---

## 📦 Build AppImage

```bash
chmod +x build.sh && ./build.sh
```

Builds `dist/Tangerine-0.3.0.AppImage` and optionally installs to `~/Applications/` with autostart on login.

---

## 🗂️ Project structure
src/
main.js ← Electron main process, window management, IPC
preload.js ← Secure bridge between main and renderer
settings.js ← Read/write ~/.config/tangerine/settings.json
converter.js ← All conversion logic (imagemagick, ffmpeg, libreoffice, gs)
renderer/
drop.html ← Floating drop zone UI
radial.html ← Radial conversion menu
settings.html ← Settings panel
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

- [Electron](https://www.electronjs.org/) — desktop shell
- [ImageMagick](https://imagemagick.org/) — image conversion
- [FFmpeg](https://ffmpeg.org/) — video & audio conversion
- [LibreOffice headless](https://www.libreoffice.org/) — document conversion
- [Ghostscript](https://www.ghostscript.com/) — PDF compression
- [Poppler](https://poppler.freedesktop.org/) — PDF text extraction

---

## 📝 License

MIT © Aaditya Jain
