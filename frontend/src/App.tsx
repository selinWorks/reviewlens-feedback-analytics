import { useState } from 'react'

type Sentiment = 'negative' | 'neutral' | 'positive'

type ReviewResponse = {
  text: string
  sentiment: Sentiment
  confidence: number
  scores: Record<Sentiment, number>
  model: string
}

const sentimentLabels: Record<Sentiment, string> = {
  negative: 'Negative',
  neutral: 'Neutral',
  positive: 'Positive',
}

const sentimentColors: Record<Sentiment, string> = {
  negative: '#b42318',
  neutral: '#475467',
  positive: '#067647',
}

const sentimentOrder: Sentiment[] = ['positive', 'neutral', 'negative']

function formatPercent(score: number) {
  return `${(score * 100).toFixed(1)}%`
}

function App() {
  const [review, setReview] = useState('')
  const [result, setResult] = useState<ReviewResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAnalyze() {
    const text = review.trim()

    if (!text || isLoading) return

    setIsLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('http://127.0.0.1:8000/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      })

      if (!response.ok) {
        let message = `Analysis failed (${response.status}). Please try again.`

        if (response.status === 422) {
          message =
            'The review is invalid or too long. Please try a shorter review.'
        }

        throw new Error(message)
      }

      const data: ReviewResponse = await response.json()
      setResult(data)
    } catch (error) {
      setError(
        error instanceof TypeError
          ? 'Could not connect to the API. Check that the backend is running.'
          : error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main>
      <h1>ReviewLens</h1>
      <p>Turn customer feedback into actionable insights.</p>

      <section className="review-panel" aria-busy={isLoading}>
        <h2>Analyze a review</h2>
        <p>Enter a customer review in Turkish or English.</p>

        <label htmlFor="review">Customer review</label>

        <textarea
          id="review"
          value={review}
          onChange={(event) => {
            setReview(event.target.value)
            setResult(null)
            setError('')
          }}
          placeholder="Paste a customer review here..."
          rows={6}
          maxLength={10000}
          disabled={isLoading}
        />

        <span className="character-count">
          {review.length} {review.length === 1 ? 'character' : 'characters'}
        </span>

        <button
          type="button"
          className="analyze-button"
          disabled={!review.trim() || isLoading}
          onClick={handleAnalyze}
        >
          {isLoading ? 'Analyzing...' : 'Analyze review'}
        </button>

        <p role="status">
          {isLoading ? 'Analyzing your review. Please wait.' : ''}
        </p>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>

      <div aria-live="polite">
        {result && (
          <section className="review-panel">
            <h2>Analysis result</h2>

            <p className="submitted-review">{result.text}</p>

            <p>
              Sentiment:{' '}
              <strong
                style={{ color: sentimentColors[result.sentiment] }}
              >
                {sentimentLabels[result.sentiment]}
              </strong>
            </p>

            <p>
              Model confidence: <strong>{formatPercent(result.confidence)}</strong>
            </p>

            <h3>Sentiment scores</h3>

            {sentimentOrder.map((sentiment) => (
              <div key={sentiment} style={{ marginBottom: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '16px',
                    marginBottom: '4px',
                  }}
                >
                  <span>{sentimentLabels[sentiment]}</span>
                  <span>{formatPercent(result.scores[sentiment])}</span>
                </div>

                <div
                  role="meter"
                  aria-label={`${sentimentLabels[sentiment]} score`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={result.scores[sentiment] * 100}
                  aria-valuetext={formatPercent(result.scores[sentiment])}
                  style={{
                    height: '10px',
                    backgroundColor: '#eaecf0',
                    borderRadius: '999px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${result.scores[sentiment] * 100}%`,
                      height: '100%',
                      backgroundColor: sentimentColors[sentiment],
                      borderRadius: '999px',
                    }}
                  />
                </div>
              </div>
            ))}

            <p>
              Confidence reflects the model’s score, not measured accuracy.
            </p>
          </section>
        )}
      </div>
    </main>
  )
}

export default App