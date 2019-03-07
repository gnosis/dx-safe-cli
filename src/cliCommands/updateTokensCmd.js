const logger = require('debug-logger')('cli:createCmd')
const { loadConf, validateUpdateTokens } = require('../conf')
const { getContracts } = require('../contracts')
const inquirer = require('inquirer')
const getWeb3 = require('../getWeb3')
const util = require('util');
const assert = require('assert')
const lightwallet = require('eth-lightwallet')
const createVault = util.promisify(lightwallet.keystore.createVault).bind(lightwallet.keystore)
const safeUtils = require('gnosis-safe/test/utils')

function registerCommand ({ cli }) {
  cli.command('update-tokens [--conf file]', 'Modifies whitelistedTokens of the DX module. For this operation, if MNEMONIC or private keys provided, it should have ownership of the safe.', yargs => {
    yargs.option('conf', {
      type: 'string',
      describe: 'The file to read the configuration'
    })
  }, async function (argv) {
    const { conf } = argv

    const jsonConf = loadConf(conf)
    await validateUpdateTokens(jsonConf)

    // Obtain factories addresses
    const contracts = await getContracts()

    const web3 = await getWeb3()
    const networkID = await util.promisify(web3.version.getNetwork)()
    const accounts = await util.promisify(web3.eth.getAccounts)()

    const moduleInstance = await contracts.DutchXCompleteModule.at(jsonConf.dxModule)
    const safeInstance = await contracts.GnosisSafe.at(jsonConf.safe)

    const whitelistedTokens = await moduleInstance.getWhitelistedTokens()
    let tokensToRemove = whitelistedTokens.filter(contractToken => !jsonConf.whitelistedTokens.includes(contractToken))
    let tokensToAdd = jsonConf.whitelistedTokens.filter(fileToken => !whitelistedTokens.includes(fileToken))

    let safeTransactions = []
    let safeNonce = await safeInstance.nonce()

    for (token of tokensToRemove) {
      const multisigData = moduleInstance.removeFromWhitelist.request(token).params[0].data
      let multisigHash = await safeInstance.getTransactionHash(moduleInstance.address, 0, multisigData, 0, 0, 0, 0, 0, 0, safeNonce)
      safeTransactions.push({data: multisigData, multisigHash, safeNonce})
      safeNonce++
    }

    for (token of tokensToAdd) {
      const multisigData = moduleInstance.addToWhitelist.request(token).params[0].data
      let multisigHash = await safeInstance.getTransactionHash(moduleInstance.address, 0, multisigData, 0, 0, 0, 0, 0, 0, safeNonce)
      safeTransactions.push({data: multisigData, multisigHash, safeNonce})
      safeNonce++
    }

    if (!tokensToAdd.length && !tokensToRemove.length) {
      logger.info("Nothing to update.")
      process.exit(0)
    }

    if (process.env.MNEMONIC || process.env.PK){

        // accounts are already set in web3.eth.accounts, we need to validate that we have enough owners
        const safeThreshold = await safeInstance.getThreshold()
        const safeOwners = await safeInstance.getOwners()

        logger.info(`Safe contract ${jsonConf.safe} has a threshold of ${safeThreshold} owner/s`)
        logger.info(`Safe Owners: ${safeOwners}`)

        const availableOwners = accounts.filter(account => safeOwners.includes(account))
        assert(availableOwners.length >= safeThreshold, `Not enough owners provided in the MNEMONIC/PK. ${availableOwners.length} owner/s out of ${safeThreshold}`)

        logger.info(`Enough owners available through MNEMONIC/PK ${availableOwners.length} of ${safeOwners.length}`)

        // convert web3 provider into lightwallet, so we can perform the signatures
        let ownersLightwallet
        if (process.env.MNEMONIC){
            const keystore = await createVault({
                hdPathString: "m/44'/60'/0'/0",
                seedPhrase: process.env.MNEMONIC,
                password: "supersecret",
                salt: "supersecretsalt"
            })

            const keyFromPassword = await util.promisify(keystore.keyFromPassword).bind(keystore)("supersecret")
            keystore.generateNewAddress(keyFromPassword, 10)
            ownersLightwallet = {
              keystore,
              passwords: keyFromPassword
            }
        }
        else{
            assert(false, "not implemented yet")
        }


        // Dry run
        logger.info("----------------------------------------------------------------------------------")
        logger.info("Ethereum Network ID:          ", networkID)
        logger.info("Ethereum Accounts:            ", JSON.stringify(accounts))
        logger.info("Safe Owners:                  ", JSON.stringify(jsonConf.owners))

        for (token of tokensToRemove) {
            tokenInstance = await contracts.HumanFriendlyToken.at(token)
            tokenSymbol = await tokenInstance.symbol()
            logger.info("Token to remove %s - %s     ", tokenSymbol, token)
        }
        for (token of tokensToAdd) {
          tokenInstance = await contracts.HumanFriendlyToken.at(token)
          tokenSymbol = await tokenInstance.symbol()
          logger.info("Token to add %s - %s     ", tokenSymbol, token)
        }

        logger.info("----------------------------------------------------------------------------------")

        const { confirmation } = await inquirer.prompt(
        {
            name: "confirmation",
            type: "confirm",
            message: `Update whitelisted tokens based on these parameters?`
        }
        )
        if(!confirmation){
            logger.info("Exit.")
            process.exit(0)   
        }
        
        logger.info("Generating signatures")
        for (var i=0; i<safeTransactions.length; i++){
          safeTransaction = safeTransactions[i]
          const signatures = safeUtils.signTransaction(ownersLightwallet, availableOwners.slice(0, safeThreshold+1), safeTransaction.multisigHash)
          safeTransaction.signatures = signatures
        }        
    }
    
    // Iterate multisig transactions
    // If it has signatures, perform the execTransactions with off-chain meta transactions
    // If none signature provided, print raw transaction that has to be performed by the user
    for (var i=0; i<safeTransactions.length; i++){
      safeTransaction = safeTransactions[i]
      logger.info(`Safe transaction ${i}:`)
      if (safeTransaction.signatures){
        logger.info('MNEMONIC/PK present, performing transaction...')
        logger.debug(JSON.stringify(safeTransaction, null, 2))
        const safeTx = await safeInstance.execTransaction(moduleInstance.address, 0, safeTransaction.data, 0, 0, 0, 0, 0, 0, safeTransaction.signatures, {from: accounts[0], gas: 1000000})
        logger.info(`Safe transaction succesfully executed at tx ${safeTx.tx}`)
      }
      else{
        const safeThreshold = await safeInstance.getThreshold()
        logger.info('No MNEMONIC/PK present, you need to manually perform these transactions:')
        logger.info(`Send this transaction with ${safeThreshold} owner/s:`)
        const approveHash = await safeInstance.approveHash.request(safeTransaction.multisigHash, {from: accounts[0], gas: 1000000}).params[0]
        console.log(JSON.stringify(approveHash, null, 2))
        const safeTx = await safeInstance.execTransaction.request(moduleInstance.address, 0, safeTransaction.data, 0, 0, 0, 0, 0, 0, [], {from: accounts[0], gas: 1000000}).params[0]
        logger.info(`Finally exec the multisig with 1 of the owners:`)
        console.log(JSON.stringify(safeTx, null, 2))
      }
    }    

    process.exit(0)
    

  })
}

module.exports = registerCommand