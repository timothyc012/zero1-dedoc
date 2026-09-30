/** Limit native OCR thread pools to the process CPU allocation. An explicit
 * budget is useful on slower x86 hosts; defaults retain the measured v6 budget
 * and the upstream v5 runtime policy.
 */
export function ocrCpuThreads(generation: number | undefined, available: number, requested?: string): number | undefined {
  if (requested !== undefined) {
    if (!/^[1-9]\d?$/.test(requested) || Number(requested) > 64) {
      throw new Error('ZERO1_OCR_THREADS must be an integer from 1 to 64')
    }
    return Math.min(Number(requested), available)
  }
  return generation === 6 ? Math.min(4, available) : undefined
}
