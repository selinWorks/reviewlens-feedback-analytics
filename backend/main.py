from contextlib import asynccontextmanager
from typing import Literal

import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from transformers import AutoModelForSequenceClassification, AutoTokenizer


MODEL_NAME = "tabularisai/multilingual-sentiment-analysis"


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("ReviewLens: duygu analizi modeli yükleniyor...")

    app.state.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    app.state.model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME
    )
    app.state.model.eval()

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
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ReviewRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=10000)


class SentimentScores(BaseModel):
    negative: float
    neutral: float
    positive: float


class ReviewResponse(BaseModel):
    text: str
    sentiment: Literal["negative", "neutral", "positive"]
    confidence: float
    scores: SentimentScores
    model: str


@app.get("/health")
def health_check():
    return {"status": "ok", "message": "ReviewLens API is running"}


@app.post("/analyze", response_model=ReviewResponse)
def analyze_review(review: ReviewRequest):
    tokenizer = app.state.tokenizer
    model = app.state.model

    inputs = tokenizer(
        review.text,
        return_tensors="pt",
        truncation=False,
    )

    if inputs["input_ids"].shape[1] > 512:
        raise HTTPException(
            status_code=422,
            detail="Yorum çok uzun. Lütfen daha kısa bir yorum girin.",
        )

    with torch.inference_mode():
        logits = model(**inputs).logits
        probabilities = torch.softmax(logits, dim=-1)[0].tolist()

    # Model sırası: çok olumsuz, olumsuz, nötr, olumlu, çok olumlu
    scores = {
        "negative": probabilities[0] + probabilities[1],
        "neutral": probabilities[2],
        "positive": probabilities[3] + probabilities[4],
    }

    sentiment = max(scores, key=scores.get)

    return {
        "text": review.text,
        "sentiment": sentiment,
        "confidence": scores[sentiment],
        "scores": scores,
        "model": MODEL_NAME,
    }