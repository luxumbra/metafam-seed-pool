import { autoinject, singleton, computedFrom } from "aurelia-framework";
import { ContractNames } from "services/ContractsService";
import { ContractsService } from "services/ContractsService";
import "./tx-history.scss";
import { EventAggregator } from "aurelia-event-aggregator";
import TransactionsService from "services/TransactionsService";
import { Address, EthereumService, fromWei } from "services/EthereumService";
import { BigNumber } from "ethers";
import { EventConfigException, EventConfigFailure } from "services/GeneralEvents";
import { PriceService } from "services/PriceService";
import { Router } from "aurelia-router";
import { toBigNumberJs } from "services/BigNumberService";
import { NumberService } from "services/numberService";

@singleton(false)
@autoinject
export class TxHistory {
  constructor(
    private eventAggregator: EventAggregator,
    private contractsService: ContractsService,
    private ethereumService: EthereumService,
    private transactionsService: TransactionsService,
    private priceService: PriceService,
    private numberService: NumberService,
    private router: Router) {
  }
}
