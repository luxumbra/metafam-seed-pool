import { EventAggregator } from "aurelia-event-aggregator";
import { autoinject, singleton } from "aurelia-framework";
import { Pool } from "entities/pool";
import { BigNumber } from "ethers";
import { toBigNumberJs } from "services/BigNumberService";
import { ContractNames, ContractsService } from "services/ContractsService";
import { EventConfigException } from "services/GeneralEvents";
import { NumberService } from "services/numberService";
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
      this.pool = this.poolService.getPoolFromAddress(this.contractService.getContractAddress(ContractNames.ConfigurableRightsPool));
      const tokenAddress = this.contractService.getContractAddress(ContractNames.PRIMETOKEN);
      this.tokenInfo = await this.tokenService.getTokenInfoFromAddress(tokenAddress);
      this.token = this.tokenService.getTokenContract(tokenAddress);
      this.totalSupply = await this.token.totalSupply();
      const stakingRewards = await this.contractService.getContractFor(ContractNames.STAKINGREWARDS);
      this.totalStaked = await stakingRewards.totalSupply();
      this.percentStaked = this.numberService.fromString(toBigNumberJs(this.totalStaked).div(toBigNumberJs(this.totalSupply)).times(100).toString());
    } catch (ex) {
      this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an error occurred", ex));
    }
    finally {
      this.eventAggregator.publish("dashboard.loading", false);
    }
  }
}
