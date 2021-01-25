import { autoinject } from "aurelia-framework";
import axios from "axios";
import { EventAggregator } from "aurelia-event-aggregator";
import { EventConfigException } from "services/GeneralEvents";
import { IErc20Token } from "services/TokenService";
import { BigNumber } from "ethers";
import { Container } from "aurelia-dependency-injection";
import { Address, EthereumService } from "services/EthereumService";
import { Pool } from "../entities/pool";

interface IPoolConfigInternal {
  /**
   * one address for each chain
   */
  addresses: Array<{ [network: string]: string }>;
  description: string;
  icon: string;
  name: string;
}

export interface IPoolConfig {
  address: Address;
  description: string;
  icon: string;
  name: string;
}

@autoinject
export class PoolService {

  private poolConfigs: Map<Address, Pool>;
  
  constructor(
    private ethereumService: EthereumService,
    private eventAggregator: EventAggregator,
    private container: Container,
  ) {
  }

  public async getPoolConfigs(): Promise<Map<Address, Pool>> {
    if (!this.poolConfigs?.size) {
      await axios.get("https://raw.githubusercontent.com/PrimeDAO/prime-pool-dapp/master/src/poolConfigurations/pools.json")
        .then(async (response) => {
          const poolConfigs = new Map();
          for (const config of response.data as Array<IPoolConfigInternal>) {
            const pool = await this.createPoolFromConfig(config);
            poolConfigs.set(pool.address, pool);
          }
          this.poolConfigs = poolConfigs;
        })
        .catch((error) => {
          this.poolConfigs = new Map();
          this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an error occurred", error));
        });
    }

    return this.poolConfigs;
  }

  async createPoolFromConfig(config: IPoolConfigInternal): Promise<Pool> {
    const poolConfig = {
      address: config.addresses[this.ethereumService.targetedNetwork],
      description: config.description,
      icon: config.icon,
      name: config.name,
    };
    const pool = this.container.get(Pool);
    return pool.initialize(poolConfig);
  }

  public getPoolFromAddress(address: Address): Pool {
    return this.poolConfigs.get(address);
  }

}
