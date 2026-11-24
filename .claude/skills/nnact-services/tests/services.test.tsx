import { expect, test } from 'claude-code/testing'

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

/** Stand in for the engine: a checkout at ROOT and a supervisor CLI that answers. */
function engine(on: Parameters<Parameters<typeof test>[1]>[1], runs: Run[], { inCheckout = true } = {}) {
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
    if (verb === 'status' && e.argv.includes('--json')) return { value: { exitCode: 0, stdout: STATUS, stderr: '' } }
    if (verb === 'status') return { value: { exitCode: 0, stdout: 'SERVICE  STATE\napi      ● running\n', stderr: '' } }
    if (verb === 'start' || verb === 'stop' || verb === 'restart') {
      return { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, name: e.argv[4], message: `${e.argv[4]} ${verb}ed` }), stderr: '' } }
    }
    if (verb === 'logs') return { value: { exitCode: 0, stdout: 'line one\n[redacted:SECRET] line two\n', stderr: '' } }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
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
  await $.command.run({ command: 'services', args: 'status' })
  expect(runs[0]).toEqual(['node', '--disable-warning=ExperimentalWarning', CLI, 'ensure', '--quiet'])
  expect(runs.some(argv => ['start', 'stop', 'restart'].includes(argv[3] ?? ''))).toBe(false)
})

test('/services only passes valid service names to the supervisor', async ($, on) => {
  const runs: Run[] = []
  engine(on, runs)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  const bad = await $.command.run({ command: 'services', args: 'start api;rm' })
  expect(bad.text).toBe('usage: /services start <name>')
  expect(runs.some(argv => argv.includes('api;rm'))).toBe(false)

  const good = await $.command.run({ command: 'services', args: 'restart api' })
  expect(good.text).toBe('api restarted')
  expect(runs.some(argv => argv.join(' ') === `node --disable-warning=ExperimentalWarning ${CLI} restart api --json`)).toBe(true)
})

test('the pane shows each service with a lamp and toggles it, on every surface', async ($, on) => {
  const runs: Run[] = []
  engine(on, runs)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'services', args: 'open' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^running/ }))?.text).toMatch(/running/)
    expect((await ui.find({ type: 'Text', text: /exited with code 1/ }))?.text).toBe('exited with code 1')
    expect((await ui.find({ key: 'toggle-api' }))?.text).toMatch(/Stop/)
    expect((await ui.find({ key: 'toggle-web' }))?.text).toMatch(/Start/)
    await ui.press({ key: 'toggle-web' })
    expect(runs.some(argv => argv[3] === 'start' && argv[4] === 'web')).toBe(true)
    await ui.unmount()
  }
})

test('/services logs shows the redacted log in the pane and tells Claude how to follow it', async ($, on) => {
  const runs: Run[] = []
  engine(on, runs)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const result = await $.command.run({ command: 'services', args: 'logs api' })
  expect(result.text).toBe("Showing api's log in the Services pane.")
  expect(result.context?.[0]).toMatch(/services\.sh logs api -f/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /line two/ }))?.text).toBe('[redacted:SECRET] line two')
  await ui.press({ key: 'back' })
  expect((await ui.find({ key: 'toggle-api' }))?.text).toMatch(/Stop/)
  await ui.unmount()
})
