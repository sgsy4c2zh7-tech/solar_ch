// scripts/boulder_fetch.js
// Usage: node scripts/boulder_fetch.js
// Requires: Node 18+ (fetch available)

import fs from "fs";
import path from "path";

const BASE = "https://www.ngdc.noaa.gov/stp/space-weather/solar-data/solar-imagery/composites/full-sun-drawings/boulder";

function ensureDir(p){ fs.mkdirSync(p, { recursive:true }); }

function ymdParts(ymd){
  return { y: ymd.slice(0,4), m: ymd.slice(4,6), d: ymd.slice(6,8) };
}

async function fetchText(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.text();
}

async function fetchBin(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

function pickLatestForDate(html, ymd){
  // pick max HHMM for boul_neutl_fd_YYYYMMDD_HHMM.jpg
  const re = new RegExp(`boul_neutl_fd_${ymd}_(\\d{4})\\.jpg`, "g");
  let m, best = null;
  while((m = re.exec(html)) !== null){
    const hhmm = parseInt(m[1], 10);
    if(best === null || hhmm > best.hhmm){
      best = { hhmm, filename: `boul_neutl_fd_${ymd}_${m[1]}.jpg` };
    }
  }
  return best; // or null
}

async function main(){
  const manifestPath = path.join("docs", "manifest.json");
  if(!fs.existsSync(manifestPath)){
    throw new Error(`Missing ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  if(!manifest.frames || !Array.isArray(manifest.frames)){
    throw new Error("manifest.json has no frames[]");
  }

  // 必要な日付（source date として使うので frames[].date を集める）
  const dates = Array.from(new Set(manifest.frames.map(f => f.date))).sort();

  const outDir = path.join("docs", "boulder");
  ensureDir(outDir);

  for(const ymd of dates){
    const outFile = path.join(outDir, `${ymd}.jpg`);
    if(fs.existsSync(outFile)) continue;

    const { y, m } = ymdParts(ymd);
    const dirUrl = `${BASE}/${y}/${m}/`;

    console.log(`[Boulder] ${ymd} -> ${dirUrl}`);

    const html = await fetchText(dirUrl);
    const best = pickLatestForDate(html, ymd);
    if(!best){
      console.warn(`  - Not found in directory listing: ${ymd}`);
      continue;
    }

    const fileUrl = `${dirUrl}${best.filename}`;
    console.log(`  - download ${best.filename}`);

    const buf = await fetchBin(fileUrl);
    fs.writeFileSync(outFile, buf);
  }

  // keep file (optional)
  const keep = path.join(outDir, ".keep");
  if(!fs.existsSync(keep)) fs.writeFileSync(keep, "");
  console.log("Done.");
}

main().catch(e=>{
  console.error(e);
  process.exit(1);
});
