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

// export interface IPool extends IPoolConfig {
//   crPool: any;
//   bPool: any;
//   assetTokens: Array<IErc20Token>;
//   poolToken: IErc20Token;
// }

export interface IPoolTokenInfo extends ITokenInfo {
  tokenContract: IErc20Token;
  price: number;
  balanceInPool: BigNumber;
}

@autoinject
export class Pool implements IPoolConfig {
  crPool: any;
  bPool: any;
  assetTokens: IPoolTokenInfo[];
  poolToken: IPoolTokenInfo;
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
    
    const assetTokenAddresses = await this.bPool.getCurrentTokens(); // getFinalTokens();
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

    this.hydrateTotalLiquidity(assetTokens);
    
    this.assetTokens = assetTokens;

    return this;
  }

  hydrateTokenPrices(tokens: Array<IPoolTokenInfo>): Promise<void> {
    const uri = `https://api.coingecko.com/api/v3/simple/price?ids=${tokens.reduce((accumulator, currentValue) => `${accumulator}%2C${currentValue.id}`, "")
      }&vs_currencies=USD%2CUSD`;
  
    return axios.get(uri)
      .then((response) => {
        for (const token of tokens) {
          token.price = response.data[token.id]?.usd ?? 0;
        }
      })
      .catch((error) => {
        this.consoleLogService.handleFailure(
          new EventConfigFailure(`PriceService: Error fetching token price ${error?.message}`));
      });
  }

  async hydratePoolTokenBalances(tokens: Array<IPoolTokenInfo>): Promise<void> {
    for (const token of tokens) {
      token.balanceInPool = await this.bPool.getBalance(token.address);
    }
  }

  totalLiquidity: number;

  public hydrateTotalLiquidity(tokens: Array<IPoolTokenInfo>): void {
    this.totalLiquidity = tokens.reduce((accumulator, currentValue) => 
      accumulator + this.numberService.fromString(fromWei(currentValue.balanceInPool)) * currentValue.price, 0)
  }
}
