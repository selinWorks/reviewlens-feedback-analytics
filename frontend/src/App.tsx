import { useState } from 'react'
import Papa from 'papaparse'
import './index.css'

type Sentiment = 'negative' | 'neutral' | 'positive'
type Mode = 'single' | 'batch' | 'csv'

type TopicMatch = {
  topic: string
  label: string
  matched_keywords: string[]
  method: 'keyword_rules'
}

type ReviewResponse = {
  text: string
  sentiment: Sentiment
  confidence: number
  scores: Record<Sentiment, number>
  model: string
  topics: TopicMatch[]
}

type TopicSummary = {
  topic: string
  label: string
  count: number
  percentage: number
  evidence: {
    review_index: number
    text: string
    review_sentiment: Sentiment
    matched_keywords: string[]
  }[]
}

type BatchResponse = {
  total: number
  counts: Record<Sentiment, number>
  results: ReviewResponse[]
  topic_summary: TopicSummary[]
  unmatched_topic_count: number
  topic_method: 'keyword_rules'
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

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
  gap: '16px',
}

const cardStyle = {
  padding: '20px',
  border: '1px solid #eaecf0',
  borderRadius: '12px',
  minWidth: 0,
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function validateReviews(texts: string[]): string | null {
  if (!texts.length) return 'Please enter at least one review.'
  if (texts.length > 50) return 'You can analyze up to 50 reviews at a time.'

  const index = texts.findIndex((text) => text.length > 10000)

  return index === -1
    ? null
    : `Review ${index + 1} exceeds the 10,000-character limit.`
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
      topics: result.topics.map((topic) => topic.label).join('; '),
      topic_matches: JSON.stringify(
        result.topics.map((topic) => ({
          topic: topic.topic,
          matched_keywords: topic.matched_keywords,
        })),
      ),
      topic_method: 'keyword_rules',
      model: result.model,
    })),
    { escapeFormulae: true },
  )

  const url = URL.createObjectURL(
    new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }),
  )
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
    <article className="review-panel result-card">
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {result.text}
      </p>

      <p>
        Overall review sentiment:{' '}
        <strong style={{ color: colors[result.sentiment] }}>
          {labels[result.sentiment]}
        </strong>
      </p>
      <p>Model confidence: <strong>{percent(result.confidence)}</strong></p>

      <h4>Matched topics</h4>
      {result.topics.length ? (
        <ul>
          {result.topics.map((topic) => (
            <li key={topic.topic}>
              <strong>{topic.label}</strong>
              {' — '}Matched keywords: {topic.matched_keywords.join(', ')}
            </li>
          ))}
        </ul>
      ) : (
        <p>No predefined topic matched this review.</p>
      )}

      <details>
        <summary style={{ cursor: 'pointer', marginBottom: '12px' }}>
          View sentiment scores
        </summary>
        {sentimentOrder.map((sentiment) => (
          <div key={sentiment} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{labels[sentiment]}</span>
              <span>{percent(result.scores[sentiment])}</span>
            </div>
            <div
              role="meter"
              aria-label={`${labels[sentiment]} score`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={result.scores[sentiment] * 100}
              style={{
                height: '10px',
                background: '#eaecf0',
                borderRadius: '999px',
                overflow: 'hidden',
                marginTop: '4px',
              }}
            >
              <div style={{
                width: `${result.scores[sentiment] * 100}%`,
                height: '100%',
                background: colors[sentiment],
              }} />
            </div>
          </div>
        ))}
      </details>
    </article>
  )
}

function TopicOverview({ data }: { data: BatchResponse }) {
  return (
    <section className="review-panel" aria-label="Topic overview">
      <h2>Topics mentioned in reviews</h2>
      <p>
        Topics are matched using predefined Turkish and English keywords.
        One review can mention several topics, so percentages may total
        more than 100%.
      </p>
      <p>
        Sentiment describes the whole review, not each individual topic.
        A topic mention does not necessarily indicate a complaint.
      </p>

      <p>
        Reviews without a topic match:{' '}
        <strong>{data.unmatched_topic_count}</strong>
      </p>

      {data.topic_summary.length === 0 ? (
        <p>No predefined topics matched these reviews.</p>
      ) : (
        <div style={gridStyle}>
          {data.topic_summary.map((topic) => (
            <article key={topic.topic} style={cardStyle}>
              <h3>{topic.label}</h3>
              <p>
                <strong>{topic.count}</strong>
                {' / '}{data.total} reviews
                {' · '}{topic.percentage.toFixed(1)}%
              </p>

              <details>
                <summary style={{ cursor: 'pointer' }}>
                  View supporting reviews ({topic.count})
                </summary>
                {topic.evidence.map((item) => (
                  <div
                    key={item.review_index}
                    style={{
                      marginTop: '16px',
                      borderTop: '1px solid #eaecf0',
                      paddingTop: '12px',
                    }}
                  >
                    <strong>Review {item.review_index}</strong>
                    <p style={{
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}>
                      {item.text}
                    </p>
                    <p>
                      Matched keywords: {item.matched_keywords.join(', ')}
                    </p>
                    <p>
                      Overall review sentiment:{' '}
                      <strong style={{ color: colors[item.review_sentiment] }}>
                        {labels[item.review_sentiment]}
                      </strong>
                    </p>
                  </div>
                ))}
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function AnalyticsCharts({ data }: { data: BatchResponse }) {
  const total = data.total
  const positiveEnd = total ? (data.counts.positive / total) * 100 : 0
  const neutralEnd = positiveEnd + (total ? (data.counts.neutral / total) * 100 : 0)
  const topics = [...data.topic_summary].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  )

  return (
    <section className="review-panel" aria-label="Feedback charts">
      <h2>Feedback at a glance</h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
        gap: '24px',
      }}>
        <figure style={{ ...cardStyle, margin: 0 }}>
          <figcaption style={{ fontSize: '20px', fontWeight: 700 }}>
            Sentiment distribution
          </figcaption>
          <p>Number of reviews by overall sentiment.</p>
          <div aria-hidden="true" style={{
            width: 'min(220px, 100%)',
            aspectRatio: '1',
            margin: '24px auto',
            borderRadius: '50%',
            background: total
              ? `conic-gradient(${colors.positive} 0% ${positiveEnd}%, ${colors.neutral} ${positiveEnd}% ${neutralEnd}%, ${colors.negative} ${neutralEnd}% 100%)`
              : '#eaecf0',
            display: 'grid',
            placeItems: 'center',
          }}>
            <div style={{
              width: '70%', height: '70%', borderRadius: '50%',
              background: '#fff', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', color: '#101828',
            }}>
              <strong style={{ fontSize: '32px' }}>{total}</strong>
              <span>reviews</span>
            </div>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {sentimentOrder.map((sentiment) => (
              <li key={sentiment} style={{
                display: 'flex', justifyContent: 'space-between',
                gap: '12px', flexWrap: 'wrap', marginTop: '12px',
              }}>
                <span>
                  <span aria-hidden="true" style={{
                    display: 'inline-block', width: '10px', height: '10px',
                    borderRadius: '50%', marginRight: '8px',
                    background: colors[sentiment],
                  }} />
                  {labels[sentiment]}
                </span>
                <strong>
                  {data.counts[sentiment]} · {percent(total ? data.counts[sentiment] / total : 0)}
                </strong>
              </li>
            ))}
          </ul>
        </figure>

        <figure style={{ ...cardStyle, margin: 0 }}>
          <figcaption style={{ fontSize: '20px', fontWeight: 700 }}>
            Topic frequency
          </figcaption>
          <p>Share of all {total} reviews mentioning each matched topic.</p>
          {topics.length === 0 ? (
            <p>No predefined topics matched these reviews.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0' }}>
              {topics.map((topic) => {
                const share = total ? topic.count / total : 0
                return (
                  <li key={topic.topic} style={{ marginBottom: '20px' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      gap: '12px', flexWrap: 'wrap', marginBottom: '8px',
                    }}>
                      <strong>{topic.label}</strong>
                      <span>{topic.count} / {total} · {percent(share)}</span>
                    </div>
                    <div aria-hidden="true" style={{
                      height: '12px', borderRadius: '999px',
                      background: '#eaecf0', overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${Math.max(0, Math.min(100, share * 100))}%`,
                        height: '100%', borderRadius: '999px', background: '#7c3aed',
                      }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <p>Reviews without a topic match: <strong>{data.unmatched_topic_count}</strong></p>
          <p style={{ fontSize: '14px' }}>
            Topics use predefined keyword matching. A review can mention multiple
            topics, so percentages may total more than 100%. Mentions include
            praise and complaints.
          </p>
        </figure>
      </div>
    </section>
  )
}

function FilteredReviews({ data }: { data: BatchResponse }) {
  const [sentiment, setSentiment] = useState<Sentiment | 'all'>('all')
  const [topic, setTopic] = useState('all')
  const filtered = data.results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) =>
      (sentiment === 'all' || result.sentiment === sentiment) &&
      (topic === 'all' || (topic === 'unmatched'
        ? result.topics.length === 0
        : result.topics.some((match) => match.topic === topic))),
    )
  const hasFilters = sentiment !== 'all' || topic !== 'all'
  const selectStyle = {
    width: '100%', padding: '12px', marginTop: '8px',
    border: '1px solid #d0d5dd', borderRadius: '10px',
    background: '#fff', color: '#101828', font: 'inherit',
  }

  return (
    <section aria-label="Review explorer">
      <div className="review-panel">
        <h2>Explore reviews</h2>
        <p>Combine filters to narrow the review list. Charts and topic summaries above show all analyzed reviews.</p>
        <div style={{
          display: 'grid', gap: '16px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
        }}>
          <div>
            <label htmlFor="sentiment-filter">Overall sentiment</label>
            <select
              id="sentiment-filter"
              value={sentiment}
              onChange={(event) => setSentiment(event.target.value as Sentiment | 'all')}
              style={selectStyle}
            >
              <option value="all">All sentiments</option>
              {sentimentOrder.map((item) => (
                <option key={item} value={item}>
                  {labels[item]} ({data.counts[item]})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="topic-filter">Matched topic</label>
            <select
              id="topic-filter"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              style={selectStyle}
            >
              <option value="all">All topics</option>
              {[...data.topic_summary]
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((item) => (
                  <option key={item.topic} value={item.topic}>
                    {item.label} ({item.count})
                  </option>
                ))}
              <option value="unmatched">No topic match ({data.unmatched_topic_count})</option>
            </select>
          </div>
        </div>
        <p role="status">Showing {filtered.length} of {data.total} reviews.</p>
        <button
          type="button"
          disabled={!hasFilters}
          onClick={() => { setSentiment('all'); setTopic('all') }}
          style={{
            padding: '10px 18px', border: '1px solid #d0d5dd',
            borderRadius: '10px', background: '#fff', color: '#344054',
            font: 'inherit', cursor: hasFilters ? 'pointer' : 'default',
            opacity: hasFilters ? 1 : 0.5,
          }}
        >
          Clear filters
        </button>
        <p style={{ fontSize: '14px' }}>Option counts refer to all analyzed reviews. Sentiment describes the whole review.</p>
        {hasFilters && filtered.length > 0 && (
          <button
            type="button"
            className="analyze-button"
            onClick={() => downloadResults(filtered.map(({ result }) => result))}
          >
            Download filtered results CSV
          </button>
        )}
      </div>
      {filtered.length === 0 ? (
        <div className="review-panel">
          <h3>No reviews match these filters</h3>
          <p>Choose another sentiment or topic, or clear the filters to see all reviews.</p>
        </div>
      ) : filtered.map(({ result, index }) => (
        <section key={index} aria-label={`Review ${index + 1}`}>
          <h3>Review {index + 1}</h3>
          <ReviewResult result={result} />
        </section>
      ))}
    </section>
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

  const batchReviews = batchText.split(/\r?\n/).map((text) => text.trim())
    .filter(Boolean)
  const activeReviews = mode === 'single'
    ? review.trim() ? [review.trim()] : []
    : mode === 'batch' ? batchReviews : csvReviews

  const busy = isLoading || isParsing
  const validationError = validateReviews(activeReviews)
  const exportResults = result ? [result] : batchResult?.results ?? []

  function clearResults() {
    setResult(null)
    setBatchResult(null)
    setError('')
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
      setError('Please select a CSV file no larger than 2 MB.')
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
        if (parsed.errors.length) {
          setError('Invalid CSV formatting. Check its quotes and columns.')
          return
        }
        if (!parsed.meta.fields?.includes('text')) {
          setError('The CSV must contain a column named "text".')
          return
        }

        const texts = parsed.data.map((row) => (row.text ?? '').trim())
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
      const body = mode === 'single'
        ? { text: activeReviews[0] }
        : { reviews: activeReviews.map((text) => ({ text })) }

      const response = await fetch(`http://127.0.0.1:8000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(
          typeof payload?.detail === 'string'
            ? payload.detail
            : `Analysis failed (${response.status}). Check your input.`,
        )
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
          : error instanceof Error ? error.message : 'Analysis failed.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark" aria-hidden="true">R</span>ReviewLens<span className="brand-tag">FEEDBACK ANALYTICS</span></a>
        <span className="workspace-tag">Your analysis workspace</span>
      </header>
      <section className="hero" aria-labelledby="page-title">
        <div>
          <span className="eyebrow">LESS READING. MORE UNDERSTANDING.</span>
          <h1 id="page-title">Every review has<br />a story. <span>See the patterns.</span></h1>
          <p>Explore customer sentiment, find recurring topics, and turn a collection of reviews into a clearer picture.</p>
          <div className="hero-tags"><span>Turkish & English</span><span>Single, batch & CSV</span><span>Exportable results</span></div>
        </div>
        <aside className="workflow-card" aria-label="How it works">
          <span className="eyebrow">FROM FEEDBACK TO FINDINGS</span>
          <ol><li><b>Add your reviews</b><span>Paste feedback or upload a CSV.</span></li><li><b>Discover the patterns</b><span>Explore sentiment and matched topics.</span></li><li><b>Take a closer look</b><span>Filter reviews and export your findings.</span></li></ol>
        </aside>
      </section>
      <div className="workspace-layout">
      <section className="review-panel input-panel" aria-busy={busy}>
        <div className="section-kicker">01 / INPUT</div>
        <h2>Start with your feedback</h2>
        <p>Add customer reviews in Turkish or English.</p>

        <div role="group" aria-label="Analysis mode" style={{
          display: 'flex', flexWrap: 'wrap', gap: '10px',
          marginBottom: '24px',
        }}>
          {(['single', 'batch', 'csv'] as Mode[]).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              disabled={busy}
              onClick={() => {
                setMode(item)
                clearResults()
              }}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: '1px solid #d0d5dd',
                background: mode === item ? '#7c3aed' : '#fff',
                color: mode === item ? '#fff' : '#344054',
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
              Select a UTF-8, comma-separated CSV with a "text" column.
              Up to 50 non-empty reviews and 2 MB. Empty reviews are ignored.
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
              <div>
                <p><strong>{fileName}</strong> — {csvReviews.length} reviews ready</p>
                <h3>Preview: first {Math.min(5, csvReviews.length)} reviews</h3>
                <ol>
                  {csvReviews.slice(0, 5).map((text, index) => (
                    <li key={index} style={{
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      marginBottom: '10px',
                    }}>{text}</li>
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
                : 'Enter one review per line, up to 50. Blank lines are ignored.'}
            </p>
            <textarea
              id="review"
              aria-describedby="input-help"
              value={mode === 'single' ? review : batchText}
              onChange={(event) => {
                if (mode === 'single') setReview(event.target.value)
                else setBatchText(event.target.value)
                clearResults()
              }}
              placeholder="Enter customer feedback..."
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
          {isParsing ? 'Reading CSV...' : isLoading ? 'Analyzing...'
            : mode === 'single' ? 'Analyze review' : 'Analyze reviews'}
        </button>

        <p role="status">
          {isParsing ? 'Reading your CSV file.'
            : isLoading ? 'Analyzing your feedback. Please wait.' : ''}
        </p>
        {validationError && activeReviews.length > 0 && (
          <p className="error-message" role="alert">{validationError}</p>
        )}
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>

      <div className="results-workspace" aria-live="polite">
        {!result && !batchResult && (
          <section className="empty-results">
            <div className="empty-graphic" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <span className="section-kicker">02 / FINDINGS</span>
            <h2>A clearer picture starts here.</h2>
            <p>{isLoading ? 'Analyzing your reviews. Your findings will appear here shortly.' : 'Add your reviews and run an analysis to explore sentiment, topic matches, and supporting feedback.'}</p>
            <div className="empty-features"><span>Sentiment</span><span>Topics</span><span>Evidence</span></div>
          </section>
        )}
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
            <p>Topics use keyword matching; sentiment describes the whole review.</p>
            <ReviewResult result={result} />
          </section>
        )}

        {batchResult && (
          <section aria-label="Batch analysis results">
            <h2>Batch analysis results</h2>
            <div className="review-panel">
              <h3>Total reviews: {batchResult.total}</h3>
              <div style={gridStyle}>
                {sentimentOrder.map((sentiment) => (
                  <div key={sentiment} style={cardStyle}>
                    <strong style={{ color: colors[sentiment] }}>
                      {labels[sentiment]}
                    </strong>
                    <div style={{ fontSize: '28px', fontWeight: 700 }}>
                      {batchResult.counts[sentiment]}
                    </div>
                    <span>
                      {percent(batchResult.counts[sentiment] / batchResult.total)}
                      {' '}of reviews
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <AnalyticsCharts data={batchResult} />

            <TopicOverview data={batchResult} />

            <FilteredReviews data={batchResult} />
          </section>
        )}

        {exportResults.length > 0 && (
          <p>Confidence reflects the model’s score, not measured accuracy.</p>
        )}
      </div>
      </div>
      <footer className="site-footer"><span>ReviewLens / Customer Feedback Analytics</span><span>Sentiment predictions · Keyword-based topic matching</span></footer>
    </main>
  )
}

export default App