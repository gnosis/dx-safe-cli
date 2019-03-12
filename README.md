# DX Safe CLI

CLI that manages the creation of Dutch Exchange modules for the [Safe](https://safe.gnosis.io).

## Requirements
* Nodejs >= 8
* Git

## Install
```sh
# You can install it globally, in another project...
npm i -g @gnosis.pm/dx-safe-cli

# Or clone the repo
git clone https://github.com/gnosis/dx-safe-cli
cd dx-safe-cli
npm i
````

## Configuration file
There is an example of the configuration file in [conf/conf.example.json](conf/conf.example.json) fill the parameters desired values.

Safe params:
| Name  | Type  | Description|
|-------|-------|---|---|---|
| `ethereumURL`| String  | Url of a Ethereum node (e.g. https://rinkeby.infura.io) |
| `gasPrice`|  Number | Gas price in Wei (e.g. `10000000000`)  |
| `owners`| Array of Strings (ethereum addresses)  |  Owners of the Safe multisig account  |
| `safeThreshold`| Number  |  Number of owner signatures required for executing transactions in the safe  |
| `moduleType` |  Enum: [`seller` \| `complete`]  |  Type of DutchX module used for the operator. There\'s currently two options: `seller` can only sell, `complete` can sell and buy |
| `whitelistedTokens`| Array of Strings (ethereum addresses)  |  ERC20 tokens that are whitelisted. Only whitelisted tokens can be traded.  |
| `operators`| Array of Strings (ethereum addresses)  |  Addresses for the operators. The operators are users that can trade the whitelisted tokens in the DutchX on behalf of the safe address. Note that operators don\'t cannot execute any other transaction using the safe funds. Also, the operators don\'t need to surplus the `safeThreshold` |

## Running the CLI
```sh
@gnosis.pm/dx-safe-cli # globally
npm run cli # locally
```

It will output all the possible options

![alt text](./dx-safe-cli.png "Logo Title Text 1")