// Turns one raw log line into terminal columns: time, level, source, message.
// The services write a mix of pino JSON (api, worker), tsx/Next.js text and
// the supervisor's own `--- <time> ...` markers; ANSI codes are stripped.

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'sys'

export type LogRow = {
  time: string
  level: LogLevel
  text: string
}

const PINO_LEVELS: Record<number, LogLevel> = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' }

export const LEVEL_TAG: Record<LogLevel, string> = {
  trace: 'TRC',
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
  fatal: 'FTL',
  sys: 'SYS',
}

export const LEVEL_COLOR: Record<LogLevel, 'inactive' | 'subtle' | 'suggestion' | 'warning' | 'error' | 'claude'> = {
  trace: 'inactive',
  debug: 'subtle',
  info: 'suggestion',
  warn: 'warning',
  error: 'error',
  fatal: 'error',
  sys: 'claude',
}

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g

function clock(value: unknown): string {
  const date = typeof value === 'number' || typeof value === 'string' ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function guessLevel(text: string): LogLevel {
  if (/\b(error|exception|failed|fatal|uncaught|ELIFECYCLE)\b/i.test(text)) return 'error'
  if (/\b(warn|warning|deprecat)/i.test(text)) return 'warn'
  return 'info'
}

function fromPino(entry: Record<string, unknown>): LogRow {
  const level = PINO_LEVELS[Number(entry.level)] ?? 'info'
  const req = entry.req as { method?: string; url?: string } | undefined
  const res = entry.res as { statusCode?: number } | undefined
  const parts: string[] = []
  if (req?.method) parts.push(`${req.method} ${req.url ?? ''}`.trim())
  if (res?.statusCode) parts.push(`→ ${res.statusCode}`)
  if (typeof entry.responseTime === 'number') parts.push(`${Math.round(entry.responseTime)}ms`)
  const msg = typeof entry.msg === 'string' ? entry.msg : ''
  // "incoming request" / "request completed" add nothing next to the request itself.
  const text = parts.length && /^(incoming request|request completed)$/.test(msg) ? parts.join(' ') : [msg, ...parts].filter(Boolean).join('  ')
  const err = entry.err as { message?: string } | undefined
  return { time: clock(entry.time), level, text: (err?.message ? `${text}  ${err.message}` : text).split('\n')[0]! }
}

export function parseLogLine(raw: string): LogRow | null {
  const line = raw.replace(ANSI, '').replace(/\r/g, '').trimEnd()
  if (!line.trim()) return null
  const marker = /^--- (\S+) (.*)$/.exec(line)
  if (marker) return { time: clock(marker[1]), level: 'sys', text: marker[2]! }
  if (line.startsWith('{')) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>
      if (entry && typeof entry === 'object' && ('msg' in entry || 'level' in entry)) return fromPino(entry)
    } catch {
      // not JSON after all; fall through to plain text
    }
  }
  return { time: '', level: guessLevel(line), text: line }
}

/** Parse, drop blanks, and keep the newest `max` rows. */
export function toRows(lines: readonly string[], max: number): LogRow[] {
  const rows: LogRow[] = []
  for (const line of lines) {
    const row = parseLogLine(line)
    if (row) rows.push(row)
  }
  return rows.slice(-Math.max(1, max))
}
