import axios from "axios";
import { BigNumber } from "ethers";
import { IPoolConfig } from "services/PoolService";
import { IErc20Token, ITokenInfo, TokenService } from "services/TokenService";
import { autoinject } from "aurelia-framework";
import { ContractNames, ContractsService } from "services/ContractsService";
import { Address, EthereumService, fromWei } from "services/EthereumService";
import { NumberService } from "services/numberService";
import { ConsoleLogService } from "services/ConsoleLogService";
import { EventConfigFailure } from "services/GeneralEvents";
import { toBigNumberJs } from "services/BigNumberService";

// export interface IPool extends IPoolConfig {
//   crPool: any;
//   bPool: any;
//   assetTokens: Array<IErc20Token>;
//   poolToken: IErc20Token;
// }

export interface IPoolTokenInfo extends ITokenInfo {
  tokenContract: IErc20Token;
  price: number;
  icon: string;
  balanceInPool: BigNumber;
  userShareInPool: number;
  denormWeight: BigNumber;
  denormWeightPercentage: number;
  normWeight: BigNumber;
  normWeightPercentage: number;
}

@autoinject
export class Pool implements IPoolConfig {
  /**
   * IPoolConfig....
   */
  name: string;
  description: string;
  /**
   * crPool address on the different networks
   */
  address: Address;
  /**
   * SVG icon for the pool
   */
  icon: string;

  crPool: any;
  bPool: any;
  assetTokens: IPoolTokenInfo[];
  poolToken: IPoolTokenInfo;
  poolTokenTotalSupply: BigNumber;
  poolTotalDenormWeight: BigNumber;
  swapfee: BigNumber;

  public constructor(
    private contractsService: ContractsService,
    private ethereumService: EthereumService,
    private numberService: NumberService,
    private tokenService: TokenService,
    private consoleLogService: ConsoleLogService,
    ) {
  }

  public async initialize(config: IPoolConfig): Promise<Pool> {
    Object.assign(this, config);

    const crPoolAddress = this.address;

    this.crPool = await this.contractsService.getContractAtAddress(
      ContractNames.ConfigurableRightsPool,
      crPoolAddress);

    this.bPool = await this.contractsService.getContractAtAddress(
      ContractNames.BPOOL,
      await this.crPool.bPool());

    const poolTokenInfo = (await this.tokenService.getTokenInfoFromAddress(crPoolAddress)) as IPoolTokenInfo;
    poolTokenInfo.tokenContract = this.crPool;
    this.poolToken = poolTokenInfo;
    
    const assetTokenAddresses = await this.bPool.getCurrentTokens();
    const assetTokens = new Array<IPoolTokenInfo>();
    
    for (const tokenAddress of assetTokenAddresses) {
      const tokenInfo = (await this.tokenService.getTokenInfoFromAddress(tokenAddress)) as IPoolTokenInfo;
      tokenInfo.tokenContract =
        await this.contractsService.getContractAtAddress(
        ContractNames.IERC20,
        tokenAddress);
      assetTokens.push(tokenInfo);
    }

    await this.hydrateTokenPrices(assetTokens);

    await this.hydratePoolTokenBalances(assetTokens);

    await this.hydrateWeights(assetTokens);

    this.hydrateTotalLiquidity(assetTokens);
    
    this.assetTokens = assetTokens;

    this.poolTokenTotalSupply = await this.poolToken.tokenContract.totalSupply();
    this.poolTotalDenormWeight = await this.bPool.getTotalDenormalizedWeight();
    this.swapfee = await this.bPool.getSwapFee();

    return this;
  }

  async hydrateTokenPrices(tokens: Array<IPoolTokenInfo>): Promise<void> {
    // const uri = `https://api.coingecko.com/api/v3/simple/price?ids=${tokens.reduce((accumulator, currentValue) => `${accumulator}%2C${currentValue.id}`, "")
    //   }&vs_currencies=USD%2CUSD`;
  
    for (const token of tokens) {
      const uri = `https://api.coingecko.com/api/v3/coins/${token.id}?market_data=true&localization=false&community_data=false&developer_data=false&sparkline=false`;

      await axios.get(uri)
        .then((response) => {
          token.price = response.data.market_data.current_price.usd;
          token.icon = response.data.image.thumb;
        })
        .catch((error) => {
          this.consoleLogService.handleFailure(
            new EventConfigFailure(`PriceService: Error fetching token price ${error?.message}`));
        });
    }
  }

  async hydratePoolTokenBalances(tokens: Array<IPoolTokenInfo>): Promise<void> {
    for (const token of tokens) {
      token.balanceInPool = await this.bPool.getBalance(token.address);
    }
  }

  totalLiquidity: number;

  hydrateTotalLiquidity(tokens: Array<IPoolTokenInfo>): void {
    this.totalLiquidity = tokens.reduce((accumulator, currentValue) => 
      accumulator + this.numberService.fromString(fromWei(currentValue.balanceInPool)) * currentValue.price, 0)
  }

  async hydrateWeights(tokens: Array<IPoolTokenInfo>): Promise<void> {
    for (const token of tokens) {
      token.denormWeight = await this.bPool.getDenormalizedWeight(token.address);
      token.denormWeightPercentage = Number(fromWei(token.denormWeight.mul(100)));
      token.normWeight = await this.bPool.getNormalizedWeight(token.address);
      token.normWeightPercentage = Number(fromWei(token.normWeight.mul(100)));
    }
  }

  // async hydratePoolUserTokenShares(tokens: Array<IPoolTokenInfo>): Promise<void> {
  //   for (const token of tokens) {
  //     // (user's BPRIME share %) * (the pool's balance of the given token)
  //     // note you need to have called getLiquidityAmounts prior
  //     token.userShareInPool = BigNumber.from(toBigNumberJs(token.balanceInPool).times(this.poolUsersBPrimeShare).integerValue().toString());
  //     // token.balanceInPool.mul(token.price / this.totalLiquidity);
  //   }
  // }
}
