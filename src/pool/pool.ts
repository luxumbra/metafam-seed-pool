import { autoinject, singleton, computedFrom, bindable } from "aurelia-framework";
import { ContractNames } from "services/ContractsService";
import { ContractsService } from "services/ContractsService";
import "./pool.scss";
import { EventAggregator } from "aurelia-event-aggregator";
import TransactionsService from "services/TransactionsService";
import { Address, EthereumService, fromWei } from "services/EthereumService";
import { BigNumber } from "ethers";
import { EventConfigException, EventConfigFailure } from "services/GeneralEvents";
import { TokenService } from "services/TokenService";
import { Router } from "aurelia-router";
import { toBigNumberJs } from "services/BigNumberService";
import { NumberService } from "services/numberService";

@singleton(false)
@autoinject
export class Pool {
  @bindable poolAddress: Address;
  pool: Pool;
  initialized = false;
  weth: any;
  crPool: any;
  bPool: any;
  stakingRewards: any;
  primeToken: any;
  bPrimeToken: any;
  connected = false;
  liquidityBalance: number;
  swapfee: BigNumber;
  /**
   * % number:  the amount of bprime that the user has in proportion to the total supply.
   */
  poolUsersBPrimeShare: number;
  currentAPY: number;
  primeFarmed: BigNumber;
  bPrimeStaked: BigNumber;
  poolTotalDenormWeights: Map<Address, BigNumber>;
  poolTokenNormWeights: Map<Address, BigNumber>;

  // token balances in bPool
  poolBalances: Map<Address, BigNumber>;
  poolUsersTokenShare: Map<Address, BigNumber>
  // user balance in the given token
  userTokenBalances: Map<Address, BigNumber>;
  primeTokenAddress: Address;
  wethTokenAddress: Address;
  bPrimeTokenAddress: Address;
  poolTokenAddresses: Array<Address>;
  poolTotalBPrimeSupply: BigNumber;
  poolTotalDenormWeight: BigNumber;
  poolTokenAllowances: Map<Address, BigNumber>;
  ethWethAmount: BigNumber;
  wethEthAmount: BigNumber;
  primePrice: number;

  @computedFrom("userTokenBalances")
  get userPrimeBalance(): BigNumber {
    return this.userTokenBalances?.get(this.primeTokenAddress);
  }
  @computedFrom("userTokenBalances")
  get userWethBalance(): BigNumber {
    return this.userTokenBalances?.get(this.wethTokenAddress);
  }
  @computedFrom("userTokenBalances")
  get userEthBalance(): BigNumber {
    return this.userTokenBalances?.get("ETH");
  }
  @computedFrom("userTokenBalances")
  get userBPrimeBalance(): BigNumber {
    return this.userTokenBalances?.get(this.bPrimeTokenAddress);
  }

  constructor(
    private eventAggregator: EventAggregator,
    private contractsService: ContractsService,
    private ethereumService: EthereumService,
    private transactionsService: TransactionsService,
    private tokenService: TokenService,
    private numberService: NumberService,
    private router: Router) {
  }

  async attached(): Promise<void> {
    this.eventAggregator.subscribe("Network.Changed.Account", async () => {
      await this.loadContracts();
      this.getUserBalances();
    });
    this.eventAggregator.subscribe("Network.Changed.Disconnect", async () => {
      // TODO: undefine the bound variables
      this.initialized = false;
    });

    await this.loadContracts();
    await this.initialize();
    return this.getUserBalances(true);
  }

  /**
   * have to call this with and without an account
   */
  async loadContracts() {
    this.crPool = await this.contractsService.getContractFor(ContractNames.ConfigurableRightsPool);
    this.bPool = await this.contractsService.getContractFor(ContractNames.BPOOL);
    this.stakingRewards = await this.contractsService.getContractFor(ContractNames.STAKINGREWARDS);
    this.weth = await this.contractsService.getContractFor(ContractNames.WETH);
    this.primeToken = await this.contractsService.getContractFor(ContractNames.PRIMETOKEN);
    this.bPrimeToken = this.crPool;
  }
  async initialize(): Promise<void> {
    if (!this.initialized) {
      try {
      // timeout to allow styles to load on startup to modalscreen sizes correctly
        setTimeout(() => this.eventAggregator.publish("dashboard.loading", true), 100);

        this.primeTokenAddress = this.contractsService.getContractAddress(ContractNames.PRIMETOKEN);
        this.wethTokenAddress = this.contractsService.getContractAddress(ContractNames.WETH);
        this.bPrimeTokenAddress = this.contractsService.getContractAddress(ContractNames.ConfigurableRightsPool);
        this.poolTokenAddresses = [
          this.primeTokenAddress,
          this.wethTokenAddress,
        ];

        // comment out to run DISCONNECTED
        this.swapfee = await this.bPool.getSwapFee();
        let weights = new Map();
        weights.set(this.primeTokenAddress,
          (await this.bPool.getDenormalizedWeight(this.primeTokenAddress)));
        weights.set(this.wethTokenAddress,
          (await this.bPool.getDenormalizedWeight(this.wethTokenAddress)));

        this.poolTotalDenormWeights = weights;

        weights = new Map();
        weights.set(this.primeTokenAddress,
          (await this.bPool.getNormalizedWeight(this.primeTokenAddress)));
        weights.set(this.wethTokenAddress,
          (await this.bPool.getNormalizedWeight(this.wethTokenAddress)));

        this.poolTokenNormWeights = weights;

        await this.getLiquidityAmounts();
        // do this after liquidity
        await this.getStakingAmounts();
      } catch (ex) {
        this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an error occurred", ex));
      }
      finally {
        this.eventAggregator.publish("dashboard.loading", false);
        this.initialized = true;
      }
    }
  }

  async getUserBalances(initializing = false): Promise<void> {

    if (this.initialized && this.ethereumService.defaultAccountAddress) {
      try {
        if (!initializing) {
        // timeout to allow styles to load on startup to modalscreen sizes correctly
          setTimeout(() => this.eventAggregator.publish("dashboard.loading", true), 100);
        }
        // comment out to run DISCONNECTED
        const provider = this.ethereumService.readOnlyProvider;

        const userTokenBalances = new Map();
        userTokenBalances.set(this.primeTokenAddress, await this.primeToken.balanceOf(this.ethereumService.defaultAccountAddress));
        userTokenBalances.set(this.wethTokenAddress, await this.weth.balanceOf(this.ethereumService.defaultAccountAddress));
        userTokenBalances.set(this.bPrimeTokenAddress, await this.bPrimeToken.balanceOf(this.ethereumService.defaultAccountAddress));
        userTokenBalances.set("ETH", await provider.getBalance(this.ethereumService.defaultAccountAddress));
        this.userTokenBalances = userTokenBalances;

        /**
         * this is user's % of bprime in the total
         */
        this.poolUsersBPrimeShare = toBigNumberJs(this.userBPrimeBalance).div(toBigNumberJs(await this.bPrimeToken.totalSupply())).toNumber();

        const getUserTokenBalance = (tokenAddress: Address): BigNumber => {
          // (user's BPRIME share %) * (the pool's balance of the given token)
          // note you need to have called getLiquidityAmounts prior
          return BigNumber.from(toBigNumberJs(this.poolBalances.get(tokenAddress)).times(this.poolUsersBPrimeShare).integerValue().toString());
        };

        const poolUsersTokenShare = new Map();
        poolUsersTokenShare.set(this.primeTokenAddress, getUserTokenBalance(this.primeTokenAddress));
        poolUsersTokenShare.set(this.wethTokenAddress, getUserTokenBalance(this.wethTokenAddress));
        this.poolUsersTokenShare = poolUsersTokenShare;

        this.primeFarmed = await this.stakingRewards.earned(this.ethereumService.defaultAccountAddress);

        this.bPrimeStaked = await this.stakingRewards.balanceOf(this.ethereumService.defaultAccountAddress);

        await this.getTokenAllowances();

        this.connected= true;
      } catch (ex) {
        this.connected = false;
        this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an error occurred", ex));
      }
      finally {
        if (!initializing) {
          this.eventAggregator.publish("dashboard.loading", false);
        }
      }
    } else {
      this.bPrimeStaked =
        this.poolUsersBPrimeShare =
        this.primeFarmed =
        this.poolUsersTokenShare =
        this.userTokenBalances = undefined;

      this.connected = false;
    }
  }

  async getStakingAmounts(): Promise<void> {
    this.currentAPY =
    ((this.numberService.fromString(fromWei((await this.stakingRewards.initreward()))) / 30)
    * this.primePrice * 365) / this.liquidityBalance;
  }

  async getLiquidityAmounts(): Promise<void> {
    try {
      // STUB out liquidity stuff
      // const prices = await this.tokenService.getTokenPrices([]);

      // // for APY
      // this.primePrice = prices.primedao;

      // const priceWethLiquidity =
      //   this.numberService.fromString(fromWei(await this.bPool.getBalance(this.contractsService.getContractAddress(ContractNames.WETH)))) *
      //   prices.weth;

      // const pricePrimeTokenLiquidity =
      //     this.numberService.fromString(fromWei(await this.bPool.getBalance(this.contractsService.getContractAddress(ContractNames.PRIMETOKEN)))) *
      //   prices.primedao;

      // this.liquidityBalance = priceWethLiquidity + pricePrimeTokenLiquidity;

      const poolBalances = new Map();
      poolBalances.set(this.primeTokenAddress, await this.primeToken.balanceOf(this.contractsService.getContractAddress(ContractNames.BPOOL)));
      poolBalances.set(this.wethTokenAddress, await this.weth.balanceOf(this.contractsService.getContractAddress(ContractNames.BPOOL)));
      this.poolBalances = poolBalances;

      this.poolTotalBPrimeSupply = await this.bPrimeToken.totalSupply();

      this.poolTotalDenormWeight = await this.bPool.getTotalDenormalizedWeight();

    } catch (ex) {

      this.eventAggregator.publish("handleException",
        new EventConfigException("Unable to fetch a token price", ex));
      this.poolBalances =
      this.liquidityBalance = undefined;
    }
  }

  async getTokenAllowances(): Promise<void> {
    const allowances = new Map();
    await allowances.set(this.primeTokenAddress, await this.primeToken.allowance(
      this.ethereumService.defaultAccountAddress,
      this.contractsService.getContractAddress(ContractNames.ConfigurableRightsPool)));
    await allowances.set(this.wethTokenAddress, await this.weth.allowance(
      this.ethereumService.defaultAccountAddress,
      this.contractsService.getContractAddress(ContractNames.ConfigurableRightsPool)));
    await allowances.set(this.bPrimeTokenAddress, await this.bPrimeToken.allowance(
      this.ethereumService.defaultAccountAddress,
      this.contractsService.getContractAddress(ContractNames.STAKINGREWARDS)));
    this.poolTokenAllowances = allowances;
  }
  ensureConnected(): boolean {
    if (!this.connected) {
      // TODO: make this await until we're either connected or not?
      this.ethereumService.connect();
      return false;
    }
    else {
      return true;
    }
  }

  async handleDeposit() {
    if (this.ensureConnected()) {
      if (this.ethWethAmount.gt(this.userEthBalance)) {
        this.eventAggregator.publish("handleValidationError", new EventConfigFailure("You don't have enough ETH to wrap the amount you requested"));
      } else {
        await this.transactionsService.send(() => this.weth.deposit({ value: this.ethWethAmount }));
        // TODO:  should happen after mining
        this.getUserBalances();
      }
    }
  }

  async handleWithdraw() {
    if (this.ensureConnected()) {
      if (this.wethEthAmount.gt(this.userWethBalance)) {
        this.eventAggregator.publish("handleValidationError", new EventConfigFailure("You don't have enough WETH to unwrap the amount you requested"));
      } else {
        await this.transactionsService.send(() => this.weth.withdraw(this.wethEthAmount));
        this.getUserBalances();
      }
    }
  }

  stakeAmount: BigNumber;

  async handleHarvestWithdraw() {
    if (this.ensureConnected()) {
      await this.transactionsService.send(() => this.stakingRewards.exit());
      this.getUserBalances();
    }
  }

  gotoLiquidity(remove = false) {
    if (this.ensureConnected()) {
      Object.assign(this,
        {
          bPoolAddress: this.contractsService.getContractAddress(ContractNames.BPOOL),
        });
      const routeName = remove ? "liquidityRemove" : "liquidityAdd";
      const theRoute = this.router.routes.find(x => x.name === routeName);
      theRoute.settings.state = this;
      this.router.navigateToRoute(routeName);
    }
  }

  gotoStaking(harvest = false) {
    if (this.ensureConnected()) {
      Object.assign(this,
        {
          harvest,
        });

      const theRoute = this.router.routes.find(x => x.name === "staking");
      theRoute.settings.state = this;
      this.router.navigateToRoute("staking");
    }
  }

  async liquidityJoinswapExternAmountIn(tokenIn, tokenAmountIn, minPoolAmountOut): Promise<void> {
    if (this.ensureConnected()) {
      await this.transactionsService.send(() => this.crPool.joinswapExternAmountIn(
        tokenIn,
        tokenAmountIn,
        minPoolAmountOut));
      await this.getLiquidityAmounts();
      this.getUserBalances();
    }
  }

  async liquidityJoinPool(poolAmountOut, maxAmountsIn): Promise<void> {
    if (this.ensureConnected()) {
      await this.transactionsService.send(() => this.crPool.joinPool(poolAmountOut, maxAmountsIn));
      await this.getLiquidityAmounts();
      this.getUserBalances();
    }
  }

  async liquidityExit(poolAmountIn, minAmountsOut): Promise<void> {
    if (this.ensureConnected()) {
      await this.transactionsService.send(() => this.crPool.exitPool(poolAmountIn, minAmountsOut));
      await this.getLiquidityAmounts();
      this.getUserBalances();
    }
  }

  async liquidityExitswapPoolAmountIn(tokenOutAddress, poolAmountIn, minTokenAmountOut): Promise<void> {
    if (this.ensureConnected()) {
      await this.transactionsService.send(() => this.crPool.exitswapPoolAmountIn(tokenOutAddress, poolAmountIn, minTokenAmountOut));
      await this.getLiquidityAmounts();
      this.getUserBalances();
    }
  }

  async liquiditySetTokenAllowance(tokenAddress: Address, amount: BigNumber): Promise<void> {
    if (this.ensureConnected()) {
      const tokenContract = tokenAddress === this.primeTokenAddress ? this.primeToken : this.weth;
      await this.transactionsService.send(() => tokenContract.approve(
        this.contractsService.getContractAddress(ContractNames.ConfigurableRightsPool),
        amount));
      // TODO:  should happen after mining
      this.getTokenAllowances();
    }
  }

  async stakingSetTokenAllowance(amount: BigNumber): Promise<void> {
    if (this.ensureConnected()) {
      const tokenContract = this.bPrimeToken;
      await this.transactionsService.send(() => tokenContract.approve(
        this.contractsService.getContractAddress(ContractNames.STAKINGREWARDS),
        amount));
      // TODO:  should happen after mining
      this.getTokenAllowances();
    }
  }

  async stakingStake(amount: BigNumber): Promise<void> {
    if (this.ensureConnected()) {
      await this.transactionsService.send(() => this.stakingRewards.stake(amount));
      // TODO:  should happen after mining
      this.getUserBalances();
    }
  }

  async stakingHarvest(): Promise<void> {
    if (this.ensureConnected()) {
      await this.transactionsService.send(() => this.stakingRewards.getReward());
      // TODO:  should happen after mining
      this.getUserBalances();
    }
  }


  async stakingExit(): Promise<void> {
    if (this.ensureConnected()) {
      if (this.bPrimeStaked.isZero()) {
        this.eventAggregator.publish("handleValidationError", new EventConfigFailure("You have not staked any BPRIME, so there is nothing to exit"));
      } else {
        await this.transactionsService.send(() => this.stakingRewards.exit());
      }
      this.getUserBalances();
    }
  }

  handleGetMax() {
    this.wethEthAmount = this.userWethBalance;
  }
}
