import { autoinject, singleton } from "aurelia-framework";
import "./pools.scss";
import { IPoolConfig, PoolService } from "services/PoolService";
import { Pool } from "entities/pool";

@singleton(false)
@autoinject
export class Pools {

  poolButtonColors = [
    "#298cdd",
    "#8668fc",
    "#ae5cff",
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

  constructor(private poolService: PoolService) {
    
  }

  async activate() {
    if (!this.pools?.length) {
      this.pools = Array.from((await this.poolService.getPoolConfigs()).values());
    }
  }

  pools: Array<Pool>;
}
