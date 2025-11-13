# TecToExcelTool.ps1
# TEC グリッド → Excel ヒートマップ変換用ローカルサイト

# 一時フォルダに HTML を作成
$folder = Join-Path $env:TEMP "TecToExcelTool"
if (-not (Test-Path $folder)) {
    New-Item -Path $folder -ItemType Directory | Out-Null
}
$htmlPath = Join-Path $folder "index.html"

# ここからHTML本体
$html = @'
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>TEC → Excel ヒートマップ変換</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 16px;
      line-height: 1.5;
    }
    textarea {
      width: 100%;
      min-height: 200px;
      box-sizing: border-box;
      font-family: "Consolas", "Courier New", monospace;
      font-size: 12px;
      margin-top: 4px;
    }
    .row {
      margin: 8px 0;
    }
    fieldset {
      margin-top: 8px;
    }
    button {
      padding: 8px 16px;
      margin-top: 8px;
      cursor: pointer;
    }
    label {
      margin-right: 12px;
    }
  </style>
</head>
<body>
  <h1>TEC グリッド → Excel ヒートマップ変換</h1>

  <p>
    上のテキストボックスに、Bureau of Meteorology などから取得した
    <strong>lat/lon 形式のCSV</strong> をそのまま貼り付けてください。
  </p>

  <div class="row">
    <label for="inputData"><strong>① 入力データ（lat/lon CSV）</strong></label>
    <textarea id="inputData" placeholder="ここにTECのCSVを貼り付け"></textarea>
  </div>

  <fieldset>
    <legend>② 軸設定</legend>
    <div class="row">
      <label><input type="radio" name="orientation" value="lon-x" checked>
        経度を横軸（列）、緯度を縦軸（行）</label>
      <label><input type="radio" name="orientation" value="lat-x">
        緯度を横軸（列）、経度を縦軸（行）</label>
    </div>
    <div class="row">
      <label>
        中心経度：
        <input type="number" id="centerLon" value="140" step="0.1" style="width:80px;">
        °E を中心に回転
      </label>
      <label>
        <input type="checkbox" id="rotateEnabled" checked>
        日本中心に回転する
      </label>
    </div>
  </fieldset>

  <div class="row">
    <button id="convertBtn">③ 変換する</button>
    <button id="copyBtn">結果をコピー</button>
  </div>

  <div class="row">
    <label for="outputData"><strong>④ 出力データ（Excelにコピペ）</strong></label>
    <textarea id="outputData" placeholder="ここに変換結果が表示されます"></textarea>
  </div>

  <script>
    function parseCSV(text) {
      const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
      if (!lines.length) throw new Error("入力が空です");
      return lines.map(line => line.split(",").map(c => c.trim()));
    }

    function rotateByStartIndex1D(arr, startIdx) {
      const L = arr.length;
      return arr.slice(startIdx).concat(arr.slice(0, startIdx));
    }

    function rotateColumns(grid, startIdx) {
      const rows = grid.length;
      const cols = grid[0].length;
      const out = [];
      for (let r = 0; r < rows; r++) {
        const row = grid[r];
        out[r] = row.slice(startIdx).concat(row.slice(0, startIdx));
      }
      return out;
    }

    function rotateRows(grid, startIdx) {
      return grid.slice(startIdx).concat(grid.slice(0, startIdx));
    }

    document.getElementById("convertBtn").addEventListener("click", () => {
      try {
        const raw = document.getElementById("inputData").value;
        const orientation = document.querySelector("input[name='orientation']:checked").value;
        const centerLon = parseFloat(document.getElementById("centerLon").value);
        const rotateEnabled = document.getElementById("rotateEnabled").checked;

        if (!raw.trim()) {
          alert("入力データが空です。TECのCSVを貼り付けてください。");
          return;
        }

        const data = parseCSV(raw);

        // 先頭行: 経度
        const lonList = data[0].slice(1).map(Number);
        // 以降の行: 緯度 & TEC
        const latList = data.slice(1).map(row => Number(row[0]));
        const values = data.slice(1).map(row => row.slice(1).map(Number));

        const nLat = latList.length;
        const nLon = lonList.length;

        let axisX, axisY, grid;

        if (orientation === "lon-x") {
          // 経度 = 横軸（列）、緯度 = 縦軸（行）
          axisX = lonList.slice();
          axisY = latList.slice();
          grid = values.map(row => row.slice());
        } else {
          // 緯度 = 横軸（列）、経度 = 縦軸（行）→ 転置
          axisX = latList.slice();
          axisY = lonList.slice();
          grid = [];
          for (let lonIdx = 0; lonIdx < nLon; lonIdx++) {
            const row = [];
            for (let latIdx = 0; latIdx < nLat; latIdx++) {
              row.push(values[latIdx][lonIdx]);
            }
            grid.push(row);
          }
        }

        // 経度の回転（日本中心）
        if (rotateEnabled && !Number.isNaN(centerLon)) {
          const targetStart = centerLon - 180; // 例: 140 -> -40 から開始
          const lonArray = (orientation === "lon-x") ? axisX : axisY;

          let startIdx = -1;
          for (let i = 0; i < lonArray.length; i++) {
            if (Math.abs(lonArray[i] - targetStart) < 1e-6) {
              startIdx = i;
              break;
            }
          }

          if (startIdx >= 0) {
            if (orientation === "lon-x") {
              axisX = rotateByStartIndex1D(axisX, startIdx);
              grid = rotateColumns(grid, startIdx);
            } else {
              axisY = rotateByStartIndex1D(axisY, startIdx);
              grid = rotateRows(grid, startIdx);
            }
          } else {
            console.warn("指定した中心経度に対応する開始点が見つかりませんでした。回転をスキップします。");
          }
        }

        // CSV 出力
        let lines = [];
        if (orientation === "lon-x") {
          lines.push(["lat/lon"].concat(axisX).join(","));
          for (let r = 0; r < axisY.length; r++) {
            const line = [axisY[r]].concat(grid[r]);
            lines.push(line.join(","));
          }
        } else {
          lines.push(["lon/lat"].concat(axisX).join(","));
          for (let r = 0; r < axisY.length; r++) {
            const line = [axisY[r]].concat(grid[r]);
            lines.push(line.join(","));
          }
        }

        document.getElementById("outputData").value = lines.join("\n");
      } catch (e) {
        console.error(e);
        alert("変換中にエラーが発生しました: " + e.message);
      }
    });

    document.getElementById("copyBtn").addEventListener("click", () => {
      const out = document.getElementById("outputData");
      out.focus();
      out.select();
      try {
        document.execCommand("copy");
      } catch (e) {
        // うまく行かないブラウザもあるので、その場合は手動でコピー
      }
    });
  </script>
</body>
</html>
'@

# HTMLを書き出し（UTF-8）
Set-Content -Path $htmlPath -Value $html -Encoding UTF8

Write-Host "ローカルサイトを開きます: $htmlPath"
# 既定ブラウザで開く
Start-Process $htmlPath
