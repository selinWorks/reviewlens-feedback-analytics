from contextlib import asynccontextmanager
from threading import Lock
from typing import Literal

import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from transformers import AutoModelForSequenceClassification, AutoTokenizer


MODEL_NAME = "tabularisai/multilingual-sentiment-analysis"
MAX_TOKENS = 512
BATCH_SIZE = 8

Sentiment = Literal["negative", "neutral", "positive"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("ReviewLens: duygu analizi modeli yükleniyor...")

    app.state.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    app.state.model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME
    )
    app.state.model.eval()
    app.state.inference_lock = Lock()

    print("ReviewLens: model hazır!")
    yield


app = FastAPI(title="ReviewLens API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
        allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ReviewRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=10000)


class BatchReviewRequest(BaseModel):
    reviews: list[ReviewRequest] = Field(min_length=1, max_length=50)


class SentimentScores(BaseModel):
    negative: float
    neutral: float
    positive: float


class ReviewResponse(BaseModel):
    text: str
    sentiment: Sentiment
    confidence: float
    scores: SentimentScores
    model: str


class SentimentCounts(BaseModel):
    negative: int
    neutral: int
    positive: int


class BatchReviewResponse(BaseModel):
    total: int
    counts: SentimentCounts
    results: list[ReviewResponse]


def predict_reviews(reviews: list[ReviewRequest]) -> list[ReviewResponse]:
    tokenizer = app.state.tokenizer
    model = app.state.model
    texts = [review.text for review in reviews]

    # Önce tüm yorumları kontrol et; uzun metinleri sessizce kesme.
    encoded = tokenizer(
        texts,
        truncation=False,
        padding=False,
    )

    too_long = [
        index + 1
        for index, token_ids in enumerate(encoded["input_ids"])
        if len(token_ids) > MAX_TOKENS
    ]

    if too_long:
        positions = ", ".join(str(position) for position in too_long)
        raise HTTPException(
            status_code=422,
            detail=(
                f"Şu yorumlar çok uzun: {positions}. "
                "Lütfen bu yorumları kısaltın. "
                "Her yorum en fazla 512 token olabilir."
            ),
        )

    results: list[ReviewResponse] = []

    # Aynı model üzerinde eşzamanlı ağır işlemleri sıraya al.
    with app.state.inference_lock:
        for start in range(0, len(texts), BATCH_SIZE):
            batch_texts = texts[start : start + BATCH_SIZE]
            batch_inputs = tokenizer.pad(
                {
                    key: values[start : start + BATCH_SIZE]
                    for key, values in encoded.items()
                },
                padding=True,
                return_tensors="pt",
            )

            with torch.inference_mode():
                logits = model(**batch_inputs).logits
                probabilities = torch.softmax(logits, dim=-1).tolist()

            for text, probability in zip(batch_texts, probabilities):
                # Çok olumsuz ve olumsuz; olumlu ve çok olumlu birleşir.
                scores = {
                    "negative": probability[0] + probability[1],
                    "neutral": probability[2],
                    "positive": probability[3] + probability[4],
                }

                sentiment: Sentiment = max(scores, key=scores.get)

                results.append(
                    ReviewResponse(
                        text=text,
                        sentiment=sentiment,
                        confidence=scores[sentiment],
                        scores=SentimentScores(**scores),
                        model=MODEL_NAME,
                    )
                )

    return results


@app.get("/health")
def health_check():
    return {"status": "ok", "message": "ReviewLens API is running"}


@app.post("/analyze", response_model=ReviewResponse)
def analyze_review(review: ReviewRequest):
    return predict_reviews([review])[0]


@app.post("/analyze-batch", response_model=BatchReviewResponse)
def analyze_batch(request: BatchReviewRequest):
    results = predict_reviews(request.reviews)

    counts = {
        "negative": 0,
        "neutral": 0,
        "positive": 0,
    }

    for result in results:
        counts[result.sentiment] += 1

    return BatchReviewResponse(
        total=len(results),
        counts=SentimentCounts(**counts),
        results=results,
    )