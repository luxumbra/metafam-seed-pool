import { EventAggregator } from "aurelia-event-aggregator";
import { autoinject, computedFrom } from "aurelia-framework";
import { BigNumber } from "ethers";
import { toBigNumberJs } from "services/BigNumberService";
import { calcPoolOutGivenSingleIn } from "services/BalancerPoolLiquidity/helpers/math";
import { calcPoolTokensByRatio } from "services/BalancerPoolLiquidity/helpers/utils";
import { Address } from "services/EthereumService";
import "./liquidity.scss";
import BigNumberJs from "services/BigNumberService";
import { Redirect } from 'aurelia-router';

const BALANCE_BUFFER = 0.01;

@autoinject
export class LiquidityAdd {

  constructor(
    private eventAggregator: EventAggregator) { }

  private model: ILiquidityModel;
  private amounts = new Map<Address, string>();
  private poolTokens: any;
  private primeAmount: BigNumber;
  private wethAmount: BigNumber;
  private _primeSelected = false;
  private _wethSelected = false;

  public canActivate(_model: unknown, routeConfig: { settings: { state: ILiquidityModel } }): Redirect | undefined {
    if (!routeConfig.settings.state) {
      return new Redirect("");
    }
  }

  public activate(_model: unknown, routeConfig: { settings: { state: ILiquidityModel } }): void {
    this.model = routeConfig.settings.state;
  }

  private get primeSelected() {
    return this._primeSelected;
  }

  private set primeSelected(yes: boolean) {
    this._primeSelected = yes;
      this.poolTokens = null;
      this.amounts.delete(this.model.primeTokenAddress);
      this.primeAmount = null;
        this.handleAmountChange(this.model.primeTokenAddress);
  }

  private get wethSelected() {
    return this._wethSelected;
  }

  private set wethSelected(yes: boolean) {
    this._wethSelected = yes;
      this.poolTokens = null;
      this.amounts.delete(this.model.wethTokenAddress);
      this.wethAmount = null;
        this.handleAmountChange(this.model.wethTokenAddress);
  }
  /**
   * true if two non-zero assets are entered
   */
  @computedFrom("wethSelected", "primeSelected")
  private get isMultiAsset(): boolean {
    return this.wethSelected && this.primeSelected;
  }

  /**
   * true if exactly one non-zero asset is entered
   */
  @computedFrom("wethSelected", "primeSelected")
  private get isSingleAsset(): boolean {
    return this.wethSelected !== this.primeSelected;
  }

  @computedFrom("wethSelected", "primeSelected")
  private get activeSingleTokenAddress(): Address {
    if (this.isSingleAsset) {
      return this.primeSelected ? this.model.primeTokenAddress : this.model.wethTokenAddress;
    } else {
      return null;
    }
  }

  @computedFrom("wethSelected", "primeSelected")
  private get activeSingleTokenAmount(): BigNumber {
    if (this.isSingleAsset) {
      return (this.primeSelected ? this.primeAmount : this.wethAmount) ?? BigNumber.from(0);
    } else {
      return null;
    }
  }

  private handleAmountChange(tokenAddress: Address): void {
      setTimeout(() => this.amountChanged(
        (tokenAddress === this.model.primeTokenAddress) ? this.primeAmount : this.wethAmount,
        tokenAddress), 100);
  }

  @computedFrom("invalidPrimeAdd", "primeHasSufficientAllowance")
  private get showPrimeUnlock(): boolean {
    return !this.invalidPrimeAdd && !this.primeHasSufficientAllowance;
  }

  @computedFrom("invalidWethAdd", "wethHasSufficientAllowance")
  private get showWethUnlock(): boolean {
    return !this.invalidWethAdd && !this.wethHasSufficientAllowance;
  }

  @computedFrom("model.poolTokenAllowances")
  private get primeAllowance(): BigNumber {
    return this.model.poolTokenAllowances.get(this.model.primeTokenAddress);
  }

  @computedFrom("model.poolTokenAllowances")
  private get wethAllowance(): BigNumber {
    return this.model.poolTokenAllowances.get(this.model.wethTokenAddress);
  }

  @computedFrom("primeAmount", "primeAllowance")
  private get primeHasSufficientAllowance(): boolean {
    return !this.primeAmount || this.primeAllowance.gte(this.primeAmount);
  }

  @computedFrom("wethAmount", "wethAllowance")
  private get wethHasSufficientAllowance(): boolean {
    return !this.wethAmount || this.wethAllowance.gte(this.wethAmount);
  }

  @computedFrom("poolTokens", "model.userBPrimeBalance", "model.poolTotalBPrimeSupply")
  private get userLiquidity() {
    const userShares = toBigNumberJs(this.model.userBPrimeBalance);
    const totalShares = toBigNumberJs(this.model.poolTotalBPrimeSupply);
    const current = userShares.div(totalShares).integerValue(BigNumberJs.ROUND_UP);
    if (this.invalid || !(this.isSingleAsset || this.isMultiAsset)) {
      return {
        absolute: {
          current: BigNumber.from(userShares.toString()),
        },
        relative: {
          current: BigNumber.from(current.toString()),
        },
      };
    }

    const poolTokens = toBigNumberJs(this.poolTokens ?? "0");

    const future = userShares.plus(poolTokens)
      .div(totalShares.plus(poolTokens))
      .integerValue(BigNumberJs.ROUND_UP);

    return {
      absolute: {
        current: BigNumber.from(userShares.toString()),
        future: BigNumber.from(userShares.plus(poolTokens).toString()),
      },
      relative: {
        current: BigNumber.from(current.toString()),
        future: BigNumber.from(future.toString()),
      },
    };
  }

  private showSlippage: boolean;

  private refreshShowSlippage() {
    this.showSlippage =
      this.activeSingleTokenAddress &&
      !this.invalid &&
      (!!this.amounts.get(this.activeSingleTokenAddress) && BigNumber.from(this.amounts.get(this.activeSingleTokenAddress)).gt(0));
  }

  @computedFrom("showSlippage", "activeSingleTokenAmount", "primeAmount", "wethAmount", "bPrimeAmount", "model.poolBalances", "model.poolTotalBPrimeSupply", "model.poolTotalDenormWeights", "model.poolTotalDenormWeight")
  private get slippage(): string {
    this.refreshShowSlippage();
    if (!this.showSlippage) {
      return undefined;
    }
    const tokenAddress = this.activeSingleTokenAddress;
    const tokenBalance = toBigNumberJs(this.model.poolBalances.get(tokenAddress));
    const poolTokenShares = toBigNumberJs(this.model.poolTotalBPrimeSupply);
    const tokenWeight = toBigNumberJs(this.model.poolTotalDenormWeights.get(tokenAddress));
    const totalWeight = toBigNumberJs(this.model.poolTotalDenormWeight);
    const swapfee = toBigNumberJs(this.model.swapfee);

    let amount = toBigNumberJs(this.amounts.get(tokenAddress));

    let amountOut: BigNumberJs;
    let expectedAmount: BigNumberJs;

      const roundedIntAmount = toBigNumberJs(amount.integerValue(BigNumberJs.ROUND_UP));

      amountOut = calcPoolOutGivenSingleIn(
        tokenBalance,
        tokenWeight,
        poolTokenShares,
        totalWeight,
        roundedIntAmount,
        swapfee);

      expectedAmount = roundedIntAmount
        .times(tokenWeight)
        .times(poolTokenShares)
        .div(tokenBalance)
        .div(totalWeight);

    return toBigNumberJs(1)
      .minus(amountOut.div(expectedAmount))
      .times(100)
      .toString();
  }

  private amountChanged(
    changedAmount: BigNumber,
    changedToken: Address,
  ): void {

    changedAmount = changedAmount ?? BigNumber.from(0);

    const changedTokenBalance = toBigNumberJs(this.model.poolBalances.get(changedToken));
    const ratio = toBigNumberJs(changedAmount).div(changedTokenBalance);
    const poolTokenShares = toBigNumberJs(this.model.poolTotalBPrimeSupply);

    if (this.isMultiAsset) {
      this.poolTokens = calcPoolTokensByRatio(
        toBigNumberJs(ratio),
        toBigNumberJs(poolTokenShares));
    } else if (this.isSingleAsset) {
      const tokenIn = this.activeSingleTokenAddress;
      const amount = toBigNumberJs(this.activeSingleTokenAmount);
      const tokenInBalanceIn = toBigNumberJs(this.model.poolBalances.get(tokenIn));
      const maxInRatio = 1 / 2;
      if (amount.div(tokenInBalanceIn).gt(maxInRatio)) {
        return;
      }

      const tokenWeightIn = this.model.poolTotalDenormWeights.get(tokenIn);
      const tokenAmountIn = amount.integerValue(BigNumberJs.ROUND_UP);
      const totalWeight = toBigNumberJs(this.model.poolTotalDenormWeight);

      this.poolTokens = calcPoolOutGivenSingleIn(
        tokenInBalanceIn,
        toBigNumberJs(tokenWeightIn),
        poolTokenShares,
        totalWeight,
        tokenAmountIn,
        toBigNumberJs(this.model.swapfee))
        .toString();
    }

    this.amounts.set(changedToken, changedAmount.toString());

    if (this.isMultiAsset) {

      this.model.poolTokenAddresses.map(tokenAddr => {
        if (tokenAddr !== changedToken) {
          const balancedAmountString = ratio.isNaN() ? "" :
            ratio.times(toBigNumberJs(this.model.poolBalances.get(tokenAddr)))
              .integerValue(BigNumberJs.ROUND_UP)
              .toString();

          this.amounts.set(tokenAddr, balancedAmountString);
          // since we're not yet binding the UI to an array of tokens
          const balancedAmount = BigNumber.from(balancedAmountString);
          if (tokenAddr === this.model.wethTokenAddress) {
            this.wethAmount = balancedAmount;
          } else {
            this.primeAmount = balancedAmount;
          }
          // this.setAmount((tokenAddr === this.model.wethTokenAddress) ?
          //   this.model.primeTokenAddress : this.model.wethTokenAddress, balancedAmount);
        }
      });
    }
    // TODO: figure out smarter way to handle this dependency
    this.refreshShowSlippage();
  }

  private assetsAreLocked(issueMessage = true): boolean {
    let message: string;
    if (this.isMultiAsset) {
      if (!this.primeHasSufficientAllowance || !this.wethHasSufficientAllowance) {
        message = "Before adding you need to unlock PRIME and/or WETH tokens for transfer";
      }
    } else if (this.isSingleAsset) {
      if (this.primeSelected) {
        if (!this.primeHasSufficientAllowance) {
          message = "Before adding you need to unlock the PRIME tokens for transfer";
        }
      } else {
        if (!this.wethHasSufficientAllowance) {
          message = "Before adding you need to unlock the WETH tokens for transfer";
        }
      }
    }

    if (message) {
      if (issueMessage) {
        this.eventAggregator.publish("handleValidationError", message);
      }
      return false;
    }

    return true;
  }

  /**
   * return error message if not valid enough to submit, except for checking unlocked condition
 */
  @computedFrom("invalidPrimeAdd", "invalidWethAdd", "isSingleAsset", "model.poolBalances", "activeSingleTokenAmount", "activeSingleTokenAddress")
  private get invalid(): string {
    let message: string;

    if (this.isSingleAsset) {
      message = (this.activeSingleTokenAddress === this.model.primeTokenAddress) ? this.invalidPrimeAdd : this.invalidWethAdd;

      if (!message) {
        const maxInRatio = 1 / 2;
        const amount = toBigNumberJs(this.amounts.get(this.activeSingleTokenAddress));
        const tokenBalance = toBigNumberJs(this.model.poolBalances.get(this.activeSingleTokenAddress));

        if (amount.div(tokenBalance).gt(maxInRatio)) {
          message = "Insufficient pool liquidity.  Reduce the amount you wish to add.";
        }
      }
    } else if (this.isMultiAsset) {
      message = this.invalidPrimeAdd || this.invalidWethAdd;
    } else {
      message = "To add liquidity you must select at least one asset";
    }

    return message;
  }

  @computedFrom("primeAmount")
  private get invalidPrimeAdd(): string {
    let message: string;

    if (!this.primeAmount || this.primeAmount.isZero()) {
      message = "Please specify an amount of PRIME";
    } else {
      if (this.primeAmount.gt(this.model.userPrimeBalance)) {
        message = "Cannot add this amount of PRIME because it exceeds your PRIME balance";
      }
    }

    // if (!this.primeHasSufficientAllowance) {
    //   message = "Can't add this amount, you will exceed your balance of PRIME";
    // }

    return message;
  }

  @computedFrom("wethAmount")
  private get invalidWethAdd(): string {
    let message: string;

    if (!this.wethAmount || this.wethAmount.isZero()) {
      message = "Please specify an amount of WETH";
    } else {
      if (this.wethAmount.gt(this.model.userWethBalance)) {
        message = "Cannot add this amount of WETH because it exceeds your WETH balance";
      }
    }

    // if (!this.wethHasSufficientAllowance) {
    //   message = "Can't add this amount, you will exceed your balance of WETH";
    // }

    return message;
  }

  private isValid(): boolean {
    let message;

    if (!message) {
      message = this.invalid;
    }

    if (message) {
      this.eventAggregator.publish("handleValidationError", message);
    }

    return !message;
  }

  private async handleSubmit(): Promise<void> {

    if (!this.isValid() || !this.assetsAreLocked()) {
      return;
    }

    if (this.isMultiAsset) {
    // computed by amountChanged
      const poolAmountOut = this.poolTokens;
      const maxAmountsIn =
        this.model.poolTokenAddresses.map(tokenAddress => {
          // this.amounts computed by amountChanged
          const inputAmountIn = toBigNumberJs(this.amounts.get(tokenAddress))
            .div(1 - BALANCE_BUFFER)
            .integerValue(BigNumberJs.ROUND_UP);
          /**
         * pool is crPool
         * balance of the token held by the crPool
         */
          const balanceAmountIn = toBigNumberJs(this.model.userTokenBalances.get(tokenAddress));
          const tokenAmountIn = BigNumberJs.min(inputAmountIn, balanceAmountIn);
          return tokenAmountIn.toString();
        });

      this.model.liquidityJoinPool(poolAmountOut, maxAmountsIn);

    } else if (this.isSingleAsset) {
      const tokenIn = this.activeSingleTokenAddress;
      if (!tokenIn) {
        return;
      }

      const tokenAmountIn = toBigNumberJs(this.amounts.get(tokenIn))
        .integerValue(BigNumberJs.ROUND_UP)
        .toString();

      const minPoolAmountOut = toBigNumberJs(this.poolTokens)
        .times(1 - BALANCE_BUFFER)
        .integerValue(BigNumberJs.ROUND_UP)
        .toString();

      this.model.liquidityJoinswapExternAmountIn(tokenIn, tokenAmountIn, minPoolAmountOut);
    }
  }

  private handleGetMaxWeth() {
    this.wethAmount = this.model.userWethBalance;
    this.handleAmountChange(this.model.wethTokenAddress);
  }

  private handleGetMaxPrime() {
    this.primeAmount = this.model.userPrimeBalance;
    this.handleAmountChange(this.model.primeTokenAddress);
  }

  private unlock(tokenAddress: Address) {
    this.model.liquiditySetTokenAllowance(tokenAddress,
      tokenAddress === this.model.primeTokenAddress ? this.primeAmount : this.wethAmount);
  }
}

interface ILiquidityModel {
  poolBalances: Map<Address, BigNumber>;
  connected: boolean;
  liquidityJoinPool(poolAmountOut, maxAmountsIn): Promise<void>;
  liquidityJoinswapExternAmountIn(tokenIn, tokenAmountIn, minPoolAmountOut): Promise<void>;
  liquiditySetTokenAllowance(tokenAddress: Address, amount: BigNumber): Promise<void>;
  swapfee: BigNumber;
  userBPrimeBalance: BigNumber;
  userPrimeBalance: BigNumber;
  userWethBalance: BigNumber;
  poolTotalDenormWeights: Map<string, BigNumber>;
  poolTokenAddresses: Array<Address>;
  poolTokenAllowances: Map<Address, BigNumber>;
  primeTokenAddress: Address;
  poolTotalBPrimeSupply: BigNumber;
  poolTotalDenormWeight: BigNumber;
  wethTokenAddress: Address;
  userTokenBalances: Map<Address, BigNumber>;
}

/**
 * random TODO:  handle cases where tokens may not have 18 decimals?
 */
