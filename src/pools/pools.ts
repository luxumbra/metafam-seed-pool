import { autoinject, singleton } from "aurelia-framework";
import "./pools.scss";
import { PoolService } from "services/PoolService";
import { Pool } from "entities/pool";
import { EventAggregator } from "aurelia-event-aggregator";
import { EventConfigException } from "services/GeneralEvents";
import { Router } from "aurelia-router";
import { Utils } from "services/utils";

@singleton(false)
@autoinject
export class Pools {

  poolButtonColors = [
    "$color-bluegreen",
    "$color-light-purple",
    "$color-darkpink",
    "#5bcaa9",
    "#b14fd8",
    "#64b0c8",
    "#bf62a8",
    "#39a1d8",
    "#9a14d5",
    "#95d86e",
  ];

  poolButtonColor(index: number): string {
    return this.poolButtonColors[index % this.poolButtonColors.length];
  }

  pools: Array<Pool>;

  constructor(
    private poolService: PoolService,
    private eventAggregator: EventAggregator,
    private router: Router,
    ) {
    
  }

  async attached() {
    if (!this.pools?.length) {
      try {
        if (this.poolService.initializing) {
          await Utils.sleep(100);
          this.eventAggregator.publish("dashboard.loading", true);
          await this.poolService.ensureInitialized();
        }
        this.pools = this.poolService.poolConfigsArray;
      } catch (ex) {
        this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an error occurred", ex));
      }
      finally {
        this.eventAggregator.publish("dashboard.loading", false);
      }
    }
  }

  gotoPool(pool: Pool) {
    this.router.navigate(`pool/${pool.address}`);
  }
}
