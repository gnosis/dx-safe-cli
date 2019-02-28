const fs = require('fs')
const { normalize, join } = require('path')
const logger = require('debug-logger')('conf')

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

module.exports = {
    loadConf
}