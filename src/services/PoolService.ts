import { autoinject } from "aurelia-framework";
import axios from "axios";
import { EventAggregator } from "aurelia-event-aggregator";
import { EventConfigException } from "services/GeneralEvents";
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

  public poolConfigs: Map<Address, Pool>;
  public get poolConfigsArray(): Array<Pool> { return Array.from(this.poolConfigs.values()); };
  public initializing = true;
  initializedPromise: Promise<void>;
  
  constructor(
    private ethereumService: EthereumService,
    private eventAggregator: EventAggregator,
    private container: Container,
  ) {
  }

  public async initialize(): Promise<void> {
    return this.initializedPromise = new Promise(
      async (resolve: (value: void | PromiseLike<void>) => void,
      reject: (reason?: any) => void): Promise<void> => {
    if (!this.poolConfigs?.size) {
      await axios.get("https://raw.githubusercontent.com/PrimeDAO/prime-pool-dapp/master/src/poolConfigurations/pools.json")
        .then(async (response) => {
          const poolConfigs = new Map();
          for (const config of response.data as Array<IPoolConfigInternal>) {
            const pool = await this.createPoolFromConfig(config);
            poolConfigs.set(pool.address, pool);
          }
          this.poolConfigs = poolConfigs;
          this.initializing = false;
          return resolve();
        })
        .catch((error) => {
          this.poolConfigs = new Map();
          this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an error occurred", error));
          this.initializing = false;
          return reject();
        });
      }
    });
  }

  createPoolFromConfig(config: IPoolConfigInternal): Promise<Pool> {
    const poolConfig = {
      address: config.addresses[this.ethereumService.targetedNetwork],
      description: config.description,
      icon: config.icon,
      name: config.name,
    };
    const pool = this.container.get(Pool);
    return pool.initialize(poolConfig);
  }

  public ensureInitialized(): Promise<void> {
    return this.initializedPromise;
  }
}
