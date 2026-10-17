import json
from pathlib import Path

from datasets import load_dataset
from huggingface_hub import HfApi

DATASET_ID = "maydogan/Turkish_SentimentAnalysis_TRSAv1"

ML_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = ML_DIR / "data" / "raw" / "trsav1"
REPORT_DIR = ML_DIR / "reports"


def main():
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    print("Veri kaynağı kontrol ediliyor...")
    revision = HfApi().dataset_info(DATASET_ID).sha

    print("Veri indiriliyor; ilk çalıştırma zaman alabilir...")
    dataset = load_dataset(DATASET_ID, revision=revision)

    if not RAW_DIR.exists():
        dataset.save_to_disk(str(RAW_DIR))

    report = {
        "dataset": DATASET_ID,
        "revision": revision,
        "splits": {},
    }

    for split_name, split in dataset.items():
        frame = split.to_pandas()

        print(f"\nBölüm: {split_name}")
        print(f"Satır sayısı: {len(frame):,}")
        print(f"Sütunlar: {list(frame.columns)}")
        print("\nİlk 3 kayıt:")
        print(frame.head(3).to_string(index=False))

        split_report = {
            "rows": len(frame),
            "columns": list(frame.columns),
            "missing_values": {
                key: int(value)
                for key, value in frame.isna().sum().items()
            },
        }

        if "score" in frame.columns:
            counts = frame["score"].value_counts(dropna=False)
            print("\nEtiket dağılımı:")
            print(counts.to_string())
            split_report["label_counts"] = {
                str(key): int(value)
                for key, value in counts.items()
            }

        if "review" in frame.columns:
            texts = frame["review"].fillna("").astype(str)
            normalized = texts.str.normalize("NFC").str.strip()
            normalized = normalized.str.replace(
                r"\s+", " ", regex=True
            )

            split_report["empty_reviews"] = int(
                normalized.eq("").sum()
            )
            split_report["duplicate_reviews"] = int(
                normalized.duplicated().sum()
            )
            split_report["character_lengths"] = (
                texts.str.len().describe().to_dict()
            )

        report["splits"][split_name] = split_report

    output = REPORT_DIR / "trsav1_initial_report.json"
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\nRapor kaydedildi: {output}")
    print("İnceleme tamamlandı. Eğitim başlatılmadı.")


if __name__ == "__main__":
    main()