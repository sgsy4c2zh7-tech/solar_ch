// scripts/boulder_fetch.js
// Fetch NOAA/NGDC Boulder full-sun drawings (synoptic) and save to docs/boulder/YYYYMMDD.png
// Node 18+ (Node 20 recommended)

const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(process.cwd(), "docs", "boulder");
fs.mkdirSync(OUT_DIR, { recursive: true });

// 取得したい日数（manifest の observed 期間と合わせるなら 28日とか）
const DAYS = 28;

// NGDCのページ（ここから直接画像URLを決め打ちする方式だと失敗しやすいので、まずHTMLを取る）
const BASE_PAGE =
  "https://www.ngdc.noaa.gov/stp/space-weather/solar-data/solar-imagery/composites/full-sun-drawings/boulder/";

function ymdUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchText(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.text();
}

async function fetchBin(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf;
}

// ページHTMLから「日付っぽい画像リンク」を探す（jpg/png/gifなど何でも）
function findImageUrlForDate(html, ymd) {
  // ありがちなパターンを広めに拾う（ymd を含むファイル名）
  // 例: ...20251222....png / ...20251222....jpg など
  const re = new RegExp(`href="([^"]*${ymd}[^"]*\\.(?:png|jpg|jpeg|gif))"`, "ig");
  const m = re.exec(html);
  if (!m) return null;

  let href = m[1];
  // 相対→絶対
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return "https://www.ngdc.noaa.gov" + href;
  return BASE_PAGE + href;
}

(async () => {
  console.log("[boulder_fetch] Fetch index page:", BASE_PAGE);
  const html = await fetchText(BASE_PAGE);

  let okCount = 0;
  let failCount = 0;

  for (let i = 0; i < DAYS; i++) {
    const d = new Date(Date.now() - i * 86400 * 1000);
    const ymd = ymdUTC(d);

    const imgUrl = findImageUrlForDate(html, ymd);
    if (!imgUrl) {
      console.warn(`[boulder_fetch] No image link found in page for ${ymd}`);
      failCount++;
      continue;
    }

    const outPath = path.join(OUT_DIR, `${ymd}.png`);

    try {
      console.log(`[boulder_fetch] ${ymd} -> ${imgUrl}`);
      const bin = await fetchBin(imgUrl);

      // 元がjpgでも、とりあえず .png で保存すると中身と拡張子がズレるので、
      // ここでは「拡張子を保持」したいなら outPath を変えるべき。
      // ただ、あなたのHTMLが .png 前提なので、ここでは“ファイル名”を .png に固定しつつ、
      // 中身はそのまま保存する（ブラウザは大抵表示できる）
      fs.writeFileSync(outPath, bin);
      okCount++;
    } catch (e) {
      console.error(`[boulder_fetch] FAILED ${ymd}:`, e.message);
      failCount++;
    }
  }

  console.log(`[boulder_fetch] done. ok=${okCount} fail=${failCount}`);

  // 1枚も取れないのは何か壊れてるのでCI落とす
  if (okCount === 0) {
    throw new Error("No Boulder synoptic images were downloaded.");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
