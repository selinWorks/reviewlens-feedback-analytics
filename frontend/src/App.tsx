import { useState } from 'react'

type ReviewResponse = {
  text: string
  message: string
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
        throw new Error(`Request failed (${response.status}).`)
      }

      const data: ReviewResponse = await response.json()
      setResult(data)
    } catch {
      setError(
        'Could not send the review. Check that the backend is running and try again.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main>
      <h1>ReviewLens</h1>
      <p>Turn customer feedback into actionable insights.</p>

      <section className="review-panel">
        <h2>Analyze a review</h2>

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
          {isLoading ? 'Sending...' : 'Analyze review'}
        </button>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>

      <div aria-live="polite">
        {result && (
          <section className="review-panel">
            <h2>Review received</h2>
            <p className="submitted-review">{result.text}</p>
            <p className="success-message">{result.message}</p>
          </section>
        )}
      </div>
    </main>
  )
}

export default App