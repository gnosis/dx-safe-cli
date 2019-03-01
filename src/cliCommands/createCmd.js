const WORKING_DIR = process.cwd()
const logger = require('debug-logger')('cli:createCmd')
const { loadConf, validateCreation } = require('../conf')
const { getContracts } = require('../contracts')
const inquirer = require('inquirer')
const getWeb3 = require('../getWeb3')
const util = require('util');

function registerCommand ({ cli }) {
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

    const web3 = await getWeb3()
    const networkID = await util.promisify(web3.version.getNetwork)()
    const accounts = await util.promisify(web3.eth.getAccounts)()

    logger.info("---------------------------------------------------------------------------------")
    logger.info("Proxy Factory:                ", proxyFactory.address)
    logger.info("CreateAndAddModules:          ", createAndAddModules.address)
    logger.info("Gnosis Safe Master Copy:      ", SafeMastercopy.address)
    logger.info("Seller Module Master Copy:    ", SellerModule.address)
    logger.info("Complete Module Master Copy:  ", CompleteModule.address)
    logger.info("Dutch Exchange Proxy:         ", dxProxy.address)
    // Dry run
    logger.info("----------------------------------------------------------------------------------")
    logger.info("Ethereum Network ID:          ", networkID)
    logger.info("Ethereum Accounts:            ", accounts)
    logger.info("Safe Owners:                  ", jsonConf.owners)

    for (var i = 0; i < jsonConf.whitelistedTokens.length; i++) {
      tokenAddress = jsonConf.whitelistedTokens[i]
      tokenInstance = await contracts.HumanFriendlyToken.at(tokenAddress)
      tokenSymbol = await tokenInstance.symbol()
      logger.info("Whitelisted token %d - %s     ", i, tokenSymbol, tokenAddress)
    }

    logger.info("----------------------------------------------------------------------------------")

    const { confirmation } = await inquirer.prompt(
      {
        name: "confirmation",
        type: "confirm",
        message: `Create a new Safe and ${jsonConf.moduleType} module based on these parameters?`
      }
    )
    if(!confirmation){
      logger.info("Exit.")
      process.exit(0)      
    }
    
    logger.info("Deploying contracts...")


  })
}

module.exports = registerCommand