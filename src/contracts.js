const truffle_contract = require("truffle-contract");
const getWeb3 = require('./getWeb3')

let contracts

async function loadContracts(conf) {
  const web3 = await getWeb3(conf)

  const safeArtifacts = [
    'GnosisSafe',
    'Proxy',
    'ProxyFactory',
    'CreateAndAddModules'
  ].map((name) => require(`@gnosis.pm/safe-contracts/build/contracts/${name}.json`))

  const modulesArtifacts = [
    'DutchXCompleteModule',
    'DutchXSellerModule'
  ].map((name) => require(`@gnosis.pm/safe-modules/build/contracts/${name}.json`))

  const dxArtifacts = [
    'DutchExchange',
    'DutchExchangeProxy'
  ].map((name) => require(`@gnosis.pm/dx-contracts/build/contracts/${name}.json`))

  const miscArtifacts = [
    'Token',
    'HumanFriendlyToken'
  ].map((name) => require(`@gnosis.pm/util-contracts/build/contracts/${name}.json`))


  const artifacts = safeArtifacts
    .concat(modulesArtifacts)
    .concat(miscArtifacts)
    .concat(dxArtifacts)
  contracts = {}

  for (artifact of artifacts) {
    contracts[artifact.contractName] = truffle_contract(artifact)
    // initialize provider
    contracts[artifact.contractName].setProvider(web3.currentProvider)
  }
}

async function getContracts(conf) {
  if (!contracts) {
    await loadContracts(conf)
  }
  return contracts
}

module.exports = { getContracts }