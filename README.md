# 薬剤原価管理（原価確認アプリ）

動物病院向けの原価・最安値確認PWA。各業者の**納品書**をiPhoneで撮影、またはPDFを読み込ませると、
Gemini OCRで品目を特定し、Googleスプレッドシートに蓄積した価格と比較します。
**最安値より高く購入している品目をアラート**し、**最安値価格表をPDF出力**できます。

受付など複数端末で同じデータを共有できるよう、GitHub Pagesでホストします。

---

## 機能

- 📥 **納品書の読み取り** — 写真/PDF → OCR → マスター照合 → 単価を登録
- ⚠️ **最安値アラート** — 全業者の最安値より高く購入した品目を警告（「問い合わせ済み」にするまで保持）
- 📊 **業者間比較・削減試算** — 同一品目の業者別価格、最安切替で削減できる額
- 🖨 **最安値価格表PDF** — 全品目の最安単価・最安業者を一覧し、印刷→PDF保存
- 💊 値上げ通知書 / 在庫一覧の読み取りにも対応

---

## 初期セットアップ（端末ごとに1回）

1. アプリのURL（GitHub Pages）を開く。
2. 初回設定画面で以下を入力：
   - **Gemini APIキー**（[Google AI Studio](https://aistudio.google.com/apikey) で取得）
   - **Google Sheets APIキー**（同じGCPプロジェクトでSheets APIを有効化すれば同じキーでも可）
   - **スプレッドシートID**（スプレッドシートURLの `/d/` と `/edit` の間の文字列）
3. 入力したキーは各端末の `localStorage` に保存され、リポジトリには含まれません。

> スプレッドシートは「リンクを知っている全員」→「編集者」に共有設定してください。
> 書き込みはGAS Web App（`js/config.js` の `GAS_WEB_APP_URL`）経由で行います。

### スプレッドシートの5シート

| シート名 | 1行目ヘッダー |
|---|---|
| 薬品マスター | ID, 薬品名, 成分名, 規格, カテゴリ, 単位, 登録日, 備考 |
| 業者マスター | ID, 業者名, 電話番号, 担当者名, 備考 |
| 価格テーブル | ID, 薬品ID, 業者ID, 単価, 税込フラグ, 有効開始日, 登録日, ソース, 備考 |
| 成分グループ | 成分名, 薬品IDリスト |
| アラート | ID, 種別, 薬品ID, 業者ID, 基準価格, 新価格, 上昇率, 代替候補, 適用日, 作成日時, 確認済み, 確認日時 |

アラート（最安値より高く購入・値上がりの未確認リスト）もスプレッドシートに保存されるため、
「問い合わせ済み」の状態は**全端末で同期**されます。

---

## 既存データ（Numbers）の移行

`stockfile_***.numbers` の価格表を上記3マスターのCSVに変換します。

```bash
pip3 install numbers-parser
python3 tools/migrate_numbers.py /path/to/stockfile.numbers
# → tools/out/ に 薬品マスター.csv / 業者マスター.csv / 価格テーブル.csv / 成分グループ.csv を生成
```

各CSVをGoogleスプレッドシートの対応シートに取り込みます（ファイル → インポート → アップロード →
「現在のシートを置換」）。生成CSVには院内の価格データが含まれるため、リポジトリには含めません（`.gitignore` 済み）。

---

## ローカルで動かす

```bash
python3 -m http.server 8080
# ブラウザで http://localhost:8080
```

---

## GitHub Pages で公開

```bash
git init && git add -A && git commit -m "init"
gh repo create genka-app --public --source=. --push   # gh未認証なら先に: gh auth login
```

GitHub のリポジトリ → **Settings → Pages** で Branch を `main` / `/ (root)` にして保存。
数分後に発行されるURL（`https://<ユーザー名>.github.io/genka-app/`）を受付など各端末で開きます。

> `js/config.js` のAPIキーはプレースホルダのままコミットしてください（実キーは各端末で入力）。

---

## 構成

```
index.html          画面の骨組み + スクリプト読み込み
css/style.css       スタイル（@media print に印刷用CSS）
sw.js               Service Worker（PWA / オフライン）
manifest.json       PWA マニフェスト
js/
  config.js              APIキー・シート名などの設定
  gemini.js              Gemini OCR（納品書/在庫一覧/値上げ通知書プロンプト）
  ocr-service.js         OCR結果のマスター照合
  ocr-result-view.js     読み取り結果の確認・登録（納品書アラート判定）
  price-service.js       価格データ・最安値算出
  price-alert-service.js 値上がり / 最安値より高く購入 アラート
  compare-service.js     業者間・成分間の比較
  order-view.js          発注推奨・削減試算・問い合わせリスト
  price-list-view.js     最安値価格表（PDF出力）
  ...
tools/
  migrate_numbers.py     Numbers → マスターCSV 変換
```
