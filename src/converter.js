const { spawn, exec } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const IMAGES  = ['jpg','jpeg','png','webp','gif','bmp','tiff','ico','avif'];
const VIDEOS  = ['mp4','mkv','avi','mov','webm','flv','wmv','m4v'];
const AUDIO   = ['mp3','wav','ogg','flac','aac','m4a','opus','wma'];
const DOCS    = ['pdf','docx','doc','odt','rtf','txt','md','html'];
const ARCHIVES= ['zip','tar','gz','bz2','xz','7z','rar'];

function getExt(filePath) {
  return path.extname(filePath).toLowerCase().replace('.', '');
}

function getOptions(ext) {
  // Images: common targets first, then tools
  if (IMAGES.includes(ext)) {
    const fmts = ['jpg','png','webp','pdf','gif','bmp','tiff','ico','avif'].filter(e => e !== ext);
    return [
      ...fmts.map(e => ({ label: e.toUpperCase(), value: e, group: 'image' })),
      { label: 'COMPRESS', value: '__compress__', group: 'tool' },
      { label: 'RESIZE 50%',value: '__resize50__', group: 'tool' },
      { label: 'RESIZE 25%',value: '__resize25__', group: 'tool' },
      { label: 'GRAYSCALE', value: '__gray__',     group: 'tool' },
      { label: 'ROTATE 90°',value: '__rotate90__', group: 'tool' },
    ];
  }

  // Videos: popular targets + extract audio
  if (VIDEOS.includes(ext)) {
    const fmts = ['mp4','mkv','avi','mov','webm','gif'].filter(e => e !== ext);
    return [
      ...fmts.map(e => ({ label: e.toUpperCase(), value: e, group: 'video' })),
      { label: 'MP3',   value: '__extractaudio__', group: 'tool' },
      { label: 'TRIM',  value: '__trim__',          group: 'tool' },
    ];
  }

  // Audio: popular targets + trim
  if (AUDIO.includes(ext)) {
    const fmts = ['mp3','wav','ogg','flac','aac','m4a'].filter(e => e !== ext);
    return [
      ...fmts.map(e => ({ label: e.toUpperCase(), value: e, group: 'audio' })),
      { label: 'TRIM',  value: '__trim__', group: 'tool' },
    ];
  }

  // PDF: what people actually need
  if (ext === 'pdf') return [
    { label: 'WORD',     value: '__pdf2docx__',     group: 'doc'  },
    { label: 'JPG',      value: '__pdf2img_jpg__',  group: 'tool' },
    { label: 'PNG',      value: '__pdf2img__',      group: 'tool' },
    { label: 'TXT',      value: '__pdf2txt__',      group: 'doc'  },
    { label: 'COMPRESS', value: '__pdfcompress__',  group: 'tool' },
    { label: 'MERGE',    value: '__pdfmerge__',     group: 'tool' },
    { label: 'SPLIT',    value: '__pdfsplit__',     group: 'tool' },
  ];

  // Word/doc → PDF is the #1 use case
  if (['docx','doc','odt'].includes(ext)) return [
    { label: 'PDF',  value: 'pdf',  group: 'doc' },
    { label: 'TXT',  value: 'txt',  group: 'doc' },
    { label: 'ODT',  value: 'odt',  group: 'doc' },
    { label: 'RTF',  value: 'rtf',  group: 'doc' },
  ];

  if (DOCS.includes(ext)) return [
    ...DOCS.filter(e => e !== ext && e !== 'html').map(e => ({ label: e.toUpperCase(), value: e, group: 'doc' })),
  ];

  if (ARCHIVES.includes(ext)) return [
    { label: 'EXTRACT', value: '__extract__',      group: 'tool'    },
    { label: 'ZIP',     value: '__repack_zip__',   group: 'archive' },
    { label: 'TAR.GZ',  value: '__repack_targz__', group: 'archive' },
    { label: '7Z',      value: '__repack_7z__',    group: 'archive' },
  ];
  return [
    { label: 'PDF',  value: 'pdf',  group: 'doc'   },
    { label: 'PNG',  value: 'png',  group: 'image' },
    { label: 'MP4',  value: 'mp4',  group: 'video' },
    { label: 'MP3',  value: 'mp3',  group: 'audio' },
    { label: 'TXT',  value: 'txt',  group: 'doc'   },
  ];
}

// Run a command, stream progress via onProgress(pct), resolve outPath or reject
function run(cmd, args, { onProgress, parseProgress } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore','pipe','pipe'] });
    let errBuf = '';

    proc.stderr.on('data', chunk => {
      const txt = chunk.toString();
      errBuf += txt;
      if (onProgress && parseProgress) {
        const pct = parseProgress(txt, errBuf);
        if (pct !== null) onProgress(pct);
      }
    });

    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(errBuf.slice(-300)));
    });
    proc.on('error', reject);
  });
}

// ffmpeg progress parser — returns 0–100 or null
function ffmpegProgress(chunk, totalBuf) {
  // Get duration from buffer
  const durMatch = totalBuf.match(/Duration:\s*(\d+):(\d+):(\d+)/);
  const timeMatch = chunk.match(/time=(\d+):(\d+):(\d+)/);
  if (!durMatch || !timeMatch) return null;
  const total = parseInt(durMatch[1])*3600 + parseInt(durMatch[2])*60 + parseInt(durMatch[3]);
  const cur   = parseInt(timeMatch[1])*3600 + parseInt(timeMatch[2])*60 + parseInt(timeMatch[3]);
  if (total <= 0) return null;
  return Math.min(99, Math.round(cur / total * 100));
}

async function convert(filePath, targetFormat, outputFolder, quality, onProgress) {
  const ext  = getExt(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  let outName, outPath, cmd, args;

  const fp = (name, fmt) => {
    outName = `${name}.${fmt}`;
    outPath = path.join(outputFolder, outName);
    return outPath;
  };

  // ── Tool actions ──────────────────────────────────────────────
  if (targetFormat === '__compress__') {
    outPath = fp(`${base}_compressed`, ext === 'jpg' ? 'jpg' : 'png');
    await run('convert', [filePath, '-quality', String(quality), outPath], { onProgress: p => onProgress(p) });
    return outPath;
  }

  if (targetFormat === '__resize50__') {
    outPath = fp(`${base}_50pct`, ext);
    await run('convert', [filePath, '-resize', '50%', outPath], { onProgress: p => onProgress(p) });
    return outPath;
  }

  if (targetFormat === '__resize25__') {
    outPath = fp(`${base}_25pct`, ext);
    await run('convert', [filePath, '-resize', '25%', outPath], { onProgress: p => onProgress(p) });
    return outPath;
  }

  if (targetFormat === '__gray__') {
    outPath = fp(`${base}_gray`, ext);
    await run('convert', [filePath, '-colorspace', 'Gray', outPath], { onProgress: p => onProgress(p) });
    return outPath;
  }

  if (targetFormat === '__rotate90__') {
    outPath = fp(`${base}_rotated`, ext);
    await run('convert', [filePath, '-rotate', '90', outPath], { onProgress: p => onProgress(p) });
    return outPath;
  }

  if (targetFormat === '__extractaudio__') {
    outPath = fp(`${base}_audio`, 'mp3');
    await run('ffmpeg', ['-y', '-i', filePath, '-vn', '-q:a', '2', outPath], {
      onProgress, parseProgress: ffmpegProgress
    });
    return outPath;
  }

  if (targetFormat === '__trim__') {
    // Trim first 30s as default — settings window can customize later
    outPath = fp(`${base}_trim`, ext);
    const isVid = VIDEOS.includes(ext);
    await run('ffmpeg', ['-y', '-i', filePath, '-t', '30', '-c', 'copy', outPath], {
      onProgress, parseProgress: ffmpegProgress
    });
    return outPath;
  }

  if (targetFormat === '__pdf2img__' || targetFormat === '__pdf2img_jpg__') {
    const fmt = targetFormat === '__pdf2img_jpg__' ? 'jpg' : 'png';
    const pagesDir = path.join(outputFolder, `${base}_pages`);
    fs.mkdirSync(pagesDir, { recursive: true });
    await run('convert', ['-density', '150', filePath, path.join(pagesDir, `page-%03d.${fmt}`)], {
      onProgress: p => onProgress(p)
    });
    return pagesDir;
  }

  if (targetFormat === '__pdf2docx__') {
    outPath = fp(base, 'docx');
    // libreoffice converts pdf→docx reasonably well
    await run('libreoffice', ['--headless', '--convert-to', 'docx', '--outdir', outputFolder, filePath], {
      onProgress: p => onProgress(p)
    });
    return outPath;
  }

  if (targetFormat === '__pdf2txt__') {
    outPath = fp(base, 'txt');
    await run('pdftotext', [filePath, outPath], { onProgress: p => onProgress(p) });
    return outPath;
  }

  if (targetFormat === '__pdfcompress__') {
    outPath = fp(`${base}_compressed`, 'pdf');
    await run('gs', [
      '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4',
      '-dPDFSETTINGS=/ebook', '-dNOPAUSE', '-dQUIET', '-dBATCH',
      `-sOutputFile=${outPath}`, filePath
    ], { onProgress: p => onProgress(p) });
    return outPath;
  }

  if (targetFormat === '__pdfmerge__') {
    // Merge: output a note — user needs to drop multiple files
    // For now merge with a second file picker via gs
    outPath = fp(`${base}_merged`, 'pdf');
    // We can only merge one file without a picker; signal UI to show instruction
    throw new Error('To merge PDFs: hold Ctrl and drag multiple PDF files onto the drop zone (coming soon)');
  }

  if (targetFormat === '__pdfsplit__') {
    // Split each page into its own PDF
    const splitDir = path.join(outputFolder, `${base}_split`);
    fs.mkdirSync(splitDir, { recursive: true });
    await run('convert', ['-density', '150', filePath, path.join(splitDir, 'page-%03d.pdf')], {
      onProgress: p => onProgress(p)
    });
    return splitDir;
  }

  if (targetFormat === '__extract__') {
    const extractDir = path.join(outputFolder, base);
    fs.mkdirSync(extractDir, { recursive: true });
    if (ext === 'zip') {
      await run('unzip', ['-o', filePath, '-d', extractDir]);
    } else if (ext === '7z') {
      await run('7z', ['x', filePath, `-o${extractDir}`, '-y']);
    } else if (ext === 'rar') {
      await run('unrar', ['x', '-y', filePath, extractDir]);
    } else {
      await run('tar', ['-xf', filePath, '-C', extractDir]);
    }
    onProgress(100);
    return extractDir;
  }

  if (targetFormat === '__repack_zip__') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tang-'));
    if (ext === 'zip') await run('unzip', ['-o', filePath, '-d', tmp]);
    else               await run('tar', ['-xf', filePath, '-C', tmp]);
    outPath = fp(`${base}`, 'zip');
    await run('bash', ['-c', `cd "${tmp}" && zip -r "${outPath}" .`]);
    fs.rmSync(tmp, { recursive: true, force: true });
    onProgress(100);
    return outPath;
  }

  if (targetFormat === '__repack_targz__') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tang-'));
    if (ext === 'zip') await run('unzip', ['-o', filePath, '-d', tmp]);
    else               await run('tar', ['-xf', filePath, '-C', tmp]);
    outPath = fp(`${base}`, 'tar.gz');
    await run('tar', ['-czf', outPath, '-C', tmp, '.']);
    fs.rmSync(tmp, { recursive: true, force: true });
    onProgress(100);
    return outPath;
  }

  if (targetFormat === '__repack_7z__') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tang-'));
    if (ext === 'zip') await run('unzip', ['-o', filePath, '-d', tmp]);
    else               await run('tar', ['-xf', filePath, '-C', tmp]);
    outPath = fp(`${base}`, '7z');
    await run('7z', ['a', outPath, `${tmp}/*`]);
    fs.rmSync(tmp, { recursive: true, force: true });
    onProgress(100);
    return outPath;
  }

  // ── Format conversions ────────────────────────────────────────
  outPath = fp(`${base}`, targetFormat);

  if (IMAGES.includes(ext)) {
    await run('convert', [filePath, outPath], { onProgress: p => onProgress(p) });
  } else if (VIDEOS.includes(ext) || AUDIO.includes(ext)) {
    await run('ffmpeg', ['-y', '-i', filePath, outPath], {
      onProgress, parseProgress: ffmpegProgress
    });
  } else if (ext === 'pdf') {
    await run('libreoffice', ['--headless', '--convert-to', targetFormat, '--outdir', outputFolder, filePath], {
      onProgress: p => onProgress(p)
    });
  } else {
    await run('libreoffice', ['--headless', '--convert-to', targetFormat, '--outdir', outputFolder, filePath], {
      onProgress: p => onProgress(p)
    });
  }

  return outPath;
}

module.exports = { getOptions, convert, IMAGES, VIDEOS, AUDIO, DOCS, ARCHIVES };
