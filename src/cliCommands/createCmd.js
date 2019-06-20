const logger = require('debug-logger')('cli:createCmd')
const { loadConf, validateCreation, writeConf } = require('../conf')
const { getContracts } = require('../contracts')
const inquirer = require('inquirer')
const getWeb3 = require('../getWeb3')
const util = require('util');
const { createAndAddModulesData } = require('@gnosis.pm/safe-contracts/test/utils')
const assert = require('assert')

function registerCommand({ cli }) {
  cli.command('create [--conf file]', 'Deploy a new dx-module based on the configuration file parameters. Resulting addresses are saved on the same file.', yargs => {
    yargs.option('conf', {
      type: 'string',
      describe: 'The file to read the configuration'
    })
  }, async function (argv) {
    const { conf } = argv

    const jsonConf = loadConf(conf)
    await validateCreation(jsonConf)

    // Obtain factories addresses
    const contracts = await getContracts()

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
    logger.info("Safe Owners:                  ", JSON.stringify(jsonConf.owners))

    for (var i = 0; i < jsonConf.whitelistedTokens.length; i++) {
      tokenAddress = jsonConf.whitelistedTokens[i]
      tokenInstance = await contracts.HumanFriendlyToken.at(tokenAddress)
      try {
        tokenSymbol = await tokenInstance.symbol()
        logger.info("Whitelisted token %d - %s     ", i, tokenSymbol, tokenAddress)
      } catch (error) {
        logger.error('Error getting the symbol for token %d - %s', i, tokenAddress)
        console.error('  > Please make sure the address is corect', error)

        logger.error('Double check the address %s\n', tokenAddress)
      }

    }

    logger.info("----------------------------------------------------------------------------------")

    const { confirmation } = await inquirer.prompt(
      {
        name: "confirmation",
        type: "confirm",
        message: `Create a new Safe and ${jsonConf.moduleType} module based on these parameters?`
      }
    )
    if (!confirmation) {
      logger.info("Exit.")
      process.exit(0)
    }

    logger.info("Deploying contracts...")
    const moduleData = await CompleteModule.contract.setup.request(dxProxy.address, jsonConf.whitelistedTokens, jsonConf.operators, 0).params[0].data // dx, whitelistedToken, operators

    let moduleMastercopyAddress

    if (jsonConf.moduleType == "seller") {
      moduleMastercopyAddress = SellerModule.address
    }
    else {
      moduleMastercopyAddress = CompleteModule.address
    }

    const proxyFactoryData = await proxyFactory.contract.createProxy.request(moduleMastercopyAddress, moduleData).params[0].data
    const modulesCreationData = createAndAddModulesData([proxyFactoryData])
    const addModulesData = createAndAddModules.contract.createAndAddModules.request(proxyFactory.address, modulesCreationData).params[0].data

    let gnosisSafeData = await safeMastercopy.contract.setup.request(jsonConf.owners, jsonConf.safeThreshold, createAndAddModules.address, addModulesData).params[0].data

    const safeTx = await proxyFactory.createProxy(safeMastercopy.address, gnosisSafeData, { from: accounts[0], gasPrice: jsonConf.gasPrice, gas: jsonConf.gas || 1e6 })

    assert(safeTx.receipt.status == "0x1", safeTx)
    logger.info(`Safe and Module succesfully created at tx ${safeTx.tx}`)

    jsonConf.dxModule = safeTx.logs[0].args.proxy
    jsonConf.safe = safeTx.logs[1].args.proxy


    logger.info("----------------------------------------------------------------------------------")
    logger.info("Safe:                         ", jsonConf.safe)
    logger.info("DX Module                     ", jsonConf.dxModule)
    logger.info("----------------------------------------------------------------------------------")

    logger.info("Writing addresses to configuration file")
    writeConf(jsonConf, conf)

    process.exit(0)

  })
}

module.exports = registerCommand