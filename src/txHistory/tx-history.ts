import { autoinject, singleton, computedFrom } from "aurelia-framework";
import { ContractNames, IStandardEvent } from "services/ContractsService";
import { ContractsService } from "services/ContractsService";
import "./tx-history.scss";
import { EventAggregator } from "aurelia-event-aggregator";
import TransactionsService from "services/TransactionsService";
import { Address, EthereumService, fromWei, Hash, Networks } from "services/EthereumService";
import { BigNumber } from "ethers";
import { SortService } from "services/SortService";

interface IAssetTokenTxInfo {
  amount: BigNumber;
  name: string;
}

interface IJoinEventArgs {
  caller: Address;
  tokenIn: BigNumber;
  tokenAmountIn: BigNumber;
}

interface IExitEventArgs {
  caller: Address;
  tokenOut: BigNumber;
  tokenAmountOut: BigNumber;
}

interface ITransferEventArgs {
  from: Address;
  to: Address;
  value: BigNumber;
}

interface ITransaction {
  date: Date;
  actionDescription: string;
  assetsIn: Array<IAssetTokenTxInfo>;
  assetsOut: Array<IAssetTokenTxInfo>;
  hash: Hash;
  etherscanUrl: string;
  poolName: string;
}

@singleton(false)
@autoinject
export class TxHistory {

  startingBlockNumber: number;
  transactions: Array<ITransaction>;
  crPool: any;
  loading = false;

  @computedFrom("ethereumService.defaultAccountAddress")
  get connected(): boolean {
    return !!this.ethereumService.defaultAccountAddress;
  }

  constructor(
    private eventAggregator: EventAggregator,
    private contractsService: ContractsService,
    private ethereumService: EthereumService,
    private transactionsService: TransactionsService) {

    this.startingBlockNumber = this.ethereumService.targetedNetwork === Networks.Kovan ? 22056846 : 11270397;
  }

  async loadContracts(): Promise<void> {
    this.crPool = await this.contractsService.getContractFor(ContractNames.ConfigurableRightsPool);
  }

  async attached(): Promise<void> {

    this.eventAggregator.subscribe("Network.Changed.Account", async () => {
      await this.loadContracts();
      this.getData();
    });

    await this.loadContracts();
    return this.getData();
  }

  reload() {
    this.getData(true);
  }
  
  async getData(reload = false): Promise<void> {

    if (reload || !this.transactions) {
      this.loading = true;

      try {
        const crPoolAddress = this.contractsService.getContractAddress(ContractNames.ConfigurableRightsPool);
        const filterJoin = this.crPool.filters.LogJoin(this.ethereumService.defaultAccountAddress);
        const txJoinEvents: Array<IStandardEvent> = await this.crPool.queryFilter(filterJoin, this.startingBlockNumber);
        const filterExit = this.crPool.filters.LogExit(this.ethereumService.defaultAccountAddress);
        const txExitEvents: Array<IStandardEvent> = await this.crPool.queryFilter(filterExit, this.startingBlockNumber);
        const filterTransferJoin = this.crPool.filters.Transfer(crPoolAddress, this.ethereumService.defaultAccountAddress);
        const txTransferJoinEvents: Array<IStandardEvent> = await this.crPool.queryFilter(filterTransferJoin, this.startingBlockNumber);
        const filterTransferExit = this.crPool.filters.Transfer(this.ethereumService.defaultAccountAddress, crPoolAddress);
        const txTransferExitEvents: Array<IStandardEvent> = await this.crPool.queryFilter(filterTransferExit, this.startingBlockNumber);

        const joins = new Array<ITransaction>();
        
        for (const event of txJoinEvents) {
          const eventArgs: IJoinEventArgs = event.args;
          joins.push({
            // date: (await this.ethereumService.getBlock(event.blockNumber)).blockDate,
            date: new Date((await event.getBlock()).timestamp * 1000),
            actionDescription: "Buy Pool Shares",
            assetsIn: new Array<IAssetTokenTxInfo>(),
            assetsOut: new Array<IAssetTokenTxInfo>(),
            etherscanUrl: this.transactionsService.getEtherscanLink(event.transactionHash),
            hash: event.transactionHash,
            poolName: "PRIME Pool",
          });
        }

        const exits = new Array<ITransaction>();

        for (const event of txExitEvents) {
          const eventArgs: IExitEventArgs = event.args;
          joins.push({
            date: (await this.ethereumService.getBlock(event.blockNumber)).blockDate,
            actionDescription: "Sell Pool Shares",
            assetsIn: new Array<IAssetTokenTxInfo>(),
            assetsOut: new Array<IAssetTokenTxInfo>(),
            etherscanUrl: this.transactionsService.getEtherscanLink(event.transactionHash),
            hash: event.transactionHash,
            poolName: "PRIME Pool",
          });
        }

        this.transactions = joins.concat(exits).sort((a: ITransaction, b: ITransaction) =>
          SortService.evaluateDateTime(a.date.toISOString(), b.date.toISOString()));

      } catch(ex) {

      }
      finally {
        this.loading = false;
      }
    }
  }

  connect(): void {
    this.ethereumService.ensureConnected();
  }
}
