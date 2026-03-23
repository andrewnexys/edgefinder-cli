import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const CONFIG_DIR = join(homedir(), '.edgefinder')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

interface Config {
  apiKey?: string
  baseUrl?: string
}

function readConfig(): Config {
  try {
    if (!existsSync(CONFIG_FILE)) return {}
    const raw = readFileSync(CONFIG_FILE, 'utf-8')
    return JSON.parse(raw) as Config
  } catch {
    return {}
  }
}

function writeConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8')
  chmodSync(CONFIG_FILE, 0o600)
}

export function getApiKey(): string | undefined {
  return process.env.EDGEFINDER_API_KEY || readConfig().apiKey
}

export function getBaseUrl(): string {
  return process.env.EDGEFINDER_BASE_URL || readConfig().baseUrl || 'https://chat.edgefinder.io'
}

export function setApiKey(apiKey: string): void {
  const config = readConfig()
  config.apiKey = apiKey
  writeConfig(config)
}

export function setBaseUrl(baseUrl: string): void {
  const config = readConfig()
  config.baseUrl = baseUrl
  writeConfig(config)
}

export function clearApiKey(): void {
  const config = readConfig()
  delete config.apiKey
  writeConfig(config)
}

export function getConfigSummary(): { apiKey: string | null; baseUrl: string; configPath: string } {
  const key = getApiKey()
  return {
    apiKey: key ? key.substring(0, 15) + '...' : null,
    baseUrl: getBaseUrl(),
    configPath: CONFIG_FILE,
  }
}
