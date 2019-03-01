#!/usr/bin/env node
const yargs = require('yargs')

const cli = yargs.usage('$0 <cmd> [args]')
const commandParams = { cli }

if (!process.env.DEBUG){
    process.env.DEBUG="cli*"
    process.env.DEBUG_LEVEL = "info"
}

// Create commands
require('./cliCommands/createCmd')(commandParams)


const width = Math.min(100, yargs.terminalWidth())
const argv = cli
    .wrap(width)
    .help('h')
    .strict()
    // .showHelpOnFail(false, 'Specify --help for available options')
    .argv

if (!argv._[0]) {
    cli.showHelp()
} else {
    console.log('')
}