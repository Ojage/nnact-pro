export type ServiceState = 'stopped' | 'starting' | 'running' | 'unhealthy' | 'crashed' | 'stopping'

/** One row of `services status --json`, as the pane draws it. */
export type ServiceRow = {
  name: string
  state: ServiceState
  pid: number | null
  port: number | null
  uptimeMs: number | null
  detail: string | null
}

export type PaneView = { mode: 'list' } | { mode: 'logs'; name: string }

declare module 'claude-code' {
  interface PluginState {
    'nnact-services': {
      rows: Shaped<ServiceRow[]>
      view: Shaped<PaneView>
      logs: Shaped<string[]>
      busy: Shaped<string[]>
      problem: Shaped<string | null>
    }
  }
}
