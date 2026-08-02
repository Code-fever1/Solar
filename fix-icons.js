const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const src = 'assets/images/meter.png';
const outDir = 'android/app/src/main/res';

const sizes = {
  'mdpi': 48,
  'hdpi': 72,
  'xhdpi': 96,
  'xxhdpi': 144,
  'xxxhdpi': 192
};

async function processIcons() {
  try {
    for (const [density, size] of Object.entries(sizes)) {
      const dir = path.join(outDir, `mipmap-${density}`);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      
      await sharp(src)
        .resize(size, size)
        .webp({ quality: 80 })
        .toFile(path.join(dir, 'ic_launcher.webp'));
        
      await sharp(src)
        .resize(size, size)
        .webp({ quality: 80 })
        .toFile(path.join(dir, 'ic_launcher_round.webp'));
        
      await sharp(src)
        .resize(size, size)
        .webp({ quality: 80 })
        .toFile(path.join(dir, 'ic_launcher_foreground.webp'));
        
      const pngs = ['ic_launcher.png', 'ic_launcher_foreground.png', 'ic_launcher_round.png'];
      for (const p of pngs) {
        const f = path.join(dir, p);
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    }
    
    // Handle anydpi-v26 separately if needed (usually 108x108 for foreground)
    const anyDpiDir = path.join(outDir, 'mipmap-anydpi-v26');
    if (fs.existsSync(anyDpiDir)) {
      await sharp(src)
        .resize(108, 108)
        .webp({ quality: 80 })
        .toFile(path.join(anyDpiDir, 'ic_launcher_foreground.webp'));
        
      const pngs = ['ic_launcher.png', 'ic_launcher_foreground.png', 'ic_launcher_round.png'];
      for (const p of pngs) {
        const f = path.join(anyDpiDir, p);
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    }
    
    console.log('Successfully generated webp icons');
  } catch(e) {
    console.error('Error generating icons:', e);
  }
}

processIcons();
