const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR  = path.join(os.homedir(), '.config', 'tangerine');
const CONFIG_FILE = path.join(CONFIG_DIR, 'settings.json');
const DEFAULT_OUT = path.join(os.homedir(), 'Desktop');

const DEFAULTS = {
  outputFolder: DEFAULT_OUT,
  imageQuality: 75,
  autoOpen: false,
  theme: 'auto'   // 'auto' | 'light' | 'dark'
};

function load() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch (_) {}
  return { ...DEFAULTS };
}

function save(data) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Settings save failed:', e.message);
  }
}

function ensureOutputFolder(folder) {
  try { fs.mkdirSync(folder, { recursive: true }); } catch (_) {}
}

module.exports = { load, save, ensureOutputFolder };
