# NFT Auction Platform

A Hardhat 3 project using the native Node.js test runner (`node:test`) and the `viem` library for Ethereum interactions.

## Usage

### Running Tests

To run all the tests in the project, execute the following command:

```shell
npx hardhat test
```

You can also selectively run the Solidity or `node:test` tests:

```shell
npx hardhat test solidity
npx hardhat test nodejs
```

### Make a deployment to Sepolia

To deploy with Ignition to Sepolia, you need an account with funds to send the transaction. The provided Hardhat configuration includes Configuration Variables called `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY`, which you can use to set the RPC endpoint and the private key of the account you want to use.

You can set these variables using the `hardhat-keystore` plugin or by setting them as environment variables.

To set the `SEPOLIA_PRIVATE_KEY` config variable using `hardhat-keystore`:

```shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

After setting the variables, you can run the deployment with the Sepolia network:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/<YourModule>.ts
```
