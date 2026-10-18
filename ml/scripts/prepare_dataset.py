import hashlib
import json
import re
import unicodedata
from itertools import combinations
from pathlib import Path

from datasets import load_from_disk
from sklearn.model_selection import train_test_split


ML_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = ML_DIR / "data" / "raw" / "trsav1"
OUTPUT_DIR = ML_DIR / "data" / "processed" / "trsav1"
REPORT_DIR = ML_DIR / "reports"
SOURCE_REPORT = REPORT_DIR / "trsav1_initial_report.json"

SEED = 42

LABELS = {
    "Negative": "negative",
    "Neutral": "neutral",
    "Positive": "positive",
}


def normalize_text(text):
    """Normalize Unicode and whitespace without removing sentiment cues."""
    text = unicodedata.normalize("NFC", text)
    return re.sub(r"\s+", " ", text).strip()


def text_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def label_counts(frame):
    counts = frame["label"].value_counts()
    return {
        label: int(counts.get(label, 0))
        for label in LABELS.values()
    }


def main():
    if not RAW_DIR.exists():
        raise FileNotFoundError(
            "Ham veri bulunamadı. Önce inspect_dataset.py çalıştırılmalı."
        )

    print("Yerel veri okunuyor...")
    dataset = load_from_disk(str(RAW_DIR))

    if set(dataset.keys()) != {"train"}:
        raise ValueError(
            "Beklenmeyen veri bölümleri bulundu. Kaynağı kontrol edin."
        )

    frame = dataset["train"].to_pandas()
    required = {"id", "score", "review"}

    if not required.issubset(frame.columns):
        raise ValueError(f"Gerekli sütunlar bulunamadı: {required}")

    original_rows = len(frame)

    missing_mask = frame[["review", "score"]].isna().any(axis=1)
    missing_rows = int(missing_mask.sum())
    frame = frame.loc[~missing_mask].copy()

    if not frame["review"].map(lambda value: isinstance(value, str)).all():
        raise ValueError("Metin olmayan yorum kayıtları bulundu.")

    unknown_labels = set(frame["score"].unique()) - set(LABELS)

    if unknown_labels:
        raise ValueError(f"Beklenmeyen etiketler: {unknown_labels}")

    frame["text"] = frame["review"].map(normalize_text)
    frame["label"] = frame["score"].map(LABELS)

    empty_mask = frame["text"].eq("")
    empty_rows = int(empty_mask.sum())
    frame = frame.loc[~empty_mask].copy()

    print("Etiket çelişkileri kontrol ediliyor...")
    distinct_labels = frame.groupby("text")["label"].nunique()
    conflicting_texts = distinct_labels[distinct_labels > 1].index

    conflict_mask = frame["text"].isin(conflicting_texts)
    conflicts = frame.loc[conflict_mask].copy()
    consistent = frame.loc[~conflict_mask].copy()

    # Remove all conflicting groups; do not guess the correct label.
    clean = consistent.drop_duplicates(subset="text", keep="first").copy()
    duplicate_rows_removed = len(consistent) - len(clean)

    clean = clean.rename(columns={"id": "source_id"})
    clean["text_hash"] = clean["text"].map(text_hash)
    clean = clean[
        ["source_id", "text", "label", "text_hash"]
    ].sort_values("text_hash").reset_index(drop=True)

    if clean["text_hash"].duplicated().any():
        raise ValueError("Temiz veride yinelenen metin özeti bulundu.")

    if any(count < 20 for count in label_counts(clean).values()):
        raise ValueError("Veri bölme için bir sınıfta yeterli örnek yok.")

    print("Veri %80 eğitim, %10 doğrulama, %10 test olarak bölünüyor...")

    train, remaining = train_test_split(
        clean,
        test_size=0.20,
        random_state=SEED,
        stratify=clean["label"],
    )

    validation, test = train_test_split(
        remaining,
        test_size=0.50,
        random_state=SEED,
        stratify=remaining["label"],
    )

    splits = {
        "train": train,
        "validation": validation,
        "test": test,
    }

    overlap_counts = {}

    for first, second in combinations(splits, 2):
        overlap = set(splits[first]["text_hash"]) & set(
            splits[second]["text_hash"]
        )
        overlap_counts[f"{first}_vs_{second}"] = len(overlap)

        if overlap:
            raise ValueError(
                f"{first} ve {second} arasında aynı yorum bulundu."
            )

    total_split_rows = sum(len(part) for part in splits.values())

    if total_split_rows != len(clean):
        raise ValueError("Veri bölümlerinin toplamı tutarsız.")

    expected_removed = (
        missing_rows
        + empty_rows
        + len(conflicts)
        + duplicate_rows_removed
    )

    if original_rows - len(clean) != expected_removed:
        raise ValueError("Temizleme sayımları tutarsız.")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    for name, part in splits.items():
        part = part.sort_values("text_hash")
        part.to_csv(
            OUTPUT_DIR / f"{name}.csv",
            index=False,
            encoding="utf-8-sig",
        )
        print(f"{name}: {len(part):,} yorum")
        print(f"  Etiketler: {label_counts(part)}")

    conflicts[
        ["id", "review", "score", "text", "label"]
    ].to_csv(
        OUTPUT_DIR / "conflicting_reviews.csv",
        index=False,
        encoding="utf-8-sig",
    )

    source_metadata = {}
    if SOURCE_REPORT.exists():
        source_metadata = json.loads(
            SOURCE_REPORT.read_text(encoding="utf-8")
        )

    report = {
        "dataset": source_metadata.get("dataset"),
        "revision": source_metadata.get("revision"),
        "random_seed": SEED,
        "normalization": "Unicode NFC and whitespace normalization",
        "conflict_policy": "Exclude all rows with conflicting text labels",
        "duplicate_policy": "Keep one row per normalized text",
        "original_rows": original_rows,
        "missing_rows_removed": missing_rows,
        "empty_rows_removed": empty_rows,
        "conflicting_unique_texts": len(conflicting_texts),
        "conflicting_rows_removed": len(conflicts),
        "consistent_duplicate_rows_removed": duplicate_rows_removed,
        "clean_rows": len(clean),
        "clean_label_counts": label_counts(clean),
        "splits": {
            name: {
                "rows": len(part),
                "percentage": round(len(part) / len(clean) * 100, 2),
                "label_counts": label_counts(part),
            }
            for name, part in splits.items()
        },
        "normalized_text_overlap": overlap_counts,
        "limitations": [
            "Near-duplicate reviews are not detected.",
            "Product and author grouping are unavailable in this export.",
            "Balanced source labels may differ from real review distributions.",
        ],
    }

    report_path = REPORT_DIR / "trsav1_preparation_report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\nÇelişkili farklı yorum: {len(conflicting_texts):,}")
    print(f"Çıkarılan çelişkili kayıt: {len(conflicts):,}")
    print(f"Çıkarılan diğer tekrar kayıt: {duplicate_rows_removed:,}")
    print(f"Temiz yorum sayısı: {len(clean):,}")
    print(f"Bölümler arası aynı yorum sayıları: {overlap_counts}")
    print(f"Rapor: {report_path}")
    print("\nVeri hazırlığı tamamlandı. Model eğitimi başlatılmadı.")


if __name__ == "__main__":
    main()