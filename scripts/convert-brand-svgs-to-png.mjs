import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    inputDir: path.resolve(__dirname, '../docs-website/brand'),
    maxPx: 2048,
    overwrite: true,
  };

  let i = 2;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--input' || arg === '-i') {
      const value = argv[i + 1];
      if (!value) throw new Error(`Missing value for ${arg}`);
      args.inputDir = path.resolve(process.cwd(), value);
      i += 2;
    } else if (arg === '--max' || arg === '-m') {
      const valueStr = argv[i + 1];
      if (!valueStr) throw new Error(`Missing value for ${arg}`);
      const value = Number(valueStr);
      if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid --max value');
      args.maxPx = Math.floor(value);
      i += 2;
    } else if (arg === '--no-overwrite') {
      args.overwrite = false;
      i += 1;
    } else {
      throw new Error(`Unknown arg: ${arg}`);
    }
  }

  return args;
}

function getFitTo(svgText, maxPx) {
  // Prefer viewBox because many brand SVGs omit explicit width/height.
  // Example: viewBox="0 0 512 512".
  const viewBoxMatch = svgText.match(
    /viewBox\s*=\s*"\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s*"/i
  );

  if (!viewBoxMatch) {
    return { mode: 'width', value: maxPx };
  }

  const vbWidth = Number(viewBoxMatch[3]);
  const vbHeight = Number(viewBoxMatch[4]);

  if (Number.isFinite(vbWidth) && Number.isFinite(vbHeight) && vbWidth > 0 && vbHeight > 0) {
    return {
      mode: vbWidth >= vbHeight ? 'width' : 'height',
      value: maxPx,
    };
  }

  // Fallback: just fit to max width.
  return { mode: 'width', value: maxPx };
}

async function fileExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { inputDir, maxPx, overwrite } = parseArgs(process.argv);

  const entries = await readdir(inputDir, { withFileTypes: true });
  const svgFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.svg'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  if (svgFiles.length === 0) {
    throw new Error(`No .svg files found in: ${inputDir}`);
  }

  let converted = 0;
  let skipped = 0;

  for (const svgName of svgFiles) {
    const svgPath = path.join(inputDir, svgName);
    const pngName = svgName.replace(/\.svg$/i, '.png');
    const pngPath = path.join(inputDir, pngName);

    if (!overwrite && (await fileExists(pngPath))) {
      skipped += 1;
      continue;
    }

    const svgText = await readFile(svgPath, 'utf8');
    const fitTo = getFitTo(svgText, maxPx);

    const resvg = new Resvg(svgText, {
      fitTo,
      // Transparent background by default; keep it that way.
      font: {
        loadSystemFonts: true,
      },
    });

    const rendered = resvg.render();
    const pngBuffer = rendered.asPng();
    await writeFile(pngPath, pngBuffer);

    converted += 1;
  }

  process.stdout.write(
    `Converted ${converted} SVG(s) to PNG in ${inputDir} (max ${maxPx}px). Skipped ${skipped}.\n`
  );
}

try {
  await main();
} catch (err) {
  process.stderr.write(`${err?.stack ?? String(err)}\n`);
  process.exitCode = 1;
}
