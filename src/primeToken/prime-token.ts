import { EventAggregator } from "aurelia-event-aggregator";
import { autoinject, singleton } from "aurelia-framework";
import { Pool } from "entities/pool";
import { BigNumber } from "ethers";
import { toBigNumberJs } from "services/BigNumberService";
import { ContractNames, ContractsService } from "services/ContractsService";
import { EventConfigException } from "services/GeneralEvents";
import { NumberService } from "services/NumberService";
import { PoolService } from "services/PoolService";
import { ITokenInfo, TokenService } from "services/TokenService";
import { Utils } from "services/utils";
import "./prime-token.scss";

@singleton(false)
@autoinject
export class PrimeToken {

  tokenInfo: ITokenInfo;
  token: any;
  totalSupply: BigNumber;
  totalStaked: BigNumber;
  percentStaked: number;
  pool: Pool;

  constructor(
    private tokenService: TokenService,
    private contractService: ContractsService,
    private numberService: NumberService,
    private poolService: PoolService,
    private eventAggregator: EventAggregator,
    ) {
  }

  async attached(): Promise<void> {
    try {
      if (this.poolService.initializing) {
        await Utils.sleep(100);
        this.eventAggregator.publish("dashboard.loading", true);
        await this.poolService.ensureInitialized();
      }
      this.pool = this.poolService.poolConfigs.get(this.contractService.getContractAddress(ContractNames.ConfigurableRightsPool));
      const primeTokenAddress = this.contractService.getContractAddress(ContractNames.PRIMETOKEN);
      this.tokenInfo = await this.tokenService.getTokenInfoFromAddress(primeTokenAddress);
      this.token = this.tokenService.getTokenContract(primeTokenAddress);
      this.totalSupply = await this.token.totalSupply();
      this.totalStaked = await this.pool.assetTokens.get(primeTokenAddress).balanceInPool;
      this.percentStaked = this.numberService.fromString(toBigNumberJs(this.totalStaked).div(toBigNumberJs(this.totalSupply)).times(100).toString());
    } catch (ex) {
      this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an error occurred", ex));
    }
    finally {
      this.eventAggregator.publish("dashboard.loading", false);
    }
  }

  get showMMButton() {
    return !!window.ethereum;
  }

  async addToMetamask() {
    /**
     * from: https://github.com/ethereum/EIPs/blob/master/EIPS/eip-747.md
     */
    try {
      // wasAdded is a boolean. Like any RPC method, an error may be thrown.
      const wasAdded = await window.ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20', // Initially only supports ERC20, but eventually more!
          options: {
            address: this.tokenInfo.address, // The address that the token is at.
            symbol: this.tokenInfo.symbol, // A ticker symbol or shorthand, up to 5 chars.
            decimals: 18, // The number of decimals in the token
            image: this.tokenInfo.icon, // A string url of the token logo
          },
        },
      });

    } catch (error) {
      this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an unexpected error occurred", error));
    }
  }
}
