import { autoinject, singleton, computedFrom } from "aurelia-framework";
import { ContractNames, IStandardEvent } from "services/ContractsService";
import { ContractsService } from "services/ContractsService";
import "./tx-history.scss";
import { EventAggregator } from "aurelia-event-aggregator";
import TransactionsService from "services/TransactionsService";
import { Address, EthereumService, fromWei, Hash, Networks } from "services/EthereumService";
import { BigNumber } from "ethers";
import { SortService } from "services/SortService";
import { TokenService } from "services/TokenService";
import { EventConfigException } from "services/GeneralEvents";

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
  poolTokenName: string;
  loading = false;

  @computedFrom("ethereumService.defaultAccountAddress")
  get connected(): boolean {
    return !!this.ethereumService.defaultAccountAddress;
  }

  constructor(
    private eventAggregator: EventAggregator,
    private contractsService: ContractsService,
    private ethereumService: EthereumService,
    private transactionsService: TransactionsService,
    private tokenService: TokenService) {

    this.startingBlockNumber = this.ethereumService.targetedNetwork === Networks.Kovan ? 22056846 : 11270397;
  }

  async loadContracts(): Promise<void> {
    this.crPool = await this.contractsService.getContractFor(ContractNames.ConfigurableRightsPool);
  }

  async attached(): Promise<void> {

    this.eventAggregator.subscribe("Network.Changed.Account", async () => {
      await this.loadContracts();
      this.getData(true);
    });

    await this.loadContracts();
    this.poolTokenName = (await this.tokenService.getTokenInfo(this.contractsService.getContractAddress(ContractNames.ConfigurableRightsPool))).symbol;

    return this.getData();
  }

  reload() {
    this.getData(true);
  }

  async getData(reload = false): Promise<void> {

    if (!this.connected) {
      this.transactions = undefined;
      return;
    }

    if (reload || !this.transactions) {
      this.loading = true;

      try {
        const crPoolAddress = this.contractsService.getContractAddress(ContractNames.ConfigurableRightsPool);
        
        const filterJoin = this.crPool.filters.LogJoin(this.ethereumService.defaultAccountAddress);
        const txJoinEvents: Array<IStandardEvent> = await this.crPool.queryFilter(filterJoin, this.startingBlockNumber);
        
        const filterExit = this.crPool.filters.LogExit(this.ethereumService.defaultAccountAddress);
        const txExitEvents: Array<IStandardEvent> = await this.crPool.queryFilter(filterExit, this.startingBlockNumber);

        const filterTransferJoin = this.crPool.filters.Transfer(crPoolAddress, this.ethereumService.defaultAccountAddress);
        const txJoinBpoolTransferEvents: Array<IStandardEvent> = await this.crPool.queryFilter(filterTransferJoin, this.startingBlockNumber);
        
        const filterTransferExit = this.crPool.filters.Transfer(this.ethereumService.defaultAccountAddress, crPoolAddress);
        const txExitBpoolTransferEvents: Array<IStandardEvent> = await this.crPool.queryFilter(filterTransferExit, this.startingBlockNumber);
        
        const getAssetTransfers = async (isJoin: boolean, joinExitEvents: Array<IStandardEvent>): Promise<Array<IAssetTokenTxInfo>> => {
          const transfers = new Array<IAssetTokenTxInfo>();
          joinExitEvents.forEach(async (event) => {
            const tokenName = (await this.tokenService.getTokenInfo(event.args[isJoin ? "tokenIn" : "tokenOut"])).symbol;
            transfers.push({ name: tokenName, amount: event.args[isJoin ? "tokenAmountIn" : "tokenAmountOut"] }); 
          });
          return transfers;
        };

        const getBpoolTransfers = (transferEvents: Array<IStandardEvent>, txHash: Hash): Array<IAssetTokenTxInfo> =>
          transferEvents
            .filter((event: IStandardEvent) => event.transactionHash === txHash)
            .map((event: IStandardEvent) => { return { name: this.poolTokenName, amount: event.args.value }; });
        ;

        const newTx = async (isJoin: boolean, txHash, joinExitEvents: Array<IStandardEvent>, poolName: string) => {
          let assetsIn: Array<IAssetTokenTxInfo>;
          let assetsOut: Array<IAssetTokenTxInfo>;
          let blockDate = new Date((await joinExitEvents[0].getBlock()).timestamp * 1000);
          
          if (isJoin) {
            assetsIn = await getAssetTransfers(true, joinExitEvents);
            assetsOut = getBpoolTransfers(txJoinBpoolTransferEvents, txHash);
          } else {
            assetsOut = await getAssetTransfers(false, joinExitEvents);
            assetsIn = getBpoolTransfers(txExitBpoolTransferEvents, txHash);
          }
          
          return {
            date: blockDate,
            actionDescription: isJoin ? "Buy Pool Shares" : "Sell Pool Shares",
            assetsIn: assetsIn,
            assetsOut: assetsOut,
            etherscanUrl: this.transactionsService.getEtherscanLink(txHash),
            hash: txHash,
            poolName,
          };
        };

        const joins = this.groupBy(txJoinEvents, txJoinEvent => txJoinEvent.transactionHash);
        const exits = this.groupBy(txExitEvents, txExitEvent => txExitEvent.transactionHash);
        const transactions = new Array<ITransaction>();

        for (let [txHash, events] of Array.from(joins)) {
          transactions.push(await newTx(true, txHash, events, "PRIME Pool"));
        }

        for (let [txHash, events] of Array.from(exits)) {
          transactions.push(await newTx(false, txHash, events, "PRIME Pool"));
        }

        this.transactions = transactions.sort((a: ITransaction, b: ITransaction) =>
          SortService.evaluateDateTime(a.date.toISOString(), b.date.toISOString()));

      } catch(ex) {
        this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an error occurred", ex));
      }
      finally {
        this.loading = false;
      }
    }
  }

  connect(): void {
    this.ethereumService.ensureConnected();
  }

  /**
   * @description
   * 
   * From here:  https://stackoverflow.com/a/38327540/4685575
   * 
   * Takes an Array<V>, and a grouping function,
   * and returns a Map of the array grouped by the grouping function.
   *
   * @param list An array of type V.
   * @param keyGetter A Function that takes the the Array type V as an input, and returns a value of type K.
   *                  K is generally intended to be a property key of V.
   *
   * @returns Map of the array grouped by the grouping function.
   */
  groupBy<K, V>(list: Array<V>, keyGetter: (input: V) => K): Map<K, Array<V>> {
    const map = new Map<K, Array<V>>();
    list.forEach((item) => {
      const key = keyGetter(item);
      const collection = map.get(key);
      if (!collection) {
        map.set(key, [item]);
      } else {
        collection.push(item);
      }
    });
    return map;
  }
}
