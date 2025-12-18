/**
 * Fetch AIA 193 full-disk PNGs from Helioviewer and write to docs/imgs/
 * Then generate docs/manifest.json for ±27 day slider with 27-day proxy.
 *
 * Uses takeScreenshot with display=true (binary PNG).  :contentReference[oaicite:2]{index=2}
 */
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(process.cwd(), "docs");
const IMG_DIR = path.join(OUT_DIR, "imgs");
fs.mkdirSync(IMG_DIR, { recursive: true });

function ymd(d){
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth()+1).padStart(2,"0");
  const dd = String(d.getUTCDate()).padStart(2,"0");
  return `${yyyy}${mm}${dd}`;
}
function isoNoon(d){
  // その日の12:00Zを代表時刻に（「日ごと」運用なので固定でOK）
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
  return dt.toISOString().replace(".000Z","Z");
}

async function fetchPng(dateISO, outPath){
  // Full-diskをだいたい収める viewport（arcsec座標）＋AIA193
  // layers=[SDO,AIA,AIA,193,1,100] 形式はドキュメント例に準拠。 :contentReference[oaicite:3]{index=3}
  const params = new URLSearchParams({
    date: dateISO,
    imageScale: "2.4",
    layers: "[SDO,AIA,AIA,193,1,100]",
    x1: "-1200",
    x2: "1200",
    y1: "-1200",
    y2: "1200",
    display: "true",
    watermark: "false",
    // scale / labelsは不要なら外してOK
    scale: "false"
  });

  const url = `https://api.helioviewer.org/v2/takeScreenshot/?${params.toString()}`;
  const res = await fetch(url, { redirect: "follow" });
  if(!res.ok){
    const t = await res.text().catch(()=> "");
    throw new Error(`HTTP ${res.status} ${res.statusText} :: ${t.slice(0,200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return buf.length;
}

function buildManifest(latestYMD){
  const latest = new Date(Date.UTC(
    Number(latestYMD.slice(0,4)),
    Number(latestYMD.slice(4,6))-1,
    Number(latestYMD.slice(6,8)),
    0,0,0
  ));

  const frames = [];
  // observed: -27..0
  for(let o=-27; o<=0; o++){
    const d = new Date(latest);
    d.setUTCDate(d.getUTCDate() + o);
    frames.push({ date: ymd(d), offset: o, type: "observed" });
  }
  // forecast(proxy): +1..+27 uses (offset-27) day image
  for(let o=1; o<=27; o++){
    const d = new Date(latest);
    d.setUTCDate(d.getUTCDate() + (o-27));
    frames.push({ date: ymd(d), offset: o, type: "forecast" });
  }

  return { latest: latestYMD, frames };
}

async function main(){
  // latest = UTC “今日” を最新日扱い（必要なら固定も可）
  const latest = new Date();
  const latestUTC = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth(), latest.getUTCDate(), 0,0,0));
  const latestYMD = ymd(latestUTC);

  // 画像は最新日から過去27日（計28枚）だけ保存
  console.log("latest:", latestYMD);
  for(let i=0; i<=27; i++){
    const d = new Date(latestUTC);
    d.setUTCDate(d.getUTCDate() - i);
    const file = path.join(IMG_DIR, `${ymd(d)}.png`);
    const iso = isoNoon(d);

    // 既にあればスキップ（無駄な負荷回避：takeScreenshotは重いのでキャッシュ推奨） :contentReference[oaicite:4]{index=4}
    if(fs.existsSync(file)){
      console.log("skip", path.basename(file));
      continue;
    }

    console.log("fetch", ymd(d), iso);
    const n = await fetchPng(iso, file);
    console.log(" saved", path.basename(file), n, "bytes");
  }

  // manifest生成（±27表示用）
  const manifest = buildManifest(latestYMD);
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  console.log("manifest.json written");
}

main().catch(e=>{
  console.error(e);
  process.exit(1);
});

