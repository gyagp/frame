// Preserve ordinary/approved deliveries. Only rescue an overflowing scene by
// removing near-digital silence at clip edges and using smaller editorial gaps.
export function trimSpeechPadding(samples, rate) {
  const threshold = 4 / 32768; // about -78 dBFS; preserve real quiet speech
  let first = 0,
    last = samples.length - 1;
  while (first < samples.length && Math.abs(samples[first]) <= threshold)
    first++;
  if (first === samples.length) return samples;
  while (last > first && Math.abs(samples[last]) <= threshold) last--;
  const start = Math.max(0, first - Math.round(rate * 0.06));
  const end = Math.min(samples.length, last + 1 + Math.round(rate * 0.1));
  return samples.subarray(start, end);
}

export function narrationFit(entries, sceneDuration, rate = 24000) {
  const original = entries.reduce((n, e) => n + e.samples.length / rate, 0);
  const available =
    sceneDuration - 1.2 - Math.max(0, entries.length - 1) * 0.18;
  const tempo = Math.max(1, original / available);
  if (tempo <= 1.3)
    return {
      entries,
      original,
      fitted: original,
      available,
      tempo,
      leadIn: 0.6,
      gap: 0.18,
      tail: 0.6,
      trimmedSeconds: 0,
      mode: "original",
    };
  const trimmed = entries.map((e) => ({
    ...e,
    samples: trimSpeechPadding(e.samples, rate),
  }));
  const fitted = trimmed.reduce((n, e) => n + e.samples.length / rate, 0);
  const compactAvailable =
    sceneDuration - 0.7 - Math.max(0, entries.length - 1) * 0.16;
  return {
    entries: trimmed,
    original,
    fitted,
    available: compactAvailable,
    tempo: Math.max(1, fitted / compactAvailable),
    leadIn: 0.35,
    gap: 0.16,
    tail: 0.35,
    trimmedSeconds: original - fitted,
    mode: "trimmed-padding",
  };
}
