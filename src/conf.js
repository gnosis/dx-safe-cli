const fs = require('fs')
const { normalize, join } = require('path')
const logger = require('debug-logger')('cli=conf')
const assert = require('assert')
const { isAddress } = require('web3-utils')
const { getContracts } = require('./contracts')

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

function writeConf(conf, file){
    if(file){
        logger.info(`Using %s as configuration file`, file)
        fileContent = fs.writeFileSync(file, JSON.stringify(conf, null, 2))
    }
    else{
        const defaultFile = normalize(join(__dirname, '../conf/conf.json'))
        logger.warn(`Configuration file not provided, using default path '%s'`, defaultFile)
        fileContent = fs.writeFileSync(defaultFile, JSON.stringify(conf, null, 2))
    }
}

async function validateCreation(conf){

    logger.info('Validating configuration file...')

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

    assert(Array.isArray(conf.operators), "operators must be an array")
    assert(conf.operators.length > 0, "operators must be an array of at least 1 Ethereum address")

    for (operator of conf.operators){
        assert(isAddress(operator), "operators must contain valid ethereum addresses")
    }

    assert(conf.ethereumURL, "ethereumURL param required")

    // Check in blockchain that:
    // Token addresses look like ERC20 tokens
    contracts = await getContracts(conf)
    
    for (token of conf.whitelistedTokens){
        const tokenInstance = await contracts.Token.at(token)
        try{
            const tokenSupply = await tokenInstance.totalSupply()
            assert(tokenSupply.gt(0), `Token address ${token} has no supply or is not an ERC20 token`)
        }
        catch(e){
            throw Error(`Token address ${token} has no supply or is not an ERC20 token`)
        }
    }

    logger.info("Validation done")
}

module.exports = {
    loadConf,
    validateCreation,
    writeConf
}