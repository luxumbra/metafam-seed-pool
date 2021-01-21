import { autoinject, singleton } from "aurelia-framework";
import "./pools.scss";
import axios from "axios";
import { EventConfigException } from "services/GeneralEvents";
import { EventAggregator } from "aurelia-event-aggregator";

interface IPoolConfig {
  name: string;
  description: string;
  addresses: Array<{ [network: string]: string}>;
  icon: string;
}

@singleton(false)
@autoinject
export class Pools {
  constructor(private eventAggregator: EventAggregator) {
    
  }

  activate() {
    if (!this.pools?.length) {
      axios.get("https://raw.githubusercontent.com/PrimeDAO/prime-pool-dapp/master/src/poolConfigurations/pools.json")
        .then((response) => {
          this.pools = response.data;
        })
        .catch((error) => {
          this.pools = [];
          this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an error occurred", error));
        });
    }
  }
  pools: Array<IPoolConfig>;
}
