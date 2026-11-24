// NNACT services: a Services pane, a /services command and a status-line
// entry for the local supervisor in tools/services. The mod only runs that
// supervisor's CLI with fixed arguments and a validated service name; it
// never runs anything else and never hooks tool calls.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PaneView, ServiceRow, ServiceState } from '../types'
import { LEVEL_COLOR, LEVEL_TAG, toRows } from './logline'

const PANE = 'nnact-services'
const CLI = 'tools/services/src/cli.ts'
const CONFIG = 'tools/services/services.json'
const NAME = /^[a-z][a-z0-9-]{0,31}$/
const REFRESH_MS = 5_000
const LOG_REFRESH_MS = 1_000

const rows = atom({ plugin: 'nnact-services', key: 'rows' } as const, [] as ServiceRow[], { shape: 'rows-1' })
const view = atom({ plugin: 'nnact-services', key: 'view' } as const, { mode: 'list' } as PaneView, { shape: 'view-1' })
const logs = atom({ plugin: 'nnact-services', key: 'logs' } as const, [] as string[], { shape: 'logs-1' })
const busy = atom({ plugin: 'nnact-services', key: 'busy' } as const, [] as string[], { shape: 'busy-1' })
const problem = atom({ plugin: 'nnact-services', key: 'problem' } as const, null as string | null, { shape: 'problem-1' })
const logPaused = atom({ plugin: 'nnact-services', key: 'logPaused' } as const, false, { shape: 'paused-1' })

const LAMP: Record<ServiceState, { mark: string; color: 'success' | 'warning' | 'error' | 'inactive' }> = {
  running: { mark: '●', color: 'success' },
  starting: { mark: '◐', color: 'warning' },
  stopping: { mark: '◌', color: 'warning' },
  unhealthy: { mark: '▲', color: 'error' },
  crashed: { mark: '✕', color: 'error' },
  stopped: { mark: '○', color: 'inactive' },
}

const SHORT: Record<string, string> = { postgres: 'pg', customer: 'cust' }

// Module state; a reload starts it over. `root` stays null outside an NNACT Pro checkout.
let root: string | null = null
let refreshing = false
let logTimer: { cancel: () => void } | null = null

function uptime(ms: number | null): string {
  if (ms === null) return ''
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return `${Math.floor(ms / 1_000)}s`
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`
}

function parentOf(dir: string): string {
  return dir.replace(/\/[^/]+$/, '')
}

/** Run the supervisor CLI. Arguments are fixed words plus a name checked against NAME. */
function cli($: EngineInterface, args: string[], timeoutMs: number) {
  return $.process.run(['node', '--disable-warning=ExperimentalWarning', `${root}/${CLI}`, ...args], {
    cwd: root ?? undefined,
    timeoutMs,
  })
}

async function isCheckout($: EngineInterface, dir: string): Promise<boolean> {
  try {
    const found = await $.fs.stat(`${dir}/${CONFIG}`)
    return found.kind === 'file'
  } catch {
    return false
  }
}

async function findRoot($: EngineInterface, start: string): Promise<string | null> {
  let dir = start
  for (let depth = 0; depth < 8 && dir; depth += 1) {
    if (await isCheckout($, dir)) return dir
    const parent = parentOf(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

async function refresh($: EngineInterface): Promise<void> {
  if (!root || refreshing) return
  refreshing = true
  try {
    const { exitCode, stdout } = await cli($, ['status', '--json'], 15_000)
    if (exitCode !== 0) throw new Error('status failed')
    const next: ServiceRow[] = (JSON.parse(stdout) as ServiceRow[]).map(row => ({
      name: row.name,
      state: row.state,
      pid: row.pid,
      port: row.port,
      uptimeMs: row.uptimeMs,
      detail: row.detail,
    }))
    await update($, rows, () => next)
    await update($, problem, () => null)
    $.ui.status(`svc ${next.map(row => `${SHORT[row.name] ?? row.name}${LAMP[row.state].mark}`).join(' ')}`)
  } catch {
    // Background work: report what it can and never leave a rejection behind.
    await update($, problem, () => 'The services supervisor is not answering.').catch(() => undefined)
    $.ui.status('svc: supervisor unreachable')
  } finally {
    refreshing = false
  }
}

async function loadLogs($: EngineInterface, name: string): Promise<void> {
  if (!NAME.test(name)) return
  try {
    const { stdout } = await cli($, ['logs', name, '-n', '300'], 10_000)
    await update($, logs, () => stdout.split('\n'))
  } catch {
    // The next tick tries again.
  }
}

async function act($: EngineInterface, action: 'start' | 'stop' | 'restart', name: string): Promise<string> {
  if (!NAME.test(name)) return `Not a service name: ${name}`
  await update($, busy, list => [...list.filter(item => item !== name), name])
  try {
    const { stdout, stderr } = await cli($, [action, name, '--json'], 180_000)
    try {
      const result = JSON.parse(stdout) as { ok: boolean; message: string }
      if (!result.ok) $.ui.toast(result.message)
      return result.message
    } catch {
      const message = (stderr || stdout).trim() || `${action} ${name} failed`
      $.ui.toast(message)
      return message
    }
  } finally {
    await update($, busy, list => list.filter(item => item !== name))
    await refresh($)
  }
}

async function showLogs($: EngineInterface, name: string): Promise<void> {
  await update($, view, () => ({ mode: 'logs', name }) as PaneView)
  await update($, logPaused, () => false)
  await loadLogs($, name)
  followLogs($, name)
}

function followLogs($: EngineInterface, name: string): void {
  logTimer?.cancel()
  logTimer = $.clock.every(LOG_REFRESH_MS, () => void loadLogs($, name))
}

/** Freeze the log view so lines can be read, or resume following. */
async function togglePause($: EngineInterface, name: string): Promise<void> {
  const paused = await read($, logPaused)
  await update($, logPaused, () => !paused)
  if (paused) {
    await loadLogs($, name)
    followLogs($, name)
  } else {
    logTimer?.cancel()
    logTimer = null
  }
}

async function showList($: EngineInterface): Promise<void> {
  logTimer?.cancel()
  logTimer = null
  await update($, view, () => ({ mode: 'list' }) as PaneView)
}

/** Start the supervisor (idempotent) and take a first reading, off the startup path. */
async function warmUp($: EngineInterface): Promise<void> {
  await cli($, ['ensure', '--quiet'], 15_000).catch(() => undefined)
  await refresh($)
}

async function statusText($: EngineInterface): Promise<string> {
  const { stdout, stderr, exitCode } = await cli($, ['status'], 15_000)
  void refresh($)
  return exitCode === 0 ? stdout.trimEnd() : stderr.trim() || 'The services supervisor is not answering.'
}

async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: 'Services', focus: true })
}

async function closePane($: EngineInterface): Promise<void> {
  await showList($)
  await $.ui.close({ id: PANE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    root = await findRoot($, e.cwd)
    if (!root) return started

    await $.command.register({
      name: 'services',
      description: 'NNACT local services: status | start | stop | restart | logs <name> | open',
    })
    // Never hold up the session: the supervisor starts in the background.
    void warmUp($)
    $.clock.every(REFRESH_MS, () => void refresh($))
    if (e.isInteractive) void $.ui.open({ id: PANE, title: 'Services' })
    return started
  })

  on('command.run', { command: 'services' }, async ($, e) => {
    if (!root) return { text: 'This session is not in an NNACT Pro checkout.' }
    const [sub = 'status', name = ''] = e.args.trim().split(/\s+/).filter(Boolean)
    switch (sub) {
      case 'status':
        return { text: await statusText($) }
      case 'start':
      case 'stop':
      case 'restart':
        if (!NAME.test(name)) return { text: `usage: /services ${sub} <name>` }
        return { text: await act($, sub, name) }
      case 'logs':
        if (!NAME.test(name)) return { text: 'usage: /services logs <name>' }
        await openPane($)
        await showLogs($, name)
        return {
          text: `Showing ${name}'s log in the Services pane.`,
          context: [`To follow ${name}'s log yourself, run the Monitor tool on: tools/services/services.sh logs ${name} -f`],
        }
      case 'open':
        await openPane($)
        await showList($)
        return { text: 'Services pane opened.' }
      default:
        return { text: 'usage: /services [status | start <name> | stop <name> | restart <name> | logs <name> | open]' }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current = await read($, view)
    const height = Math.max(6, (e.viewport?.rows ?? 24) - 3)

    // An icon control: a one-glyph plain Button, focusable and pressable.
    const Icon = (props: { id: string; glyph: string; color?: string; dim?: boolean; onPress: () => unknown }) => (
      <Button key={props.id} label={props.glyph} plain dimColor={props.dim} onPress={() => void props.onPress()} />
    )

    if (current.mode === 'logs') {
      const paused = await read($, logPaused)
      const lines = toRows(await read($, logs), height - 2)
      const service = (await read($, rows)).find(row => row.name === current.name)
      const lamp = service ? LAMP[service.state] : LAMP.stopped
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={2}>
            <Icon id="back" glyph="←" onPress={() => showList($)} />
            <Text color={lamp.color}>{lamp.mark}</Text>
            <Text bold>{current.name}</Text>
            <Text dimColor>{paused ? 'paused' : 'live'} · {lines.length} lines</Text>
            <Box flexGrow={1} />
            <Icon id="pause" glyph={paused ? '▶' : '⏸'} onPress={() => togglePause($, current.name)} />
            <Icon id="close-logs" glyph="✕" onPress={() => closePane($)} />
          </Box>
          <Box flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
            {lines.length === 0 ? <Text dimColor>No log lines yet.</Text> : null}
            {lines.map((row, index) => (
              <Box key={`l${index}`} flexDirection="row" gap={1}>
                <Text dimColor mono>{(row.time || '        ').padEnd(8)}</Text>
                <Text color={LEVEL_COLOR[row.level]} bold mono>
                  {LEVEL_TAG[row.level]}
                </Text>
                <Text mono wrap="truncate-end">
                  {row.text}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    const list = await read($, rows)
    const working = await read($, busy)
    const trouble = await read($, problem)
    const nameWidth = Math.max(8, ...list.map(row => row.name.length))
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Text bold>Services</Text>
          <Text dimColor>
            {list.filter(row => row.state === 'running').length}/{list.length} running
          </Text>
          <Box flexGrow={1} />
          <Icon id="refresh" glyph="⟳" onPress={() => refresh($)} />
          <Icon id="close" glyph="✕" onPress={() => closePane($)} />
        </Box>
        {trouble ? <Text color="error">{trouble}</Text> : null}
        {list.length === 0 && !trouble ? <Text dimColor>Asking the supervisor…</Text> : null}
        {list.length > 0 ? (
          <Box flexDirection="row" gap={1}>
            <Text dimColor mono>
              {'  '}
              {'SERVICE'.padEnd(nameWidth)} {'STATE'.padEnd(10)} {'PORT'.padEnd(6)} {'UP'.padEnd(6)}
            </Text>
          </Box>
        ) : null}
        {list.map(row => {
          const lamp = LAMP[row.state]
          const isBusy = working.includes(row.name)
          const isUp = row.state !== 'stopped' && row.state !== 'crashed'
          return (
            <Box key={row.name} flexDirection="row" gap={1}>
              <Text color={lamp.color}>{lamp.mark}</Text>
              <Text bold mono>
                {row.name.padEnd(nameWidth)}
              </Text>
              <Text color={isBusy ? 'warning' : lamp.color} mono>
                {(isBusy ? 'working…' : row.state).padEnd(10)}
              </Text>
              <Text dimColor mono>
                {(row.port ? String(row.port) : '—').padEnd(6)}
              </Text>
              <Text dimColor mono>
                {(uptime(row.uptimeMs) || '—').padEnd(6)}
              </Text>
              <Icon
                id={`toggle-${row.name}`}
                glyph={isUp ? '■' : '▶'}
                dim={isBusy}
                onPress={() => act($, isUp ? 'stop' : 'start', row.name)}
              />
              <Icon id={`restart-${row.name}`} glyph="↻" dim={isBusy || !isUp} onPress={() => act($, 'restart', row.name)} />
              <Icon id={`logs-${row.name}`} glyph="≡" onPress={() => showLogs($, row.name)} />
              {row.detail ? (
                <Text dimColor wrap="truncate-end">
                  {row.detail}
                </Text>
              ) : null}
            </Box>
          )
        })}
        <Text dimColor>▶ start  ■ stop  ↻ restart  ≡ logs  ⟳ refresh  ✕ close · ctrl+x tab to focus, arrows, Enter</Text>
      </Box>
    )
  })
}
