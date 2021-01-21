import { EventAggregator } from "aurelia-event-aggregator";
import { autoinject, computedFrom } from "aurelia-framework";
import { BigNumber } from "ethers";
import { toBigNumberJs } from "services/BigNumberService";
import { calcSingleOutGivenPoolIn } from "services/BalancerPoolLiquidity/helpers/math";
import { Address } from "services/EthereumService";
import "./liquidity.scss";
import BigNumberJs from "services/BigNumberService";
import { Redirect } from 'aurelia-router';

const BALANCE_BUFFER = 0.01;

@autoinject
export class LiquidityRemove {

  constructor(
    private eventAggregator: EventAggregator) { }

  private model: ILiquidityModel;
  private primeAmount: BigNumber;
  private wethAmount: BigNumber;
  private _bPrimeAmount: BigNumber;
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

  @computedFrom("model.poolUsersTokenShare")
  private get userPrimePoolShare(): BigNumber {
    return this.model.poolUsersTokenShare?.get(this.model.primeTokenAddress);
  }

  @computedFrom("model.poolUsersTokenShare")
  private get userWethPoolShare(): BigNumber {
    return this.model.poolUsersTokenShare?.get(this.model.wethTokenAddress);
  }

  private get primeSelected() {
    return this._primeSelected;
  }

  private set primeSelected(yes: boolean) {
    this._primeSelected = yes;
    setTimeout(() => this.syncWithNewBPrimeAmount(), 100);
  }

  private get wethSelected() {
    return this._wethSelected;
  }

  private set wethSelected(yes: boolean) {
    this._wethSelected = yes;
    setTimeout(() => this.syncWithNewBPrimeAmount(), 100);
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

  @computedFrom("_bPrimeAmount")
  private get bPrimeAmount(): BigNumber {
    return this._bPrimeAmount;
  }

  private set bPrimeAmount(newValue: BigNumber) {
    this._bPrimeAmount = newValue;
    this.syncWithNewBPrimeAmount();
  }

  private syncWithNewBPrimeAmount(): void {
    this.primeAmount = this.computeTokenToRemoveAmount(this.model.primeTokenAddress);
    this.wethAmount = this.computeTokenToRemoveAmount(this.model.wethTokenAddress);
    // TODO: figure out smarter way to handle this dependency
    this.refreshShowSlippage();
  }

  private showSlippage: boolean;

  private refreshShowSlippage() {
    this.showSlippage =
      this.activeSingleTokenAddress &&
      !this.invalid &&
      this.bPrimeAmount?.gt(0);
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

    let amount = toBigNumberJs(this.bPrimeAmount);

    let amountOut: BigNumberJs;
    let expectedAmount: BigNumberJs;

      if (amount.div(poolTokenShares).gt(0.99)) {
        // Invalidate user's attempt to withdraw the entire pool supply in a single token
        // At amounts close to 100%, solidity math freaks out
        return "";
      }
      amountOut = calcSingleOutGivenPoolIn(
        tokenBalance,
        tokenWeight,
        poolTokenShares,
        totalWeight,
        amount,
        swapfee);

      expectedAmount = amount
        .times(totalWeight)
        .times(tokenBalance)
        .div(poolTokenShares)
        .div(tokenWeight);

    return toBigNumberJs(1)
      .minus(amountOut.div(expectedAmount))
      .times(100)
      .toString();
  }

  private computeTokenToRemoveAmount(tokenAddress: Address): BigNumber {
    if (!this.bPrimeAmount || this.bPrimeAmount.eq(0)) return BigNumber.from(0);
    const poolTokenBalance = this.model.poolBalances.get(tokenAddress);
    const bPoolTokenSupply = this.model.poolTotalBPrimeSupply;
    if (this.isMultiAsset) {
      return BigNumber.from(toBigNumberJs(poolTokenBalance)
        .div(toBigNumberJs(bPoolTokenSupply))
        .times(toBigNumberJs(this.bPrimeAmount))
        .integerValue(BigNumberJs.ROUND_UP)
        .toString());
    } else {

      const singleOut = calcSingleOutGivenPoolIn(
        toBigNumberJs(poolTokenBalance),
        toBigNumberJs(this.model.poolTotalDenormWeights.get(tokenAddress)),
        toBigNumberJs(bPoolTokenSupply),
        toBigNumberJs(this.model.poolTotalDenormWeight),
        toBigNumberJs(this.bPrimeAmount),
        toBigNumberJs(this.model.swapfee));

      if (singleOut === null) {
        return null;
      } else {
        return BigNumber.from(singleOut
          .integerValue(BigNumberJs.ROUND_UP)
          .toString());
      }
    }
  }

  private getRemoveTokenAmountOut(
    bPrimeAmount: BigNumber,
    tokenAddress: Address): BigNumberJs {

    if (!bPrimeAmount || bPrimeAmount.eq(0)) return new BigNumberJs(0);

    return calcSingleOutGivenPoolIn(
      toBigNumberJs(this.model.poolBalances.get(tokenAddress)),
      toBigNumberJs(this.model.poolTotalDenormWeights.get(tokenAddress)),
      toBigNumberJs(this.model.poolTotalBPrimeSupply),
      toBigNumberJs(this.model.poolTotalDenormWeight),
      toBigNumberJs(bPrimeAmount),
      toBigNumberJs(this.model.swapfee),
    );
  }

  /**
   * return error message if not valid enough to submit, except for checking unlocked condition
   */
  @computedFrom("invalidPrimeAdd", "invalidWethAdd", "isSingleAsset", "model.poolBalances", "activeSingleTokenAmount", "activeSingleTokenAddress")
  private get invalid(): string {
    let message: string;

    if (this.isSingleAsset) {
      if (this.activeSingleTokenAmount.gt(this.model.poolBalances.get(this.activeSingleTokenAddress))) {
        message = "Can't remove this amount because it exceeds the amount in the pool";
      } else {
        const tokenAddress = this.activeSingleTokenAddress;
        const maxOutRatio = 1 / 3;
        const amount = toBigNumberJs(this.bPrimeAmount);
        const tokenBalance = toBigNumberJs(this.model.poolBalances.get(tokenAddress));
        const poolTokenShares = toBigNumberJs(this.model.poolTotalBPrimeSupply);
        const tokenWeight = toBigNumberJs(this.model.poolTotalDenormWeights.get(tokenAddress));
        const totalWeight = toBigNumberJs(this.model.poolTotalDenormWeight);
        const swapfee = toBigNumberJs(this.model.swapfee);

        if (amount.div(poolTokenShares).gt(0.99)) {
          // Invalidate user's attempt to withdraw the entire pool supply in a single token
          // At amounts close to 100%, solidity math freaks out
          message = "Insufficient pool liquidity.  Reduce the amount you wish to remove.";
        } else {
          const tokenAmountOut = calcSingleOutGivenPoolIn(
            tokenBalance,
            tokenWeight,
            poolTokenShares,
            totalWeight,
            amount,
            swapfee);

          if (tokenAmountOut.div(tokenBalance).gt(maxOutRatio)) {
            message = "Insufficient pool liquidity.  Reduce the amount you wish to remove.";
          }
        }
      }
    }

    return message;
  }

  private isValid(): boolean {
    let message;

    if (this.isSingleAsset) {
      if (this.bPrimeAmount.gt(this.model.userBPrimeBalance)) {
        message = "Can't remove this amount because it exceeds your total share of BPRIME";
      }
    }

    if (!message) {
      message = this.invalid;
    }

    if (message) {
      this.eventAggregator.publish("handleValidationError", message);
    }

    return !message;
  }

  private async handleSubmit(): Promise<void> {

    if (!this.isValid()) {
      return;
    }

    if (this.isMultiAsset) {
      await this.model.liquidityExit(
        this.bPrimeAmount,
        this.model.poolTokenAddresses.map(() => "0"),
      );
    } else if (this.isSingleAsset) {
      const tokenAmount = this.activeSingleTokenAmount;
      const tokenAddress = this.activeSingleTokenAddress;
      const amountOut = this.getRemoveTokenAmountOut(tokenAmount, tokenAddress);
      if (amountOut === null) {
        this.eventAggregator.publish("handleValidationError", "Cannot process an amount this large");
      }
      const minTokenAmountOut = amountOut
        .times(1 - BALANCE_BUFFER)
        .integerValue(BigNumberJs.ROUND_UP)
        .toString();
      this.model.liquidityExitswapPoolAmountIn(
        tokenAddress,
        this.bPrimeAmount,
        minTokenAmountOut,
      );
    }
  }

  private handleGetMaxBPrime() {
    this.bPrimeAmount = this.model.userBPrimeBalance;
  }
}

interface ILiquidityModel {
  poolBalances: Map<Address, BigNumber>;
  connected: boolean;
  liquidityExit(bPrimeAmount, minAmountsOut): Promise<void>;
  liquidityExitswapPoolAmountIn(tokenAddress, bPrimeAmount, minTokenAmountOut): Promise<void>;
  remove: boolean; // if falsy then add
  swapfee: BigNumber;
  userBPrimeBalance: BigNumber;
  poolTotalDenormWeights: Map<string, BigNumber>;
  poolTokenAddresses: Array<Address>;
  poolUsersTokenShare: Map<Address, BigNumber>;
  primeTokenAddress: Address;
  poolTotalBPrimeSupply: BigNumber;
  poolTotalDenormWeight: BigNumber;
  wethTokenAddress: Address;
}

/**
 * random TODO:  handle cases where tokens may not have 18 decimals?
 */
