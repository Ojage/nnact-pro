import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const ROOT = '/repo'
const CLI = `${ROOT}/tools/services/src/cli.ts`

const PANE = {
  plugin: 'nnact-services',
  component: 'Pane',
  requestId: 'nnact-services',
  props: {
    title: 'Services',
    isFocused: true,
    bodyColumns: 120,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const STATUS = JSON.stringify([
  { name: 'api', state: 'running', pid: 4242, port: 3003, uptimeMs: 125_000, detail: null },
  { name: 'web', state: 'stopped', pid: null, port: 3000, uptimeMs: null, detail: null },
  { name: 'postgres', state: 'crashed', pid: null, port: 5433, uptimeMs: null, detail: 'exited with code 1' },
])

type Run = readonly string[]

const LOG = [
  '--- 2026-11-24T10:00:00.000Z starting api: pnpm dev',
  '{"level":30,"time":1795543229496,"msg":"incoming request","req":{"method":"GET","url":"/api/jobs"}}',
  '{"level":50,"time":1795543229500,"msg":"[redacted:SECRET] line two"}',
  '\u001b[33mwarning\u001b[39m: plain text line',
].join('\n')

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

/** Stand in for the engine: a checkout at ROOT and a supervisor CLI that answers. */
function engine(on: On, runs: Run[], { inCheckout = true } = {}) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'services' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  // Timers never fire in these tests; the refresh is driven by the commands.
  on('clock.every', () => ({ value: undefined }))
  on('fs.stat', (_, e) => {
    if (inCheckout && e.path === `${ROOT}/tools/services/services.json`) {
      return { value: { kind: 'file', size: 10, mtimeMs: 0, isLink: false } }
    }
    throw new Error('ENOENT')
  })
  on('process.run', (_, e) => {
    runs.push(e.argv)
    const verb = e.argv[3]
    if (verb === 'status' && e.argv.includes('--json')) return { value: { exitCode: 0, stdout: STATUS, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (verb === 'status') return { value: { exitCode: 0, stdout: 'SERVICE  STATE\napi      ● running\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (verb === 'start' || verb === 'stop' || verb === 'restart') {
      return { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, name: e.argv[4], message: `${e.argv[4]} ${verb}ed` }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    if (verb === 'logs') return { value: { exitCode: 0, stdout: LOG, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
}

test('outside an NNACT Pro checkout the mod does nothing', async ($, on) => {
  const runs: Run[] = []
  engine(on, runs, { inCheckout: false })
  await $.session.start({ cwd: '/elsewhere', surface: 'terminal', isInteractive: true })
  expect(runs.length).toBe(0)
})

test('session start launches the supervisor with fixed arguments and never starts a service', async ($, on) => {
  const runs: Run[] = []
  engine(on, runs)
  await $.session.start({ cwd: `${ROOT}/apps/web`, surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'services', args: 'status', ...RUN })
  expect(runs[0]).toEqual(['node', '--disable-warning=ExperimentalWarning', CLI, 'ensure', '--quiet'])
  expect(runs.some(argv => ['start', 'stop', 'restart'].includes(argv[3] ?? ''))).toBe(false)
})

test('/services only passes valid service names to the supervisor', async ($, on) => {
  const runs: Run[] = []
  engine(on, runs)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  const bad = await $.command.run({ command: 'services', args: 'start api;rm', ...RUN })
  expect(bad.text).toBe('usage: /services start <name>')
  expect(runs.some(argv => argv.includes('api;rm'))).toBe(false)

  const good = await $.command.run({ command: 'services', args: 'restart api', ...RUN })
  expect(good.text).toBe('api restarted')
  expect(runs.some(argv => argv.join(' ') === `node --disable-warning=ExperimentalWarning ${CLI} restart api --json`)).toBe(true)
})

test('the pane shows each service with a lamp and toggles it, on every surface', async ($, on) => {
  const runs: Run[] = []
  engine(on, runs)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'services', args: 'open', ...RUN })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^running/ }))?.text).toMatch(/running/)
    expect((await ui.find({ type: 'Text', text: /exited with code 1/ }))?.text).toBe('exited with code 1')
    expect((await ui.find({ key: 'toggle-api' }))?.text).toMatch(/■/)
    expect((await ui.find({ key: 'toggle-web' }))?.text).toMatch(/▶/)
    await ui.press({ key: 'toggle-web' })
    expect(runs.some(argv => argv[3] === 'start' && argv[4] === 'web')).toBe(true)
    await ui.unmount()
  }
})

test('/services logs shows the redacted log in the pane and tells Claude how to follow it', async ($, on) => {
  const runs: Run[] = []
  engine(on, runs)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const result = await $.command.run({ command: 'services', args: 'logs api', ...RUN })
  expect(result.text).toBe("Showing api's log in the Services pane.")
  expect(result.context?.[0]).toMatch(/services\.sh logs api -f/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /line two/ }))?.text).toBe('[redacted:SECRET] line two')
  expect((await ui.find({ type: 'Text', text: /^GET \/api\/jobs$/ }))?.text).toBe('GET /api/jobs')
  expect((await ui.find({ type: 'Text', text: /^ERR$/ }))?.text).toBe('ERR')
  expect((await ui.find({ type: 'Text', text: /^SYS$/ }))?.text).toBe('SYS')
  expect((await ui.find({ type: 'Text', text: /plain text line/ }))?.text).toBe('warning: plain text line')
  await ui.press({ key: 'pause' })
  expect((await ui.find({ type: 'Text', text: /paused/ }))?.text).toMatch(/paused/)
  await ui.press({ key: 'back' })
  expect((await ui.find({ key: 'toggle-api' }))?.text).toMatch(/■/)
  await ui.unmount()
})
