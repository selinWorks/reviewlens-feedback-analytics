import hashlib
import json
import platform
import warnings
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

import joblib
import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd
import sklearn
from sklearn.exceptions import ConvergenceWarning
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.pipeline import Pipeline


ML_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ML_DIR / "data" / "processed" / "trsav1"
MODEL_DIR = ML_DIR / "models" / "baseline"
REPORT_DIR = ML_DIR / "reports" / "baseline"

LABELS = ["negative", "neutral", "positive"]
SEED = 42


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_split(name):
    path = DATA_DIR / f"{name}.csv"

    if not path.exists():
        raise FileNotFoundError(f"Veri dosyası bulunamadı: {path}")

    frame = pd.read_csv(
        path,
        encoding="utf-8-sig",
        keep_default_na=False,
    )

    required = {"text", "label", "text_hash"}
    if not required.issubset(frame.columns):
        raise ValueError(f"{name}: gerekli sütunlar eksik.")

    if not frame["text"].map(
        lambda text: isinstance(text, str) and bool(text.strip())
    ).all():
        raise ValueError(f"{name}: boş veya geçersiz yorum var.")

    if set(frame["label"]) != set(LABELS):
        raise ValueError(f"{name}: duygu etiketleri beklenenle uyuşmuyor.")

    actual_hashes = frame["text"].map(
        lambda text: hashlib.sha256(text.encode("utf-8")).hexdigest()
    )

    if not actual_hashes.eq(frame["text_hash"]).all():
        raise ValueError(f"{name}: metin ve kayıt özeti uyuşmuyor.")

    if frame["text_hash"].duplicated().any():
        raise ValueError(f"{name}: tekrarlanan yorum bulundu.")

    return frame, path


def main():
    print("Eğitim ve doğrulama verileri okunuyor...")
    train, train_path = read_split("train")
    validation, validation_path = read_split("validation")

    overlap = set(train["text_hash"]) & set(validation["text_hash"])
    if overlap:
        raise ValueError("Eğitim ve doğrulamada ortak yorum bulundu.")

    print(f"Eğitim: {len(train):,} yorum")
    print(f"Doğrulama: {len(validation):,} yorum")

    model = Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    lowercase=False,
                    ngram_range=(1, 2),
                    min_df=2,
                    max_df=0.98,
                    max_features=100000,
                    sublinear_tf=True,
                ),
            ),
            (
                "classifier",
                LogisticRegression(
                    C=1.0,
                    solver="lbfgs",
                    max_iter=1000,
                    random_state=SEED,
                ),
            ),
        ]
    )

    print("\nModel eğitiliyor; terminal açık kalsın...")
    started = perf_counter()

    with warnings.catch_warnings(record=True) as captured:
        warnings.simplefilter("always", ConvergenceWarning)
        model.fit(train["text"], train["label"])

    training_seconds = perf_counter() - started

    convergence_messages = [
        str(item.message)
        for item in captured
        if issubclass(item.category, ConvergenceWarning)
    ]

    for item in captured:
        print(f"Uyarı: {item.message}")

    print("Doğrulama tahminleri hesaplanıyor...")
    predictions = model.predict(validation["text"])

    accuracy = accuracy_score(validation["label"], predictions)
    macro_f1 = f1_score(
        validation["label"],
        predictions,
        labels=LABELS,
        average="macro",
        zero_division=0,
    )

    report = classification_report(
        validation["label"],
        predictions,
        labels=LABELS,
        output_dict=True,
        zero_division=0,
    )

    matrix = confusion_matrix(
        validation["label"],
        predictions,
        labels=LABELS,
    )

    majority_label = train["label"].value_counts().idxmax()
    majority_predictions = [majority_label] * len(validation)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    model_path = MODEL_DIR / "tfidf_logistic_regression.joblib"
    joblib.dump(model, model_path)

    metrics = {
        "model": "TF-IDF + Logistic Regression",
        "language": "Turkish",
        "evaluation_split": "validation",
        "test_used": False,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "random_seed": SEED,
        "train_rows": len(train),
        "validation_rows": len(validation),
        "train_sha256": file_hash(train_path),
        "validation_sha256": file_hash(validation_path),
        "training_seconds": round(training_seconds, 2),
        "accuracy": float(accuracy),
        "macro_f1": float(macro_f1),
        "classification_report": report,
        "confusion_matrix": matrix.tolist(),
        "label_order": LABELS,
        "majority_baseline": {
            "label": majority_label,
            "accuracy": float(
                accuracy_score(
                    validation["label"], majority_predictions
                )
            ),
            "macro_f1": float(
                f1_score(
                    validation["label"],
                    majority_predictions,
                    labels=LABELS,
                    average="macro",
                    zero_division=0,
                )
            ),
        },
        "configuration": {
            "tfidf": {
                "lowercase": False,
                "ngram_range": [1, 2],
                "min_df": 2,
                "max_df": 0.98,
                "max_features": 100000,
                "sublinear_tf": True,
            },
            "classifier": {
                "C": 1.0,
                "solver": "lbfgs",
                "max_iter": 1000,
            },
        },
        "vocabulary_size": len(
            model.named_steps["tfidf"].vocabulary_
        ),
        "convergence_warnings": convergence_messages,
        "versions": {
            "python": platform.python_version(),
            "scikit_learn": sklearn.__version__,
            "pandas": pd.__version__,
            "joblib": joblib.__version__,
        },
    }

    (REPORT_DIR / "validation_metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    pd.DataFrame(report).transpose().to_csv(
        REPORT_DIR / "validation_classification_report.csv",
        encoding="utf-8-sig",
    )

    figure, axis = plt.subplots(figsize=(7, 6))
    display = ConfusionMatrixDisplay(
        confusion_matrix=matrix,
        display_labels=LABELS,
    )
    display.plot(ax=axis, cmap="Purples", colorbar=False)
    axis.set_title("ReviewLens baseline — validation")
    axis.set_xlabel("Predicted sentiment")
    axis.set_ylabel("True sentiment")
    figure.tight_layout()
    figure.savefig(
        REPORT_DIR / "validation_confusion_matrix.png",
        dpi=160,
    )
    plt.close(figure)

    print("\n" + classification_report(
        validation["label"],
        predictions,
        labels=LABELS,
        digits=4,
        zero_division=0,
    ))
    print(f"Accuracy: {accuracy:.4f}")
    print(f"Macro-F1: {macro_f1:.4f}")
    print(f"Eğitim süresi: {training_seconds:.1f} saniye")
    print(f"Model kaydedildi: {model_path}")
    print(f"Raporlar: {REPORT_DIR}")

    if convergence_messages:
        print("Yakınsama uyarısı var; sonuçları birlikte inceleyelim.")

    print("\nİlk model eğitimi tamamlandı. Test verisi kullanılmadı.")


if __name__ == "__main__":
    main()