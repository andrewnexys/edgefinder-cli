import { emitKeypressEvents } from 'node:readline'

interface SlashCommand {
  name: string
  desc: string
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/ask', desc: 'Ask EdgeFinder for analysis' },
  { name: '/odds', desc: 'Get Polymarket betting odds' },
  { name: '/schedule', desc: 'Get game schedule' },
  { name: '/standings', desc: 'Get league standings' },
  { name: '/portfolio', desc: 'Get portfolio data' },
  { name: '/status', desc: 'Check subscription status' },
  { name: '/nfl', desc: 'Switch to NFL' },
  { name: '/nba', desc: 'Switch to NBA' },
  { name: '/clear', desc: 'Clear conversation history' },
  { name: '/help', desc: 'Show all commands' },
  { name: '/logout', desc: 'Log out and exit' },
  { name: '/quit', desc: 'Exit' },
]

const NO_ARG_COMMANDS = new Set([
  '/status', '/nfl', '/nba', '/clear', '/help', '/logout', '/quit',
])

const E = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  white: '\x1b[37m',
  bgSel: '\x1b[48;5;238m',
  clearLine: '\x1b[2K',
  up: (n: number) => n > 0 ? `\x1b[${n}A` : '',
  down: (n: number) => n > 0 ? `\x1b[${n}B` : '',
  col: (n: number) => `\x1b[${n}G`,
} as const

const PROMPT = `${E.green}> ${E.reset}`
const PROMPT_WIDTH = 2

let keypressInitialized = false

export function promptLine(): Promise<string | null> {
  return new Promise((resolve) => {
    let buf = ''
    let cursor = 0
    let selIdx = 0
    let prevMenuH = 0

    function filtered(): SlashCommand[] {
      if (!buf.startsWith('/') || buf.includes(' ')) return []
      return SLASH_COMMANDS.filter(c => c.name.startsWith(buf.toLowerCase()))
    }

    function render() {
      const items = filtered()
      let out = ''

      // Clear old menu lines
      for (let i = 0; i < prevMenuH; i++) out += E.down(1) + E.clearLine
      if (prevMenuH > 0) out += E.up(prevMenuH)

      // Prompt line
      out += '\r' + E.clearLine + PROMPT + buf

      // Menu
      if (items.length > 0) {
        selIdx = Math.max(0, Math.min(selIdx, items.length - 1))
        for (let i = 0; i < items.length; i++) {
          const sel = i === selIdx
          const pre = sel ? E.bgSel + E.white + E.bold : E.dim
          out += '\n' + E.clearLine + `  ${pre}${items[i].name.padEnd(18)}${items[i].desc}${E.reset}`
        }
        prevMenuH = items.length
        out += E.up(items.length)
      } else {
        prevMenuH = 0
      }

      out += E.col(PROMPT_WIDTH + cursor + 1)
      process.stdout.write(out)
    }

    function clearMenu() {
      let out = ''
      for (let i = 0; i < prevMenuH; i++) out += E.down(1) + E.clearLine
      if (prevMenuH > 0) out += E.up(prevMenuH)
      prevMenuH = 0
      process.stdout.write(out)
    }

    function done(value: string | null) {
      clearMenu()
      process.stdin.removeListener('keypress', onKey)
      process.stdin.setRawMode!(false)
      process.stdin.pause()
      process.stdout.write('\n')
      resolve(value)
    }

    function onKey(
      str: string | undefined,
      key: { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean },
    ) {
      if (!key) return

      // Exit signals
      if (key.ctrl && key.name === 'c') { done(null); return }
      if (key.ctrl && key.name === 'd') { done(null); return }

      const items = filtered()

      // Enter
      if (key.name === 'return') {
        if (items.length > 0 && items[selIdx]) {
          const cmd = items[selIdx].name
          if (NO_ARG_COMMANDS.has(cmd)) {
            buf = cmd
            done(buf)
          } else {
            buf = cmd + ' '
            cursor = buf.length
            selIdx = 0
            render()
          }
          return
        }
        done(buf)
        return
      }

      // Menu navigation
      if (key.name === 'up' && items.length > 0) {
        selIdx = Math.max(0, selIdx - 1)
        render()
        return
      }
      if (key.name === 'down' && items.length > 0) {
        selIdx = Math.min(items.length - 1, selIdx + 1)
        render()
        return
      }

      // Tab - fill in selected command
      if (key.name === 'tab' && items.length > 0 && items[selIdx]) {
        buf = items[selIdx].name + ' '
        cursor = buf.length
        selIdx = 0
        render()
        return
      }

      // Backspace
      if (key.name === 'backspace') {
        if (cursor > 0) {
          buf = buf.slice(0, cursor - 1) + buf.slice(cursor)
          cursor--
          selIdx = 0
        }
        render()
        return
      }

      // Ctrl+U - clear line
      if (key.ctrl && key.name === 'u') {
        buf = ''
        cursor = 0
        selIdx = 0
        render()
        return
      }

      // Arrow keys
      if (key.name === 'left') { cursor = Math.max(0, cursor - 1); render(); return }
      if (key.name === 'right') { cursor = Math.min(buf.length, cursor + 1); render(); return }

      // Home / End
      if (key.ctrl && key.name === 'a') { cursor = 0; render(); return }
      if (key.ctrl && key.name === 'e') { cursor = buf.length; render(); return }

      // Regular character
      if (str && !key.ctrl && !key.meta) {
        buf = buf.slice(0, cursor) + str + buf.slice(cursor)
        cursor += str.length
        selIdx = 0
        render()
      }
    }

    if (!keypressInitialized) {
      emitKeypressEvents(process.stdin)
      keypressInitialized = true
    }
    process.stdin.setRawMode!(true)
    process.stdin.resume()
    process.stdin.on('keypress', onKey)
    render()
  })
}
