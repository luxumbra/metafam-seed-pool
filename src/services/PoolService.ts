import { autoinject } from "aurelia-framework";
import axios from "axios";
import { EventAggregator } from "aurelia-event-aggregator";
import { EventConfigException } from "services/GeneralEvents";

export interface IPoolConfig {
  name: string;
  description: string;
  addresses: Array<{ [network: string]: string }>;
  icon: string;
}

@autoinject
export class PoolService {

  private poolConfigs: Array<IPoolConfig>;
  
  constructor(
    private eventAggregator: EventAggregator,
  ) {
  }

  public async getPoolConfigs(): Promise<Array<IPoolConfig>> {
    if (!this.poolConfigs?.length) {
      await axios.get("https://raw.githubusercontent.com/PrimeDAO/prime-pool-dapp/master/src/poolConfigurations/pools.json")
        .then((response) => {
          this.poolConfigs = response.data;
        })
        .catch((error) => {
          this.poolConfigs = [];
          this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an error occurred", error));
        });
    }

    return this.poolConfigs;
  }
}
