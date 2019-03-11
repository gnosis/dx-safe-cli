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

    assert(conf.ethereumURL, "ethereumURL param required")

    await validateGasPrice(conf)

    // Check required params are set.
    assert(conf.moduleType.indexOf("seller") || conf.moduleType.indexOf("complete"), "moduleType must be 'seller' or 'complete'")

    await validateTokens(conf)
    await validateOwners(conf)

    assert(!conf.safe, "safe address should be empty, a new Proxy for the Safe is created in the process")
    assert(!conf.dxModule, "dxModule address should be empty, a new Proxy for the DX Module is created in the process")

    await validateOperators(conf)
    assert(process.env.PK || process.env.MNEMONIC, "MNEMONIC or PK must be passed by Environment variable. Mandatory for creation.")

    logger.info("Validation done")
}

async function validateUpdateTokens(conf){
    logger.info('Validating configuration file...')

    assert(conf.ethereumURL, "ethereumURL param required")

    await validateTokens(conf)
    await validateGasPrice(conf)

    assert(conf.safe, "safe address is mandatory in the configuration file")
    assert(conf.dxModule, "dxModule address is mandatory in the configuration file")

    logger.info("Validation done")
}

async function validateUpdateOperators(conf){
    logger.info('Validating configuration file...')

    assert(conf.ethereumURL, "ethereumURL param required")

    await validateOperators(conf)
    await validateGasPrice(conf)

    assert(conf.safe, "safe address is mandatory in the configuration file")
    assert(conf.dxModule, "dxModule address is mandatory in the configuration file")

    logger.info("Validation done")
}

async function validateDisableModule(conf){
    logger.info('Validating configuration file...')

    assert(conf.ethereumURL, "ethereumURL param required")

    await validateGasPrice(conf)

    assert(conf.safe, "safe address is mandatory in the configuration file")
    assert(conf.dxModule, "dxModule address is mandatory in the configuration file")

    logger.info("Validation done")
}

async function validateUpdateOwners(conf){
    logger.info('Validating configuration file...')

    assert(conf.ethereumURL, "ethereumURL param required")

    await validateOwners(conf)
    await validateGasPrice(conf)

    assert(conf.safe, "safe address is mandatory in the configuration file")
    assert(conf.dxModule, "dxModule address is mandatory in the configuration file")

    logger.info("Validation done")
}

async function validateUpdateDx(conf){
    logger.info('Validating configuration file...')

    assert(conf.ethereumURL, "ethereumURL param required")

    await validateGasPrice(conf)

    assert(conf.safe, "safe address is mandatory in the configuration file")
    assert(conf.dxModule, "dxModule address is mandatory in the configuration file")

    logger.info("Validation done")
}

async function validateTokens(conf){
    assert(Array.isArray(conf.whitelistedTokens), "whitelistedTokens must be an array")

    for (token of conf.whitelistedTokens){
        assert(isAddress(token), "whitelistedTokens must contain valid ethereum addresses")
    }

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
}

async function validateOperators(conf){
    assert(Array.isArray(conf.operators), "operators must be an array")
    assert(conf.operators.length > 0, "operators must be an array of at least 1 Ethereum address")

    for (operator of conf.operators){
        assert(isAddress(operator), "operators must contain valid ethereum addresses")
    }
}

async function validateOwners(conf){
    assert(Array.isArray(conf.owners), "owners must be an array")
    assert(conf.owners.length > 0, "owners must be an array of at least 1 Ethereum address")

    for (owner of conf.owners){
        assert(isAddress(owner), "owners must contain valid ethereum addresses")
    }

    // Validate too the threshold
    assert(conf.safeThreshold > 0, "safeThreshold is mandatory and should be at least 1")
    assert(conf.safeThreshold <= conf.owners.length, "safeThreshold cannot be higher than the amount of owners")
}

async function validateGasPrice(conf){
    assert(conf.gasPrice, "gasPrice is mandatory, units in wei")
    assert(conf.gasPrice <= 1e11, "gasPrice higher than 100 Gwei, that's very expensive, was on purpose?")
}

module.exports = {
    loadConf,
    validateCreation,
    writeConf,
    validateUpdateTokens,
    validateUpdateOperators,
    validateUpdateDx,
    validateUpdateOwners,
    validateDisableModule
}