const logger = require('debug-logger')('cli:safeTransactionCmd')
const { loadConf, validateSafeTransaction, validateSignOffline } = require('../conf')
const { getContracts } = require('../contracts')
const getWeb3 = require('../getWeb3')
const { isAddress } = require('web3-utils')
const util = require('util')
const assert = require('assert')
const lightwallet = require('eth-lightwallet')
const createVault = util.promisify(lightwallet.keystore.createVault).bind(lightwallet.keystore)
const safeUtils = require('@gnosis.pm/safe-contracts/test/utils')
const inquirer = require('inquirer')

function registerCommand ({ cli }) {
  cli.command('safe-tx [--amount number] [--to address] [--safeData string] [--conf file]', 'Creates a Safe Transaction with the passed data, value and to. It does a CALL tx.', yargs => {
    yargs.option('conf', {
      type: 'string',
      describe: 'The file to read the configuration'
    })

    yargs.option('amount', {
      type: 'number',
      describe: 'Amount of ETH to send.',
      demandOption: true
    })

    yargs.option('to', {
      type: 'string',
      describe: 'Ethereum address',
      demandOption: true
    })

    yargs.option('safeData', {
      type: 'string',
      describe: 'Hexadecimal data',
      demandOption: true
    })
  }, async function (argv) {
    const { conf, safeData, amount, to } = argv

    const jsonConf = loadConf(conf)
    await validateSafeTransaction(jsonConf)    

    // Obtain factories addresses
    const contracts = await getContracts(jsonConf)

    const web3 = await getWeb3()

    // Validate parameters
    assert(isAddress(to), "To is not a valid address")
    assert(!isNaN(amount), "amount should be a number.")

    const amountInWei = web3.toWei(amount)

    const networkID = await util.promisify(web3.version.getNetwork)()
    const accounts = await util.promisify(web3.eth.getAccounts)()

    const safeInstance = await contracts.GnosisSafe.at(jsonConf.safe)

    let safeTransactions = []
    let safeNonce = await safeInstance.nonce()
    const multisigHash = await safeInstance.getTransactionHash(to, amountInWei, safeData, 0, 0, 0, 0, 0, 0, safeNonce)
    safeTransactions.push({data: safeData, multisigHash, safeNonce, to, value: amountInWei})
    safeNonce++

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
        logger.info("Ethereum Network ID:            ", networkID)
        logger.info("Ethereum Accounts:              ", JSON.stringify(accounts))
        logger.info("Safe Owners:                    ", JSON.stringify(jsonConf.owners))
        logger.info("----------------------------------------------------------------------------------")
        logger.info("Safe Transaction - Destination  ", to)
        logger.info(`Safe Transaction - Value         ${amount} ETH = ${amountInWei} Wei`)
        logger.info("Safe Transaction - Data         ", safeData)
        logger.info("----------------------------------------------------------------------------------")

        const { confirmation } = await inquirer.prompt(
        {
            name: "confirmation",
            type: "confirm",
            message: `Update operators list based on these parameters?`
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
        const safeTx = await safeInstance.execTransaction(safeTransaction.to, safeTransaction.value, safeTransaction.data, 0, 0, 0, 0, 0, 0, safeTransaction.signatures, {from: accounts[0], gas: 1e6, gasPrice: jsonConf.gasPrice})
        logger.info(`Safe transaction succesfully executed at tx ${safeTx.tx}`)
      }
      else{
        await validateSignOffline(jsonConf)
        const ownersToSign = jsonConf.ownersToSign.sort()
        
        const safeThreshold = await safeInstance.getThreshold()

        logger.info("Safe Transaction - Destination  ", to)
        logger.info(`Safe Transaction - Value         ${amount} ETH = ${amountInWei} Wei`)
        logger.info("Safe Transaction - Data         ", safeData)
        logger.info('No MNEMONIC/PK present, you need to manually perform these transactions:')
        logger.info(`Send this transaction with the ${safeThreshold} owner/s [${ownersToSign}] :`)
        const approveHash = await safeInstance.approveHash.request(safeTransaction.multisigHash, {gas: 1000000}).params[0]
        console.log(JSON.stringify(approveHash, null, 2))
        let sigs = '0x'
        for(var j=0; j<safeThreshold; j++){
          sigs += "000000000000000000000000" + ownersToSign[j].replace('0x', '') + "0000000000000000000000000000000000000000000000000000000000000000" + "01"
        }
        const safeTx = await safeInstance.execTransaction.request(safeTransaction.to, safeTransaction.value, safeTransaction.data, 0, 0, 0, 0, 0, 0, sigs, {gas: 1e6}).params[0]
        logger.info(`Finally exec the multisig with 1 account:`)
        console.log(JSON.stringify(safeTx, null, 2))
      }
    }    

    process.exit(0)
    

  })
}

module.exports = registerCommand