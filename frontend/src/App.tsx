import { useState } from 'react'
import Papa from 'papaparse'

type Sentiment = 'negative' | 'neutral' | 'positive'
type Mode = 'single' | 'batch' | 'csv'

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

const modeLabels: Record<Mode, string> = {
  single: 'Single review',
  batch: 'Batch analysis',
  csv: 'Upload CSV',
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function validateReviews(texts: string[]): string | null {
  if (texts.length === 0) return 'Please enter at least one review.'
  if (texts.length > 50) return 'You can analyze up to 50 reviews at a time.'

  const index = texts.findIndex((text) => text.length > 10000)

  if (index !== -1) {
    return `Review ${index + 1} exceeds the 10,000-character limit.`
  }

  return null
}

function downloadResults(results: ReviewResponse[]) {
  const csv = Papa.unparse(
    results.map((result) => ({
      text: result.text,
      sentiment: result.sentiment,
      confidence: result.confidence,
      positive_score: result.scores.positive,
      neutral_score: result.scores.neutral,
      negative_score: result.scores.negative,
      model: result.model,
    })),
    { escapeFormulae: true },
  )

  const blob = new Blob(['\uFEFF', csv], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = 'reviewlens-results.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
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
  const [csvReviews, setCsvReviews] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ReviewResponse | null>(null)
  const [batchResult, setBatchResult] = useState<BatchResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [error, setError] = useState('')

  const batchReviews = batchText
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)

  const activeReviews =
    mode === 'single'
      ? review.trim()
        ? [review.trim()]
        : []
      : mode === 'batch'
        ? batchReviews
        : csvReviews

  const busy = isLoading || isParsing
  const validationError = validateReviews(activeReviews)
  const exportResults = result ? [result] : batchResult?.results ?? []

  function clearResults() {
    setResult(null)
    setBatchResult(null)
    setError('')
  }

  function changeMode(nextMode: Mode) {
    if (busy) return
    setMode(nextMode)
    clearResults()
  }

  function handleFile(file: File | undefined) {
    if (!file || busy) return

    clearResults()
    setCsvReviews([])
    setFileName('')

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a .csv file.')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Please select a CSV file smaller than 2 MB.')
      return
    }

    setIsParsing(true)

    Papa.parse<Record<string, string>>(file, {
      delimiter: ',',
      header: true,
      encoding: 'UTF-8',
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.replace(/^\uFEFF/, '').trim(),

      complete: (parsed) => {
        setIsParsing(false)

        if (parsed.errors.length > 0) {
          setError(
            'The CSV could not be read correctly. Check its quotes, columns, and formatting.',
          )
          return
        }

        if (!parsed.meta.fields?.includes('text')) {
          setError('The CSV must contain a column named "text".')
          return
        }

        const texts = parsed.data
          .map((row) => (row.text ?? '').trim())
          .filter(Boolean)

        const issue = validateReviews(texts)

        if (issue) {
          setError(issue)
          return
        }

        setCsvReviews(texts)
        setFileName(file.name)
      },

      error: () => {
        setIsParsing(false)
        setError('Could not read the file. Please try again.')
      },
    })
  }

  async function handleAnalyze() {
    if (busy) return

    clearResults()

    const issue = validateReviews(activeReviews)

    if (issue) {
      setError(issue)
      return
    }

    setIsLoading(true)

    try {
      const endpoint = mode === 'single' ? '/analyze' : '/analyze-batch'
      const body =
        mode === 'single'
          ? { text: activeReviews[0] }
          : { reviews: activeReviews.map((text) => ({ text })) }

      const response = await fetch(`http://127.0.0.1:8000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        let message = `Analysis failed (${response.status}). Please try again.`
        const payload = await response.json().catch(() => null)

        if (typeof payload?.detail === 'string') {
          message = payload.detail
        } else if (response.status === 422) {
          message = 'Check your input. One or more reviews may be too long.'
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

      <section className="review-panel" aria-busy={busy}>
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
          {(['single', 'batch', 'csv'] as Mode[]).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              disabled={busy}
              onClick={() => changeMode(item)}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: '1px solid #d0d5dd',
                backgroundColor: mode === item ? '#7c3aed' : '#ffffff',
                color: mode === item ? '#ffffff' : '#344054',
                fontWeight: 600,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {modeLabels[item]}
            </button>
          ))}
        </div>

        {mode === 'csv' ? (
          <div>
            <label htmlFor="csv-file">Review CSV file</label>
            <p id="csv-help">
              Select a UTF-8 CSV with a column named "text". Up to 50
              non-empty reviews, maximum file size 2 MB. Empty reviews
              are ignored.
            </p>

            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              aria-describedby="csv-help"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                handleFile(file)
              }}
            />

            {fileName && (
              <div style={{ marginTop: '20px' }}>
                <p>
                  <strong>{fileName}</strong> — {csvReviews.length} reviews
                  ready
                </p>

                <h3>Preview: first {Math.min(5, csvReviews.length)} reviews</h3>
                <ol>
                  {csvReviews.slice(0, 5).map((text, index) => (
                    <li
                      key={index}
                      style={{
                        marginBottom: '10px',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {text}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ) : (
          <>
            <label htmlFor="review">
              {mode === 'single' ? 'Customer review' : 'Customer reviews'}
            </label>

            <p id="input-help">
              {mode === 'single'
                ? 'Enter one customer review.'
                : 'Enter one review per line, up to 50 reviews. Blank lines are ignored.'}
            </p>

            <textarea
              id="review"
              aria-describedby="input-help"
              value={mode === 'single' ? review : batchText}
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
                  : 'Enter each customer review on a separate line...'
              }
              rows={mode === 'single' ? 6 : 10}
              maxLength={mode === 'single' ? 10000 : 500100}
              disabled={busy}
            />

            <span className="character-count">
              {mode === 'single'
                ? `${review.length} / 10,000 characters`
                : `${batchReviews.length} / 50 reviews`}
            </span>
          </>
        )}

        <button
          type="button"
          className="analyze-button"
          style={{ marginTop: '20px' }}
          disabled={busy || validationError !== null}
          onClick={handleAnalyze}
        >
          {isParsing
            ? 'Reading CSV...'
            : isLoading
              ? 'Analyzing...'
              : mode === 'single'
                ? 'Analyze review'
                : 'Analyze reviews'}
        </button>

        <p role="status">
          {isParsing
            ? 'Reading your CSV file.'
            : isLoading
              ? 'Analyzing your feedback. Please wait.'
              : ''}
        </p>

        {validationError && activeReviews.length > 0 && (
          <p className="error-message" role="alert">
            {validationError}
          </p>
        )}

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>

      <div aria-live="polite">
        {exportResults.length > 0 && (
          <button
            type="button"
            className="analyze-button"
            onClick={() => downloadResults(exportResults)}
            style={{ marginBottom: '20px' }}
          >
            Download results CSV
          </button>
        )}

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

        {exportResults.length > 0 && (
          <p>
            Confidence reflects the model’s score, not measured accuracy.
          </p>
        )}
      </div>
    </main>
  )
}

export default App