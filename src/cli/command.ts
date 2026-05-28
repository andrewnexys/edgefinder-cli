type OptionParser = (value: string) => unknown
type ActionHandler = (...args: unknown[]) => void | Promise<void>

interface OptionDefinition {
  flags: string
  flag: string
  property: string
  takesValue: boolean
  description: string
  parser?: OptionParser
  defaultValue?: unknown
}

interface ArgumentDefinition {
  name: string
  required: boolean
  defaultValue?: string
}

interface ParsedArgs {
  options: Record<string, unknown>
  positionals: string[]
}

export class Command {
  private commandName = ''
  private commandDescription = ''
  private versionValue = ''
  private options: OptionDefinition[] = []
  private arguments: ArgumentDefinition[] = []
  private subcommands = new Map<string, Command>()
  private actionHandler?: ActionHandler

  constructor(name?: string) {
    this.commandName = name ?? ''
  }

  name(value: string): this {
    this.commandName = value
    return this
  }

  description(value: string): this {
    this.commandDescription = value
    return this
  }

  version(value: string): this {
    this.versionValue = value
    return this
  }

  argument(spec: string, _description: string, defaultValue?: string): this {
    this.arguments.push({
      name: spec.replace(/[<>\[\]]/g, ''),
      required: spec.startsWith('<'),
      defaultValue,
    })
    return this
  }

  option(flags: string, description: string, parserOrDefault?: OptionParser | unknown, defaultValue?: unknown): this {
    const flag = flags.split(/[ ,|]+/).find((part) => part.startsWith('--'))
    if (!flag) {
      throw new Error(`Invalid option flags: ${flags}`)
    }

    const parser = typeof parserOrDefault === 'function' ? parserOrDefault as OptionParser : undefined
    const optionDefault = parser ? defaultValue : parserOrDefault

    this.options.push({
      flags,
      flag,
      property: toCamelCase(flag.replace(/^--/, '').replace(/[ <[].*$/, '')),
      takesValue: /[<[]/.test(flags),
      description,
      parser,
      defaultValue: optionDefault,
    })
    return this
  }

  command(name: string): Command {
    const command = new Command(name)
    this.addCommand(command)
    return command
  }

  addCommand(command: Command): this {
    this.subcommands.set(command.commandName, command)
    return this
  }

  action<TArgs extends unknown[]>(handler: (...args: TArgs) => void | Promise<void>): this {
    this.actionHandler = handler as ActionHandler
    return this
  }

  async parse(argv: string[]): Promise<void> {
    await this.run(argv.slice(2))
  }

  private async run(tokens: string[]): Promise<void> {
    const [maybeSubcommand, ...rest] = tokens
    if (maybeSubcommand && this.subcommands.has(maybeSubcommand)) {
      await this.subcommands.get(maybeSubcommand)?.run(rest)
      return
    }

    if (tokens.includes('--help') || tokens.includes('-h')) {
      this.printHelp()
      return
    }

    if (this.versionValue && (tokens.includes('--version') || tokens.includes('-V'))) {
      console.log(this.versionValue)
      return
    }

    if (this.subcommands.size > 0 && !this.actionHandler) {
      const commandLabel = this.commandName || 'edgefinder'
      console.error(`Error: unknown command "${maybeSubcommand ?? ''}"`)
      console.error(`Run "${commandLabel} --help" for usage.`)
      process.exit(1)
    }

    const parsed = this.parseArgs(tokens)
    const actionArgs = this.buildActionArgs(parsed)

    if (!this.actionHandler) {
      this.printHelp()
      return
    }

    await this.actionHandler(...actionArgs)
  }

  private parseArgs(tokens: string[]): ParsedArgs {
    const options = Object.fromEntries(
      this.options
        .filter((option) => option.defaultValue !== undefined)
        .map((option) => [option.property, option.defaultValue])
    )
    const positionals: string[] = []

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]

      if (!token.startsWith('--')) {
        positionals.push(token)
        continue
      }

      const [flag, inlineValue] = token.split('=', 2)
      const option = this.options.find((candidate) => candidate.flag === flag)

      if (!option) {
        console.error(`Error: unknown option "${flag}"`)
        process.exit(1)
      }

      if (option.takesValue) {
        const value = inlineValue ?? tokens[index + 1]
        if (!value || value.startsWith('--')) {
          console.error(`Error: option "${flag}" requires a value`)
          process.exit(1)
        }
        options[option.property] = option.parser ? option.parser(value) : value
        if (inlineValue === undefined) {
          index += 1
        }
      } else {
        options[option.property] = true
      }
    }

    return { options, positionals }
  }

  private buildActionArgs(parsed: ParsedArgs): unknown[] {
    const values: unknown[] = this.arguments.map((argument, index) => {
      const value = parsed.positionals[index] ?? argument.defaultValue
      if (argument.required && !value) {
        console.error(`Error: missing required argument "${argument.name}"`)
        process.exit(1)
      }
      return value
    })

    if (this.options.length > 0) {
      values.push(parsed.options)
    }

    return values
  }

  private printHelp(): void {
    const commandLabel = this.commandName || 'edgefinder'

    console.log(this.commandDescription ? `${commandLabel}: ${this.commandDescription}` : commandLabel)

    if (this.subcommands.size > 0) {
      console.log('\nCommands:')
      for (const subcommand of this.subcommands.values()) {
        console.log(`  ${subcommand.commandName.padEnd(12)} ${subcommand.commandDescription}`)
      }
    }

    if (this.options.length > 0) {
      console.log('\nOptions:')
      for (const option of this.options) {
        console.log(`  ${option.flags.padEnd(18)} ${option.description}`)
      }
    }
  }
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}
