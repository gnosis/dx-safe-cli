const WORKING_DIR = process.cwd()
const logger = require('debug-logger')('cli:createCmd')
const { loadConf, validateCreation } = require('../conf')
const { getContracts } = require('../contracts')

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

    logger.info("Proxy Factory: ", proxyFactory.address)
    logger.info("CreateAndAddModules: ", createAndAddModules.address)
    logger.info("Gnosis Safe Master Copy: ", SafeMastercopy.address)
    logger.info("Seller Module Master Copy: ", SellerModule.address)
    logger.info("Complete Module Master Copy: ", CompleteModule.address)
    // Dry run

    
  })
}

module.exports = registerCommand