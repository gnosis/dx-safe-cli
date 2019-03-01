const fs = require('fs')
const { normalize, join } = require('path')
const logger = require('debug-logger')('cli=conf')
const assert = require('assert')
const { isAddress } = require('web3-utils')
const Web3 = require('web3')
const axios = require('axios')

function loadConf(file) {
    let fileContent
    if(file){
        logger.info(`Using %s as configuration file`, file)
        fileContent = fs.readFileSync(file)
    }
    else{
        const defaultFile = normalize(join(__dirname, '../conf/conf.json'))
        logger.warn(`Configuration file not provided, using default path '%s'`, defaultFile)
        fileContent = fs.readFileSync(defaultFile)
    }

    return JSON.parse(fileContent)
}

async function validateCreation(conf){
    // Check required params are set.
    assert(conf.moduleType.indexOf("seller") || conf.moduleType.indexOf("complete"), "moduleType must be 'seller' or 'complete'")
    assert(Array.isArray(conf.whitelistedTokens), "whitelistedTokens must be an array")

    for (token of conf.whitelistedTokens){
        assert(isAddress(token), "whitelistedTokens must contain valid ethereum addresses")
    }

    assert(Array.isArray(conf.owners), "owners must be an array")
    assert(conf.owners.length > 0, "owners must be an array of at least 1 Ethereum address")

    for (owner of conf.owners){
        assert(isAddress(owner), "owners must contain valid ethereum addresses")
    }

    assert(conf.ethereumURL, "ethereumURL param required")
    
    try{
        response = await axios.post(
            conf.ethereumURL,
            {"jsonrpc":"2.0","method":"net_listening","params":[],"id":67}
        )
        assert(response.data.result, "ethereumURL must be an Ethereum RPC node")
    }
    catch(e){
        throw Error("ethereumURL must be a valid ethereum rpc endpoint")
    }

    // Check in blockchain that:
    // Token addresses look like ERC20 tokens
    


    logger.info("Validation done")
}

module.exports = {
    loadConf,
    validateCreation
}