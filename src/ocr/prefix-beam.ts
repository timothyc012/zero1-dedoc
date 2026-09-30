/** Bounded CTC prefix search: sum alternate blank/repeat alignments without a
 * lexicon or language model. Algorithm: https://distill.pub/2017/ctc/#inference
 * Keep a Viterbi trace for the selected prefix's confidence and pixel alignment.
 */
interface Trace { token: number; time: number; probability: number; previous: Trace | null }
interface Prefix {
  tokens: number[]; blank: number; nonblank: number
  /** Viterbi scores are log probabilities, independent of prefix normalization. */
  bestBlank: number; bestNonblank: number; blankTrace: Trace | null; nonblankTrace: Trace | null
}
export interface CtcRead { text: string; confidence: number; steps: number[] }
const BEAM = 5, TOKEN_LIMIT = 5, MIN_PROBABILITY = 0.001
export function ctcPrefixBeamDecode(data: Float32Array, T: number, C: number, dict: string[], greedy?: CtcRead | null): CtcRead | null {
  let beam: Prefix[] = [{ tokens: [], blank: 1, nonblank: 0, bestBlank: 0, bestNonblank: -Infinity, blankTrace: null, nonblankTrace: null }]
  for (let t = 0; t < T; t++) {
    const off = t * C, candidates: Array<[number, number]> = []
    for (let c = 0; c < C; c++) if (data[off + c] > MIN_PROBABILITY) candidates.push([c, data[off + c]])
    candidates.sort((a, b) => b[1] - a[1]);candidates.length = Math.min(TOKEN_LIMIT, candidates.length)
    if (!candidates.some(([c]) => c === 0)) candidates.push([0, data[off]])
    const next = new Map<string, Prefix>()
    const get = (tokens: number[]): Prefix => {
      const key = tokens.join(',');let p = next.get(key)
      if (!p) { p = { tokens, blank: 0, nonblank: 0, bestBlank: -Infinity, bestNonblank: -Infinity, blankTrace: null, nonblankTrace: null };next.set(key, p) }
      return p
    }
    const add = (p: Prefix, blank: boolean, mass: number, best: number, trace: Trace | null, token: number, probability: number) => {
      if (blank) {
        p.blank += mass * probability
        if (best + Math.log(probability) > p.bestBlank) { p.bestBlank = best + Math.log(probability);p.blankTrace = { token, time: t, probability, previous: trace } }
      } else {
        p.nonblank += mass * probability
        if (best + Math.log(probability) > p.bestNonblank) { p.bestNonblank = best + Math.log(probability);p.nonblankTrace = { token, time: t, probability, previous: trace } }
      }
    }
    for (const p of beam) for (const [token, probability] of candidates) {
      if (probability <= 0) continue
      const fromBlank = p.bestBlank >= p.bestNonblank
      const best = fromBlank ? p.bestBlank : p.bestNonblank, trace = fromBlank ? p.blankTrace : p.nonblankTrace
      if (token === 0) add(get(p.tokens), true, p.blank + p.nonblank, best, trace, token, probability)
      else if (token === p.tokens[p.tokens.length - 1]) {
        add(get(p.tokens), false, p.nonblank, p.bestNonblank, p.nonblankTrace, token, probability)
        add(get([...p.tokens, token]), false, p.blank, p.bestBlank, p.blankTrace, token, probability)
      } else add(get([...p.tokens, token]), false, p.blank + p.nonblank, best, trace, token, probability)
    }
    beam = [...next.values()].sort((a, b) => (b.blank + b.nonblank) - (a.blank + a.nonblank)).slice(0, BEAM)
    const total = beam.reduce((sum, p) => sum + p.blank + p.nonblank, 0)
    if (!(total > 0) || !Number.isFinite(total)) return greedy ?? null
    for (const p of beam) { p.blank /= total;p.nonblank /= total }
  }
  const chosen = beam[0]
  if (!chosen?.tokens.length) return null
  const tokenText = (token: number) => token === dict.length + 1 ? ' ' : dict[token - 1] ?? ''
  const text = chosen.tokens.map(tokenText).join('')
  // Most lines are unambiguous: retain the established greedy confidence and
  // alignment exactly when search selects the same transcription.
  if (greedy?.text === text) return greedy
  let trace = chosen.bestBlank >= chosen.bestNonblank ? chosen.blankTrace : chosen.nonblankTrace
  const alignment: Trace[] = []
  while (trace) { alignment.push(trace);trace = trace.previous }
  alignment.reverse()
  const runs: Array<{token: number; first: number; last: number; probability: number}> = []
  let previous = -1
  for (const a of alignment) {
    if (a.token === previous && a.token !== 0) runs[runs.length - 1].last = a.time
    else if (a.token !== 0) runs.push({ token: a.token, first: a.time, last: a.time, probability: a.probability })
    previous = a.token
  }
  const steps = runs.flatMap(r => [...tokenText(r.token)].map(() => (r.first + r.last) / 2))
  return { text, steps, confidence: runs.reduce((sum, r) => sum + r.probability, 0) / Math.max(1, runs.length) }
}
