const logger = require('debug-logger')('cli:createCmd')
const { loadConf, validateUpdateModule, writeConf } = require('../conf')
const { getContracts } = require('../contracts')
const inquirer = require('inquirer')
const getWeb3 = require('../getWeb3')
const util = require('util');
const { createAndAddModulesData } = require('@gnosis.pm/safe-contracts/test/utils')
const assert = require('assert')

function registerCommand({ cli }) {
  cli.command('update-module [--conf file]', 'Deploy a new dx-module based on the configuration file parameters. Resulting addresses are saved on the same file.', yargs => {
    yargs.option('conf', {
      type: 'string',
      describe: 'The file to read the configuration'
    })
  }, async function (argv) {
    const { conf } = argv

    const jsonConf = loadConf(conf)
    await validateUpdateModule(jsonConf)

    // Obtain factories addresses
    const contracts = await getContracts(jsonConf)

    const proxyFactory = await contracts.ProxyFactory.deployed()
    const createAndAddModules = await contracts.CreateAndAddModules.deployed()
    const SafeMastercopy = await contracts.GnosisSafe.deployed()
    const SellerModule = await contracts.DutchXSellerModule.deployed()
    const CompleteModule = await contracts.DutchXCompleteModule.deployed()
    const dxProxy = await contracts.DutchExchangeProxy.deployed()
    const safeMastercopy = await contracts.GnosisSafe.deployed()

    const web3 = await getWeb3()
    const networkID = await util.promisify(web3.version.getNetwork)()
    const accounts = await util.promisify(web3.eth.getAccounts)()

    logger.info("---------------------------------------------------------------------------------")
    logger.info("Gnosis Safe Master Copy:      ", safeMastercopy.address)
    logger.info("Proxy Factory:                ", proxyFactory.address)
    logger.info("CreateAndAddModules:          ", createAndAddModules.address)
    logger.info("Gnosis Safe Master Copy:      ", SafeMastercopy.address)
    logger.info("Seller Module Master Copy:    ", SellerModule.address)
    logger.info("Complete Module Master Copy:  ", CompleteModule.address)
    logger.info("Dutch Exchange Proxy:         ", dxProxy.address)
    // Dry run
    logger.info("----------------------------------------------------------------------------------")
    logger.info("Ethereum Network ID:          ", networkID)
    logger.info("Ethereum Accounts:            ", JSON.stringify(accounts))

    const from = accounts[0]
    const {
      dxModule,
      safe,
      whitelistedTokens,
      operators,
      moduleType,
      gas = 1e6,
      gasPrice
    } = jsonConf

    const safeContract = await contracts.GnosisSafe.at(safe)
    const modules = await safeContract.getModules()
    logger.info("Current modules:                  ", JSON.stringify(modules))
    logger.info("----------------------------------------------------------------------------------")

    // Create Module and enabled it in the safe
    const { confirmation } = await inquirer.prompt(
      {
        name: "confirmation",
        type: "confirm",
        message: `Create a new ${moduleType} module for the safe ${safe}?`
      }
    )
    if (!confirmation) {
      logger.info("Exit.")
      process.exit(0)
    }

    logger.info("Deploying modules...")
    const moduleData = await CompleteModule.contract.setup.request(
      dxProxy.address,
      whitelistedTokens,
      operators,
      safe
    ).params[0].data // dx, whitelistedToken, operators

    let moduleMastercopyAddress
    if (moduleType == "seller") {
      moduleMastercopyAddress = SellerModule.address
    } else {
      moduleMastercopyAddress = CompleteModule.address
    }

    const createProxyReceipt = await proxyFactory.createProxy(
      moduleMastercopyAddress,
      moduleData, { from, gas, gasPrice }
    )
    jsonConf.dxModule = createProxyReceipt.logs[0].args.proxy
    logger.info("----------------------------------------------------------------------------------")
    logger.info("Transaction:                  ", createProxyReceipt.tx)
    logger.info("Safe:                         ", safe)
    logger.info("DX Module                     ", jsonConf.dxModule)
    logger.info("----------------------------------------------------------------------------------")

    logger.info("Writing addresses to configuration file")
    writeConf(jsonConf, conf)

    process.exit(0)
  })
}

module.exports = registerCommand