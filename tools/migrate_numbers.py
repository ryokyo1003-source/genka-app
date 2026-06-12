#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Numbers（stockfile）→ Googleスプレッドシート移行スクリプト
------------------------------------------------------------
薬効分類別の各シートから「項目/容量/価格/単価/業者/備考」を読み取り、
アプリが参照する3つのマスター（薬品/業者/価格）をCSVで出力する。

主な正規化:
  - 業者の「・」「、」区切りを分解 → 各業者ぶんの価格行を生成
  - 業者名の表記ゆれを統一（MP=MPアグロ、裕和=裕和薬品 等）
  - 区切り無しで連結された業者名（アスコ裕和薬品 等）を手動マップで分解
  - 薬品の重複排除（薬品名＋規格でユニーク化）
  - 単価が空なら価格を暫定単価として採用（備考に「単価未入力(要確認)」）

使い方:
  python3 tools/migrate_numbers.py [Numbersファイルのパス]
出力:
  tools/out/薬品マスター.csv / 業者マスター.csv / 価格テーブル.csv / 成分グループ.csv
"""
import sys, os, csv, re, unicodedata, warnings
warnings.filterwarnings("ignore")
from numbers_parser import Document

# ── 入出力パス ──────────────────────────────────────────────
DEFAULT_SRC = "/Users/ryokyoyamazaki/Downloads/stockfile_16180874+(1).numbers"
SRC = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(OUT_DIR, exist_ok=True)

# ── 業者名の正規化 ──────────────────────────────────────────
# 区切り無しで連結された業者名を先に分解（完全一致）
GLUED = {
    "アスコ裕和薬品": ["アスコ", "裕和薬品"],
    "裕和薬品アスコ": ["裕和薬品", "アスコ"],
}
# 表記ゆれ → 正式名称
ALIAS = {
    "mp": "MPアグロ", "ｍｐ": "MPアグロ", "mpアグロ": "MPアグロ", "mpmp": "MPアグロ",
    "裕和": "裕和薬品", "裕和薬品": "裕和薬品",
    "全薬": "日本全薬", "日本全薬": "日本全薬",
    "バードグルーミング": "バードグルーミングショップ",
    "バードグルーミングショップ": "バードグルーミングショップ",
    "シグニ": "シグニ", "cygni": "シグニ",
}
# 業者として無効（ゴミ）な値
GARBAGE_VENDOR = re.compile(r"^[\d.\s]+$")  # 数値のみ等
SEP = re.compile(r"[・、，,/／・]+")

def norm_key(s: str) -> str:
    """エイリアス照合用キー: NFKC正規化＋空白除去＋小文字化"""
    return unicodedata.normalize("NFKC", str(s)).replace(" ", "").strip().lower()

def split_vendors(raw) -> list:
    """業者セル文字列を正規化済み業者名リストに分解"""
    if raw is None:
        return []
    s = str(raw).strip().strip("　")
    if not s or GARBAGE_VENDOR.match(s):
        return []
    if s in GLUED:
        atoms = GLUED[s]
    else:
        atoms = [a.strip().strip("　") for a in SEP.split(s) if a.strip().strip("　")]
    out = []
    for a in atoms:
        if not a or GARBAGE_VENDOR.match(a):
            continue
        canon = ALIAS.get(norm_key(a), a)  # 既知ゆれは統一、未知はそのまま
        if canon not in out:
            out.append(canon)
    return out

# ── カテゴリ（シート名）整形 ────────────────────────────────
def clean_category(sheet_name: str) -> str:
    c = sheet_name.replace("tab.", "")
    c = re.sub(r"^薬[（(]", "", c)
    c = re.sub(r"[）)]$", "", c)
    return c.strip()

# ── 数値クリーニング ────────────────────────────────────────
def to_number(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[¥円,\s　]", "", str(v))
    s = re.sub(r"[^\d.]", "", s)
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None

def fmt_price(n: float) -> str:
    """小数点以下の不要な桁を丸めて文字列化（114.3333→114.33）"""
    r = round(n, 2)
    return str(int(r)) if r == int(r) else str(r)

def med_key(name: str, spec: str) -> str:
    return norm_key(name) + "|" + norm_key(spec or "")

# ── メイン ──────────────────────────────────────────────────
def main():
    doc = Document(SRC)
    medicines = {}      # med_key -> {id,name,spec,category,notes}
    vendors = {}        # canonical name -> id
    price_rows = []     # 価格行（後でID採番）
    price_dedup = {}    # (medId,venId) -> index in price_rows（重複は最安を残す）

    med_seq = 0
    ven_seq = 0
    stats = {"sheets": 0, "src_rows": 0, "price_rows": 0,
             "fallback_unitprice": 0, "skipped_no_price": 0, "skipped_no_name": 0}
    unknown_vendors = set()
    KNOWN = set(["裕和薬品","アスコ","MPアグロ","シグニ","日本全薬","メディセオ",
                 "共立製薬","キリカン","ワールドエクイップス","セントラル科学貿易",
                 "ティアイメディカル","バードグルーミングショップ","ファーレンハイト",
                 "ペピィ","サニメド","太陽メディカル","黒瀬","Ci","FEED"])

    for sheet in doc.sheets:
        category = clean_category(sheet.name)
        for table in sheet.tables:
            rows = table.rows(values_only=True)
            if not rows:
                continue
            stats["sheets"] += 1
            header = [str(c).strip() if c else "" for c in rows[0]]

            def col(*names):
                for nm in names:
                    if nm in header:
                        return header.index(nm)
                return None

            ci_name = col("項目", "品名", "商品名")
            ci_spec = col("容量", "規格")
            ci_price = col("価格")
            ci_unit = col("単価")
            ci_vendor = col("業者", "仕入先")
            ci_notes = col("備考")
            if ci_name is None or ci_vendor is None:
                continue  # 構造が想定外のテーブルはスキップ

            for r in rows[1:]:
                stats["src_rows"] += 1
                name = (str(r[ci_name]).strip() if ci_name is not None and r[ci_name] is not None else "")
                if not name or name in ("項目", "品名"):
                    stats["skipped_no_name"] += 1
                    continue
                spec = (str(r[ci_spec]).strip() if ci_spec is not None and r[ci_spec] is not None else "")

                # 単価優先、無ければ価格を暫定採用
                unit_p = to_number(r[ci_unit]) if ci_unit is not None else None
                pkg_p = to_number(r[ci_price]) if ci_price is not None else None
                fallback = False
                price = unit_p if (unit_p and unit_p > 0) else None
                if price is None and pkg_p and pkg_p > 0:
                    price = pkg_p
                    fallback = True
                if price is None or price <= 0:
                    stats["skipped_no_price"] += 1
                    continue

                vlist = split_vendors(r[ci_vendor])
                if not vlist:
                    vlist = ["不明"]
                for v in vlist:
                    if v != "不明" and v not in KNOWN:
                        unknown_vendors.add(v)

                base_note = (str(r[ci_notes]).strip() if ci_notes is not None and r[ci_notes] is not None else "")

                # 薬品マスター登録
                mk = med_key(name, spec)
                if mk not in medicines:
                    med_seq += 1
                    medicines[mk] = {
                        "id": f"MED-{med_seq:04d}",
                        "name": name, "spec": spec, "category": category, "notes": "",
                    }
                med_id = medicines[mk]["id"]

                for v in vlist:
                    if v not in vendors:
                        ven_seq += 1
                        vendors[v] = f"VEN-{ven_seq:04d}"
                    ven_id = vendors[v]

                    note = base_note
                    if fallback:
                        note = ("単価未入力(価格列を採用/要確認) " + note).strip()
                    stats["fallback_unitprice"] += 1 if fallback else 0

                    key = (med_id, ven_id)
                    rowobj = {
                        "med_id": med_id, "ven_id": ven_id,
                        "price": fmt_price(price), "price_num": price, "note": note,
                    }
                    if key in price_dedup:
                        # 同一(薬品,業者)が重複 → 安い方を残す
                        idx = price_dedup[key]
                        if price < price_rows[idx]["price_num"]:
                            price_rows[idx] = rowobj
                    else:
                        price_dedup[key] = len(price_rows)
                        price_rows.append(rowobj)

    # ── CSV出力 ──────────────────────────────────────────────
    today = ""  # 有効開始日は空（移行ベースライン）。登録日はmigration日を入れる
    import datetime
    reg_date = datetime.date.today().isoformat()

    # 薬品マスター
    with open(os.path.join(OUT_DIR, "薬品マスター.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["ID", "薬品名", "成分名", "規格", "カテゴリ", "単位", "登録日", "備考"])
        for m in medicines.values():
            w.writerow([m["id"], m["name"], "", m["spec"], m["category"], "", reg_date, m["notes"]])

    # 業者マスター
    with open(os.path.join(OUT_DIR, "業者マスター.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["ID", "業者名", "電話番号", "担当者名", "備考"])
        for name, vid in vendors.items():
            w.writerow([vid, name, "", "", ""])

    # 価格テーブル
    with open(os.path.join(OUT_DIR, "価格テーブル.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["ID", "薬品ID", "業者ID", "単価", "税込フラグ", "有効開始日", "登録日", "ソース", "備考"])
        seq = 0
        for pr in price_rows:
            seq += 1
            w.writerow([f"PRC-{seq:05d}", pr["med_id"], pr["ven_id"], pr["price"],
                        "FALSE", today, reg_date, "移行(Numbers)", pr["note"]])
        stats["price_rows"] = seq

    # 成分グループ（空：ヘッダーのみ）
    with open(os.path.join(OUT_DIR, "成分グループ.csv"), "w", newline="", encoding="utf-8-sig") as f:
        csv.writer(f).writerow(["成分名", "薬品IDリスト"])

    # ── サマリー ──────────────────────────────────────────────
    print("=" * 50)
    print("移行完了")
    print(f"  読み取りシート(テーブル): {stats['sheets']}")
    print(f"  元データ行: {stats['src_rows']}")
    print(f"  薬品マスター: {len(medicines)} 件")
    print(f"  業者マスター: {len(vendors)} 件")
    print(f"  価格テーブル: {stats['price_rows']} 件")
    print(f"  単価未入力で価格列を採用: {stats['fallback_unitprice']} 件")
    print(f"  価格無しでスキップ: {stats['skipped_no_price']} 件")
    print(f"  品名無しでスキップ: {stats['skipped_no_name']} 件")
    print("-" * 50)
    print("業者一覧:")
    for name in vendors:
        mark = "" if name in KNOWN or name == "不明" else "  ← 要確認(未知)"
        print(f"  - {name}{mark}")
    if unknown_vendors:
        print("\n⚠️ 未知の業者名（エイリアス統一の確認推奨）:", "、".join(sorted(unknown_vendors)))
    print("=" * 50)
    print(f"出力先: {OUT_DIR}")

if __name__ == "__main__":
    main()
