const { getWeth, AMOUNT } = require("./getWeth")
const { getNamedAccounts, ethers, network } = require("hardhat")
const { networkConfig } = require("../helper-hardhat-config")

const DAI_AMOUNT = "10000000000000000"
const wethTokenAddress = networkConfig[network.config.chainId].wethToken
const daiTokenAddress = networkConfig[network.config.chainId].daiToken

async function main() {
    // exchange ETH for WETH
    await getWeth()

    // Get account
    const { deployer } = await getNamedAccounts()
    // Get LendingPool address (through proxy contract)
    const lendingPool = await getLendingPool(deployer)
    console.log(`LendingPool address: ${lendingPool.address}`)
    console.log("Initial DAI and WETH balance:")
    await getTokenBalances(wethTokenAddress, daiTokenAddress, deployer)
    console.log("----------------")
    // Deposit!
    // To deposit,first need to approve the Aave contract
    // approve
    await approveErc20(wethTokenAddress, lendingPool.address, AMOUNT, deployer)
    await approveErc20(
        daiTokenAddress,
        lendingPool.address,
        DAI_AMOUNT,
        deployer
    )

    // deposit
    console.log("Depositing...")
    await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0)
    await lendingPool.deposit(daiTokenAddress, DAI_AMOUNT, deployer, 0)
    console.log("Deposited!")

    console.log("DAI and WETH balances after depositing:")
    await getTokenBalances(
        wethTokenAddress,
        daiTokenAddress,
        lendingPool.address
    )
    console.log("----------------")

    let { availableBorrowsETH } = await getBorrowUserData(lendingPool, deployer)
    // Find out ETH<->DAI conversion rate before borrowing, by using Chainlink Price Feeds
    const daiPrice = await getDAIPrice()
    const amountDaiToBorrow =
        availableBorrowsETH.toString() * 0.8 * (1 / daiPrice.toNumber())
    console.log(`You can borrow ${amountDaiToBorrow} DAI`)
    const amountDaiToBorrowWei = ethers.utils.parseEther(
        amountDaiToBorrow.toString()
    )

    /* BORROW TOKENS */
    await borrowDai(
        daiTokenAddress,
        lendingPool,
        amountDaiToBorrowWei,
        deployer
    )
    let { totalDebtETH } = await getBorrowUserData(lendingPool, deployer)
    const totalDaiDebt = totalDebtETH.toString() * (1 / daiPrice.toNumber())
    const totalDaiDebtWei = ethers.utils.parseEther(totalDaiDebt.toString())

    await repay(totalDaiDebtWei, daiTokenAddress, lendingPool, deployer)
    await getBorrowUserData(lendingPool, deployer)
}

/* REPAY BORROWED TOKENS */
async function repay(amount, daiAddress, lendingPool, account) {
    // approve sending DAI back first
    await approveErc20(daiAddress, lendingPool.address, amount, account)
    const repayTx = await lendingPool.repay(daiAddress, amount, 1, account)
    await repayTx.wait(1)
    console.log("Repaid!")
}

/* BORROW DAI */
async function borrowDai(
    daiAddress,
    lendingPool,
    amountDaiToBorrowWei,
    account
) {
    const borrowTx = await lendingPool.borrow(
        daiAddress,
        amountDaiToBorrowWei,
        1,
        0,
        account
    )
    await borrowTx.wait(1)
    console.log("Borrowed!")
}

/* GET DAI PRICE */
async function getDAIPrice() {
    const daiEthPriceFeed = await ethers.getContractAt(
        "AggregatorV3Interface",
        networkConfig[network.config.chainId].daiEthPriceFeed
    )
    const price = (await daiEthPriceFeed.latestRoundData())[1]
    console.log(`DAI/ETH price is ${price.toString()} DAI`)
    return price
}

/* GET BORROW USER DATA */
async function getBorrowUserData(lendingPool, account) {
    const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
        await lendingPool.getUserAccountData(account)

    console.log(
        `You have ${ethers.utils.formatEther(
            totalCollateralETH
        )} worth of ETH deposited`
    )
    console.log(
        `You have ${ethers.utils.formatEther(
            totalDebtETH
        )} worth of ETH borrowed`
    )
    console.log(
        `You can borrow ${ethers.utils.formatEther(
            availableBorrowsETH
        )} worth of ETH`
    )
    return { availableBorrowsETH, totalDebtETH }
}

/* APPROVE ERC20 TOKEN ALLOWANE */
async function approveErc20(
    erc20Address,
    spenderAddress,
    amountToSpend,
    account
) {
    const erc20Token = await ethers.getContractAt(
        "IERC20",
        erc20Address,
        account
    )
    const tx = await erc20Token.approve(spenderAddress, amountToSpend)
    await tx.wait(1)
    console.log("Approved!")
}

/* GET LENDING POOL */
async function getLendingPool(account) {
    const lendingPoolAddressesProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        networkConfig[network.config.chainId].lendingPoolAddressesProvider,
        account
    )
    const lendingPoolAddress =
        await lendingPoolAddressesProvider.getLendingPool()

    const lendingPool = await ethers.getContractAt(
        "ILendingPool",
        lendingPoolAddress,
        account
    )

    return lendingPool
}

/* Get WETH and DAI balances */
async function getTokenBalances(wethToken, daiToken, account) {
    const wethContract = await ethers.getContractAt("IWeth", wethToken, account)
    const wethBalance = await wethContract.balanceOf(account)
    const daiContract = await ethers.getContractAt("IERC20", daiToken, account)
    const daiBalance = await daiContract.balanceOf(account)
    console.log(`WETH balance: ${wethBalance} WETH`)
    console.log(`DAI balance: ${daiBalance} DAI`)
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.log(e)
        process.exit(1)
    })
