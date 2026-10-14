from contextlib import asynccontextmanager

from threading import Lock

from typing import Literal

import re

import unicodedata



import torch

from fastapi import FastAPI, HTTPException

from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel, ConfigDict, Field

from transformers import AutoModelForSequenceClassification, AutoTokenizer





MODEL_NAME = "tabularisai/multilingual-sentiment-analysis"

MAX_TOKENS = 512

BATCH_SIZE = 8



Sentiment = Literal["negative", "neutral", "positive"]



# Önceden tanımlanmış konular: eşleşmeler konuya değinildiğini gösterir.

# Yorumun genel duygusu, her konu için ayrı bir duygu analizi değildir.

TOPIC_RULES = {

    "delivery": {

        "label": "Delivery",

        "keywords": [

            "kargo", "teslimat", "teslimatta", "teslimatı", "teslimatın",
            "teslim", "kurye",

            "delivery", "shipping", "shipment", "courier",

            "arrived", "late delivery",

        ],

    },

    "product_quality": {

        "label": "Product quality",

        "keywords": [

            "kalite", "kalitesi", "kalitesini", "kalitesine",
            "kalitesinden", "kalitesinin", "kaliteleri",
            "kaliteli", "kalitesiz",

            "kırık", "kırıldı", "bozuk", "bozuldu",

            "kusurlu", "dayanıklı", "dayanıksız", "hasarlı",

            "quality", "broken", "defective", "damaged",

            "durable", "faulty", "stopped working",

        ],

    },

    "customer_service": {

        "label": "Customer service",

        "keywords": [

            "müşteri hizmetleri", "müşteri hizmetlerinden", "destek ekibi",

            "destek hattı", "satıcı", "iletişim",

            "customer service", "customer support",

            "support team", "seller",

        ],

    },

    "price": {

        "label": "Price",

        "keywords": [

            "fiyat", "fiyatı", "fiyatına", "fiyatlar", "fiyatının",

            "pahalı", "ucuz", "ücret", "ücreti", "indirim",

            "price", "pricing", "expensive", "cheap",

            "cost", "discount", "value for money",

        ],

    },

    "packaging": {

        "label": "Packaging",

        "keywords": [

            "paket", "paketin", "paketi", "paketleme", "paketlemesi",

            "ambalaj", "ambalajı", "kutu", "kutusu",

            "packaging", "package", "box", "wrapped",

        ],

    },

    "returns_refunds": {

        "label": "Returns and refunds",

        "keywords": [

            "iade", "iadesi", "iadesini", "değişim", "geri ödeme",

            "para iadesi", "refund", "refunded",

            "return", "returns", "exchange", "money back",

        ],

    },

}





def normalize_text(text: str) -> str:

    text = text.replace("İ", "i").replace("I", "ı").lower()

    text = text.translate(str.maketrans("ıçğöşü", "icgosu"))

    text = unicodedata.normalize("NFKD", text)

    text = "".join(char for char in text if not unicodedata.combining(char))

    return re.sub(r"\s+", " ", text).strip()





TOPIC_PATTERNS = {

    topic_id: [

        (

            keyword,

            re.compile(

                r"(?<!\w)"

                + re.escape(normalize_text(keyword))

                + r"(?!\w)"

            ),

        )

        for keyword in rule["keywords"]

    ]

    for topic_id, rule in TOPIC_RULES.items()

}





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





class TopicMatch(BaseModel):

    topic: str

    label: str

    matched_keywords: list[str]

    method: Literal["keyword_rules"] = "keyword_rules"





class ReviewResponse(BaseModel):

    text: str

    sentiment: Sentiment

    confidence: float

    scores: SentimentScores

    model: str

    topics: list[TopicMatch]





class SentimentCounts(BaseModel):

    negative: int

    neutral: int

    positive: int





class TopicEvidence(BaseModel):

    review_index: int

    text: str

    review_sentiment: Sentiment

    matched_keywords: list[str]





class TopicSummary(BaseModel):

    topic: str

    label: str

    count: int

    percentage: float

    evidence: list[TopicEvidence]





class BatchReviewResponse(BaseModel):

    total: int

    counts: SentimentCounts

    results: list[ReviewResponse]

    topic_summary: list[TopicSummary]

    unmatched_topic_count: int

    topic_method: Literal["keyword_rules"] = "keyword_rules"





def detect_topics(text: str) -> list[TopicMatch]:

    normalized = normalize_text(text)

    matches: list[TopicMatch] = []



    for topic_id, patterns in TOPIC_PATTERNS.items():

        keywords = [

            keyword

            for keyword, pattern in patterns

            if pattern.search(normalized)

        ]



        if keywords:

            matches.append(

                TopicMatch(

                    topic=topic_id,

                    label=TOPIC_RULES[topic_id]["label"],

                    matched_keywords=keywords,

                )

            )



    return matches





def summarize_topics(results: list[ReviewResponse]) -> list[TopicSummary]:

    evidence_by_topic: dict[str, list[TopicEvidence]] = {}



    for index, result in enumerate(results, start=1):

        for match in result.topics:

            evidence_by_topic.setdefault(match.topic, []).append(

                TopicEvidence(

                    review_index=index,

                    text=result.text,

                    review_sentiment=result.sentiment,

                    matched_keywords=match.matched_keywords,

                )

            )



    summaries = [

        TopicSummary(

            topic=topic_id,

            label=TOPIC_RULES[topic_id]["label"],

            count=len(evidence),

            percentage=round(len(evidence) / len(results) * 100, 1),

            evidence=evidence,

        )

        for topic_id, evidence in evidence_by_topic.items()

    ]



    return sorted(summaries, key=lambda item: (-item.count, item.topic))





def predict_reviews(reviews: list[ReviewRequest]) -> list[ReviewResponse]:

    tokenizer = app.state.tokenizer

    model = app.state.model

    texts = [review.text for review in reviews]



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

                scores = {

                    "negative": probability[0] + probability[1],

                    "neutral": probability[2],

                    "positive": probability[3] + probability[4],

                }



                sentiment = max(scores, key=scores.get)



                results.append(

                    ReviewResponse(

                        text=text,

                        sentiment=sentiment,

                        confidence=scores[sentiment],

                        scores=SentimentScores(**scores),

                        model=MODEL_NAME,

                        topics=detect_topics(text),

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

        topic_summary=summarize_topics(results),

        unmatched_topic_count=sum(not result.topics for result in results),

    )