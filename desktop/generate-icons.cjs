const fs = require('node:fs/promises');
const path = require('node:path');
const pngToIcoModule = require('png-to-ico');
const { PNG } = require('pngjs');
const pngToIco = pngToIcoModule.default ?? pngToIcoModule;

const repoRoot = path.resolve(__dirname, '..');
const sourcePng = 'C:\\Users\\schmichr\\OneDrive - WWT\\Documents\\mastercontrol\\red_lines_mc_face.png';
const assetDir = path.join(repoRoot, 'desktop', 'assets');
const targetPng = path.join(assetDir, 'icon.png');
const targetIco = path.join(assetDir, 'icon.ico');

async function main() {
  await fs.access(sourcePng);
  await fs.mkdir(assetDir, { recursive: true });

  const sourceBuffer = await fs.readFile(sourcePng);
  const sourceImage = PNG.sync.read(sourceBuffer);
  const size = Math.max(sourceImage.width, sourceImage.height);
  const squareImage = new PNG({ width: size, height: size });
  const offsetX = Math.floor((size - sourceImage.width) / 2);
  const offsetY = Math.floor((size - sourceImage.height) / 2);

  for (let y = 0; y < sourceImage.height; y += 1) {
    for (let x = 0; x < sourceImage.width; x += 1) {
      const sourceIndex = ((sourceImage.width * y) + x) << 2;
      const targetIndex = ((size * (y + offsetY)) + (x + offsetX)) << 2;
      squareImage.data[targetIndex] = sourceImage.data[sourceIndex];
      squareImage.data[targetIndex + 1] = sourceImage.data[sourceIndex + 1];
      squareImage.data[targetIndex + 2] = sourceImage.data[sourceIndex + 2];
      squareImage.data[targetIndex + 3] = sourceImage.data[sourceIndex + 3];
    }
  }

  await fs.writeFile(targetPng, PNG.sync.write(squareImage));

  const ico = await pngToIco(targetPng);
  await fs.writeFile(targetIco, ico);
  console.log(`[desktop] wrote ${path.relative(repoRoot, targetPng)} and ${path.relative(repoRoot, targetIco)}`);
}

main().catch((err) => {
  console.error('[desktop] icon generation failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
