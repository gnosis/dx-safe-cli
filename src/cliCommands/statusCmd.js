const logger = require('debug-logger')('cli:createCmd')
const { loadConf, validateStatus } = require('../conf')
const { getContracts } = require('../contracts')
const inquirer = require('inquirer')
const getWeb3 = require('../getWeb3')
const util = require('util');
const assert = require('assert')
const lightwallet = require('eth-lightwallet')
const createVault = util.promisify(lightwallet.keystore.createVault).bind(lightwallet.keystore)
const safeUtils = require('gnosis-safe/test/utils')

function registerCommand ({ cli }) {
  cli.command('status [--conf file]', 'Shows the status of safe contract and module.', yargs => {
    yargs.option('conf', {
      type: 'string',
      describe: 'The file to read the configuration'
    })
  }, async function (argv) {
    const { conf } = argv

    const jsonConf = loadConf(conf)
    await validateStatus(jsonConf)

    // Obtain factories addresses
    const contracts = await getContracts(jsonConf)

    const web3 = await getWeb3()
    const networkID = await util.promisify(web3.version.getNetwork)()
    const accounts = await util.promisify(web3.eth.getAccounts)()

    const moduleInstance = await contracts.DutchXCompleteModule.at(jsonConf.dxModule)
    const safeInstance = await contracts.GnosisSafe.at(jsonConf.safe)
    const dxProxy = await contracts.DutchExchangeProxy.deployed()

    let safeNonce = await safeInstance.nonce()

    const safeThreshold = await safeInstance.getThreshold()
    const safeOwners = await safeInstance.getOwners()
    const whitelistedTokens = await moduleInstance.getWhitelistedTokens()
    const operators = await moduleInstance.getWhitelistedOperators()
    const enabledModules = await safeInstance.getModules()
    const isModuleEnabled = enabledModules.includes(moduleInstance.address) ? "Yes":"No"

    logger.info("----------------------------------------------------------------------------------")
    logger.info(`SAFE Contract ${safeInstance.address}`)
    logger.info("----------------------------------------------------------------------------------")
    logger.info(`Safe Threshold:                                   ${safeThreshold} owner/s`)
    logger.info(`Safe Owners:                                      ${JSON.stringify(safeOwners)}`)
    logger.info(`Safe Nonce:                                       ${safeNonce}`)
    logger.info("----------------------------------------------------------------------------------")
    logger.info(`DX Module ${moduleInstance.address}`)
    logger.info("----------------------------------------------------------------------------------")
    logger.info(`Module ENABLED:                                   ${isModuleEnabled}`)
    logger.info(`Module DX Proxy                                   ${dxProxy.address}`)
    logger.info(`Whitelisted tokens:                              (${whitelistedTokens.length} tokens)`)
    for (token of whitelistedTokens) {
        tokenInstance = await contracts.HumanFriendlyToken.at(token)
        tokenSymbol = await tokenInstance.symbol()
        logger.info("Token  %s - %s     ", tokenSymbol, token)
    }
    logger.info(`Operators: ${JSON.stringify(operators)}`)


    process.exit(0)
    

  })
}

module.exports = registerCommand