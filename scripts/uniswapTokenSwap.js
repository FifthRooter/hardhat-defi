const { getNamedAccounts, network, ethers } = require("hardhat")
const { networkConfig } = require("../helper-hardhat-config")
const { getWeth, AMOUNT } = require("./getWeth")

const wethAddress = networkConfig[network.config.chainId].wethToken
const daiAddress = networkConfig[network.config.chainId].daiToken
const uniswapRouter = networkConfig[network.config.chainId].swapRouter
const poolFee = networkConfig[network.config.chainId].poolFee

async function main() {
    await getWeth()
    const { deployer } = await getNamedAccounts()
    console.log(`Initial balance:`)
    await getTokenBalances(wethAddress, daiAddress, deployer)
    console.log("----------------")
    const balance = await ethers.provider.getBalance(deployer)
    await approveErc20(wethAddress, uniswapRouter, AMOUNT, deployer)
    await swapTokens(
        wethAddress,
        daiAddress,
        poolFee,
        deployer,
        uniswapRouter,
        AMOUNT
    )
    console.log("Current balance:")
    await getTokenBalances(wethAddress, daiAddress, deployer)
    console.log("----------------")
}

/* Get token balances */
async function getTokenBalances(wethToken, daiToken, account) {
    const wethContract = await ethers.getContractAt("IWeth", wethToken, account)
    const wethBalance = await wethContract.balanceOf(account)
    const daiContract = await ethers.getContractAt("IERC20", daiToken, account)
    const daiBalance = await daiContract.balanceOf(account)
    console.log(`WETH balance: ${wethBalance} WETH`)
    console.log(`DAI balance: ${daiBalance} DAI`)
}

/* Approve ERC20 token allowance */
async function approveErc20(token, swapRouter, amount, account) {
    const erc20Token = await ethers.getContractAt("IERC20", token, account)
    const approveTx = await erc20Token.approve(swapRouter, amount)
    approveTx.wait(1)
    console.log("Approved!")
}

/* Swap tokens */
// deadline - unix time after which a swap will fail
// amountOutMinimum - set here as 0, but ideally should be calculated using SDK or using a price oracle
// sqrtPriceLimitX96 - set to 0, making parameter inactive
async function swapTokens(
    tokenIn,
    tokenOut,
    fee,
    recipient,
    swapRouterAddress,
    amountIn
) {
    const blockNumber = await ethers.provider.getBlockNumber()
    const block = await ethers.provider.getBlock(blockNumber)
    const blockTimestamp = block.timestamp
    deadline = blockTimestamp + 60 * 20
    const swapRouter = await ethers.getContractAt(
        "ISwapRouter",
        swapRouterAddress,
        recipient
    )
    const swapTx = await swapRouter.exactInputSingle({
        tokenIn,
        tokenOut,
        fee,
        recipient,
        deadline,
        amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
    })
    swapTx.wait(1)
    console.log("Tokens swapped!")
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.log(e)
        process.exit(1)
    })
