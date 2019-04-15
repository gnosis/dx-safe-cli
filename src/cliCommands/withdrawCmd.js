const logger = require('debug-logger')('cli:withdrawCmd')
const { loadConf, validateWithdraw } = require('../conf')
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
  cli.command('withdraw [--token address] [--to address] [--amount integer] [--conf file]', 'Transfers tokens from the DX and safe-contract to the destination address', yargs => {
    yargs.option('conf', {
      type: 'string',
      describe: 'The file to read the configuration'
    })

    yargs.option('token', {
      type: 'string',
      describe: 'ERC20 Token address',
      demandOption: true
    })

    yargs.option('amount', {
      type: 'string',
      describe: 'Amount of tokens, integer value. E.g 10 ETH, 1 DAI.',
      demandOption: true
    })

    yargs.option('to', {
      type: 'string',
      describe: 'Destination address.',
      demandOption: true
    })
  }, async function (argv) {
    const { conf, token, amount, to } = argv

    const jsonConf = loadConf(conf)
    await validateWithdraw(jsonConf)    

    // Obtain factories addresses
    const contracts = await getContracts(jsonConf)

    const web3 = await getWeb3()

    // Validate parameters
    assert(isAddress(token), "Token is not a valid address")
    assert(isAddress(to), "To is not a valid address")
    assert(!isNaN(amount), "amount should be a number.")

    const networkID = await util.promisify(web3.version.getNetwork)()
    const accounts = await util.promisify(web3.eth.getAccounts)()

    const moduleInstance = await contracts.DutchXCompleteModule.at(jsonConf.dxModule)
    const safeInstance = await contracts.GnosisSafe.at(jsonConf.safe)
    const dxProxy = await contracts.DutchExchangeProxy.deployed()
    const dxInstance = await contracts.DutchExchange.at(dxProxy.address)
    const tokenInstance = await contracts.HumanFriendlyToken.at(token)

    let safeTransactions = []
    let safeNonce = await safeInstance.nonce()

    // First, withdraw tokens from DX proxy to the safe contract, if amount available.
    const tokensInDX = await dxInstance.balances(safeInstance.address, token)
    const tokenDecimals = (await tokenInstance.decimals()).toNumber()
    const numWithOffsetForDecimals = Math.floor(parseFloat(amount)*1000)
    const tokenAmountWei = web3.toBigNumber(numWithOffsetForDecimals).mul("1e" + tokenDecimals).div(1000)
    const tokenName = await tokenInstance.name()
    const tokenSymbol = await tokenInstance.symbol()
    const safeBalanceWei = await tokenInstance.balanceOf(safeInstance.address)
    const safeBalance = safeBalanceWei.div("1e"+tokenDecimals)

    if(tokensInDX.gt(0)){
      let multisigData
      if(tokensInDX.lt(tokenAmountWei)){
        multisigData = dxInstance.withdraw.request(token, tokensInDX).params[0].data
      }
      else{
        multisigData = dxInstance.withdraw.request(token, tokenAmountWei).params[0].data
      }
      const multisigHash = await safeInstance.getTransactionHash(dxProxy.address, 0, multisigData, 0, 0, 0, 0, 0, 0, safeNonce)
      safeTransactions.push({data: multisigData, multisigHash, safeNonce, to: dxInstance.address})
      safeNonce++
    }
    
    const totalTokensHold = tokensInDX.add(safeBalanceWei)
    assert(totalTokensHold.gte(tokenAmountWei), "Not enough tokens in DX and safe contract: " + totalTokensHold.div("1e" + tokenDecimals).toFixed() + " " + tokenSymbol)

    // Transfer tokens from the safe contract to the "to" address
    const multisigData2 = tokenInstance.transfer.request(to, tokenAmountWei).params[0].data
    const multisigHash2 = await safeInstance.getTransactionHash(tokenInstance.address, 0, multisigData2, 0, 0, 0, 0, 0, 0, safeNonce)
    safeTransactions.push({data: multisigData2, multisigHash: multisigHash2, safeNonce, to: tokenInstance.address})
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
        logger.info("Ethereum Network ID:          ", networkID)
        logger.info("Ethereum Accounts:            ", JSON.stringify(accounts))
        logger.info("Safe Owners:                  ", JSON.stringify(jsonConf.owners))
        logger.info("----------------------------------------------------------------------------------")
        logger.info("Token to withdraw:            ", token)
        logger.info("Token name:                   ", tokenName + " (" + tokenSymbol + ")")
        logger.info("Token Decimals:               ", tokenDecimals)
        logger.info("DX balance                    ", tokensInDX.div("1e"+tokenDecimals).toString() + " " + tokenSymbol)
        logger.info("Safe balance:                 ", safeBalance + " " + tokenSymbol)
        logger.info("Amount to transfer:           ", amount + " " + tokenSymbol)
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
        const safeTx = await safeInstance.execTransaction(safeTransaction.to, 0, safeTransaction.data, 0, 0, 0, 0, 0, 0, safeTransaction.signatures, {from: accounts[0], gas: 2e5, gasPrice: jsonConf.gasPrice})
        logger.info(`Safe transaction succesfully executed at tx ${safeTx.tx}`)
      }
      else{
        const safeThreshold = await safeInstance.getThreshold()
        const safeOwners = (await safeInstance.getOwners()).sort()
        logger.info("Token to withdraw:            ", token)
        logger.info("Token name:                   ", tokenName + " ("+tokenSymbol + ")")
        logger.info("Amount:                       ", tokenAmountWei.toFixed())
        logger.info('No MNEMONIC/PK present, you need to manually perform these transactions:')
        logger.info(`Send this transaction with ${safeThreshold} owner/s:`)
        const approveHash = await safeInstance.approveHash.request(safeTransaction.multisigHash, {gas: 1000000}).params[0]
        console.log(JSON.stringify(approveHash, null, 2))
        let sigs = '0x'
        for(var j=0; j<safeThreshold; j++){
          sigs += "000000000000000000000000" + safeOwners[j].replace('0x', '') + "0000000000000000000000000000000000000000000000000000000000000000" + "01"
        }
        const safeTx = await safeInstance.execTransaction.request(safeTransaction.to, 0, safeTransaction.data, 0, 0, 0, 0, 0, 0, sigs, {gas: 1e6}).params[0]
        logger.info(`Finally exec the multisig with 1 of the owners:`)
        console.log(JSON.stringify(safeTx, null, 2))
      }
    }    

    process.exit(0)
    

  })
}

module.exports = registerCommand