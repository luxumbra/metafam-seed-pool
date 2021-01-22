import { autoinject, singleton } from "aurelia-framework";
import "./pools.scss";
import { IPoolConfig, PoolService } from "services/PoolService";

@singleton(false)
@autoinject
export class Pools {

  poolButtonColors = [
    "#95D86E",
    "#5BCAA9",
    "#64B0C8",
    "#8668FC",
    "#298CDD",
    "#39A1D8",
    "#AE5CFF",
    "#BF62A8",
    "#9A14D5",
    "#B14FD8",
  ];

  poolButtonColor(index: number): string {
    return this.poolButtonColors[index % this.poolButtonColors.length];
  }

  constructor(private poolService: PoolService) {
    
  }

  async activate() {
    if (!this.pools?.length) {
      this.pools = await this.poolService.getPoolConfigs();
    }
  }

  pools: Array<IPoolConfig>;
}
