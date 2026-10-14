import { useState } from 'react'

type Sentiment = 'negative' | 'neutral' | 'positive'
type Mode = 'single' | 'batch'

type ReviewResponse = {
  text: string
  sentiment: Sentiment
  confidence: number
  scores: Record<Sentiment, number>
  model: string
}

type BatchResponse = {
  total: number
  counts: Record<Sentiment, number>
  results: ReviewResponse[]
}

const labels: Record<Sentiment, string> = {
  negative: 'Negative',
  neutral: 'Neutral',
  positive: 'Positive',
}

const colors: Record<Sentiment, string> = {
  negative: '#b42318',
  neutral: '#475467',
  positive: '#067647',
}

const sentimentOrder: Sentiment[] = ['positive', 'neutral', 'negative']

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function ReviewResult({ result }: { result: ReviewResponse }) {
  return (
    <article className="review-panel">
      <p className="submitted-review" style={{ whiteSpace: 'pre-wrap' }}>
        {result.text}
      </p>

      <p>
        Sentiment:{' '}
        <strong style={{ color: colors[result.sentiment] }}>
          {labels[result.sentiment]}
        </strong>
      </p>

      <p>
        Model confidence: <strong>{percent(result.confidence)}</strong>
      </p>

      <details>
        <summary style={{ cursor: 'pointer', marginBottom: '12px' }}>
          View sentiment scores
        </summary>

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
              <span>{labels[sentiment]}</span>
              <span>{percent(result.scores[sentiment])}</span>
            </div>

            <div
              role="meter"
              aria-label={`${labels[sentiment]} score`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={result.scores[sentiment] * 100}
              aria-valuetext={percent(result.scores[sentiment])}
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
                  backgroundColor: colors[sentiment],
                  borderRadius: '999px',
                }}
              />
            </div>
          </div>
        ))}
      </details>
    </article>
  )
}

function App() {
  const [mode, setMode] = useState<Mode>('single')
  const [review, setReview] = useState('')
  const [batchText, setBatchText] = useState('')
  const [result, setResult] = useState<ReviewResponse | null>(null)
  const [batchResult, setBatchResult] = useState<BatchResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const batchReviews = batchText
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)

  const currentText = mode === 'single' ? review : batchText

  function clearResults() {
    setResult(null)
    setBatchResult(null)
    setError('')
  }

  function changeMode(nextMode: Mode) {
    if (isLoading) return
    setMode(nextMode)
    clearResults()
  }

  async function handleAnalyze() {
    if (isLoading) return

    clearResults()

    if (mode === 'single' && !review.trim()) {
      setError('Please enter a review.')
      return
    }

    if (mode === 'batch') {
      if (batchReviews.length === 0) {
        setError('Please enter at least one review.')
        return
      }

      if (batchReviews.length > 50) {
        setError('You can analyze up to 50 reviews at a time.')
        return
      }

      const tooLong = batchReviews.findIndex((text) => text.length > 10000)

      if (tooLong !== -1) {
        setError(
          `Review ${tooLong + 1} exceeds the 10,000 character limit.`,
        )
        return
      }
    }

    setIsLoading(true)

    try {
      const endpoint = mode === 'single' ? '/analyze' : '/analyze-batch'
      const body =
        mode === 'single'
          ? { text: review.trim() }
          : { reviews: batchReviews.map((text) => ({ text })) }

      const response = await fetch(`http://127.0.0.1:8000${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        let message = `Analysis failed (${response.status}). Please try again.`

        const payload = await response.json().catch(() => null)

        if (typeof payload?.detail === 'string') {
          message = payload.detail
        } else if (response.status === 422) {
          message =
            'Check your input. Reviews may be too long or exceed the allowed limit.'
        }

        throw new Error(message)
      }

      if (mode === 'single') {
        const data: ReviewResponse = await response.json()
        setResult(data)
      } else {
        const data: BatchResponse = await response.json()
        setBatchResult(data)
      }
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
        <h2>Analyze customer feedback</h2>
        <p>Analyze reviews in Turkish or English.</p>

        <div
          role="group"
          aria-label="Analysis mode"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '24px',
          }}
        >
          {(['single', 'batch'] as Mode[]).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              disabled={isLoading}
              onClick={() => changeMode(item)}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: '1px solid #d0d5dd',
                backgroundColor: mode === item ? '#7c3aed' : '#ffffff',
                color: mode === item ? '#ffffff' : '#344054',
                fontWeight: 600,
                cursor: isLoading ? 'wait' : 'pointer',
              }}
            >
              {item === 'single' ? 'Single review' : 'Batch analysis'}
            </button>
          ))}
        </div>

        <label htmlFor="review">
          {mode === 'single' ? 'Customer review' : 'Customer reviews'}
        </label>

        <p id="input-help">
          {mode === 'single'
            ? 'Enter one review, up to 10,000 characters. The model also has a 512-token limit.'
            : 'Enter one review per line, up to 50 reviews. Blank lines are ignored. Each review has a 10,000-character and 512-token limit.'}
        </p>

        <textarea
          id="review"
          aria-describedby="input-help"
          value={currentText}
          onChange={(event) => {
            if (mode === 'single') {
              setReview(event.target.value)
            } else {
              setBatchText(event.target.value)
            }
            clearResults()
          }}
          placeholder={
            mode === 'single'
              ? 'Paste a customer review here...'
              : 'Ürün çok kaliteli, tavsiye ederim.\nThe product arrived broken.\nPaketin içinde bir kullanım kılavuzu bulunuyor.'
          }
          rows={mode === 'single' ? 6 : 10}
          maxLength={mode === 'single' ? 10000 : 500100}
          disabled={isLoading}
        />

        <span className="character-count">
          {mode === 'single'
            ? `${review.length} / 10,000 characters`
            : `${batchReviews.length} / 50 reviews`}
        </span>

        <button
          type="button"
          className="analyze-button"
          disabled={
            isLoading ||
            (mode === 'single'
              ? !review.trim()
              : batchReviews.length === 0 || batchReviews.length > 50)
          }
          onClick={handleAnalyze}
        >
          {isLoading
            ? 'Analyzing...'
            : mode === 'single'
              ? 'Analyze review'
              : 'Analyze reviews'}
        </button>

        <p role="status">
          {isLoading ? 'Analyzing your feedback. Please wait.' : ''}
        </p>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>

      <div aria-live="polite">
        {result && (
          <section aria-label="Analysis result">
            <h2>Analysis result</h2>
            <ReviewResult result={result} />
          </section>
        )}

        {batchResult && (
          <section aria-label="Batch analysis results">
            <h2>Batch analysis results</h2>

            <div className="review-panel">
              <h3>Total reviews: {batchResult.total}</h3>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '16px',
                }}
              >
                {sentimentOrder.map((sentiment) => (
                  <div
                    key={sentiment}
                    style={{
                      padding: '20px',
                      border: '1px solid #eaecf0',
                      borderRadius: '12px',
                    }}
                  >
                    <strong style={{ color: colors[sentiment] }}>
                      {labels[sentiment]}
                    </strong>

                    <div style={{ fontSize: '28px', fontWeight: 700 }}>
                      {batchResult.counts[sentiment]}
                    </div>

                    <span>
                      {percent(
                        batchResult.counts[sentiment] / batchResult.total,
                      )}{' '}
                      of reviews
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {batchResult.results.map((item, index) => (
              <section key={index} aria-label={`Review ${index + 1}`}>
                <h3>Review {index + 1}</h3>
                <ReviewResult result={item} />
              </section>
            ))}
          </section>
        )}

        {(result || batchResult) && (
          <p>
            Confidence reflects the model’s score, not measured accuracy.
          </p>
        )}
      </div>
    </main>
  )
}

export default App