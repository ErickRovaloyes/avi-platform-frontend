/**
 * Word-level diff using a Longest-Common-Subsequence algorithm.
 * No external dependencies.
 *
 * Returns an array of diff ops:
 *   [ { op: 'equal'  | 'remove' | 'add', text: string }, ... ]
 *
 * Punctuation and whitespace are preserved as their own tokens so that
 * the rendered diff reads as the original prose.
 */

// Tokenize keeping whitespace + punctuation as separate tokens
function tokenize(str) {
  if (!str) return []
  // Split on whitespace but keep the spaces; also split words from punctuation
  // ex: "Hola, mundo!" → ['Hola', ',', ' ', 'mundo', '!']
  const re = /([A-Za-zÀ-ÿ0-9_]+|\s+|[^A-Za-zÀ-ÿ0-9_\s])/g
  return str.match(re) || []
}

// Build LCS matrix (size-optimized when one input is much longer)
function lcsMatrix(a, b) {
  const n = a.length, m = b.length
  // dp[i][j] = LCS length of a[0..i) and b[0..j)
  const dp = new Array(n + 1)
  for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1)
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1
      else                       dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp
}

function backtrack(dp, a, b) {
  const ops = []
  let i = a.length, j = b.length
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1])    { ops.push({ op: 'equal',  text: a[i - 1] }); i--; j-- }
    else if (dp[i - 1][j] >= dp[i][j - 1]) { ops.push({ op: 'remove', text: a[i - 1] }); i-- }
    else                          { ops.push({ op: 'add',    text: b[j - 1] }); j-- }
  }
  while (i > 0) { ops.push({ op: 'remove', text: a[i - 1] }); i-- }
  while (j > 0) { ops.push({ op: 'add',    text: b[j - 1] }); j-- }
  ops.reverse()
  return ops
}

// Merge consecutive ops of the same type to render fewer DOM nodes
function coalesce(ops) {
  const out = []
  for (const op of ops) {
    const last = out[out.length - 1]
    if (last && last.op === op.op) last.text += op.text
    else out.push({ op: op.op, text: op.text })
  }
  return out
}

export function computeDiff(oldStr, newStr) {
  const a = tokenize(oldStr)
  const b = tokenize(newStr)
  // Cap on very large texts (~25k tokens) to avoid O(n*m) blowup.
  // Above the cap we fall back to a coarse line-level diff.
  if (a.length * b.length > 4_000_000) return computeLineDiff(oldStr, newStr)
  const dp = lcsMatrix(a, b)
  return coalesce(backtrack(dp, a, b))
}

// Cheap fallback for very large inputs: line granularity
function computeLineDiff(oldStr, newStr) {
  const a = (oldStr || '').split(/(\n)/)
  const b = (newStr || '').split(/(\n)/)
  const dp = lcsMatrix(a, b)
  return coalesce(backtrack(dp, a, b))
}

// Diff statistics for badges (counts characters, not tokens)
export function diffStats(ops) {
  let removed = 0, added = 0
  for (const o of ops) {
    if (o.op === 'remove') removed += o.text.length
    else if (o.op === 'add') added += o.text.length
  }
  return { removed, added }
}
