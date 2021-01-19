import { autoinject } from "aurelia-framework";
import { BigNumber, Contract, ethers } from "ethers";
import axios from "axios";
import { ContractNames, ContractsService } from "services/ContractsService";
import { Address, EthereumService, Networks } from "services/EthereumService";
import { ConsoleLogService } from "services/ConsoleLogService";
import { EventConfigFailure } from "services/GeneralEvents";

export interface IErc20Token {
  allowance(owner: Address, spender: Address): Promise<BigNumber>;
  approve(spender: Address, amount: BigNumber): Promise<boolean>;
  balanceOf(account: Address): Promise<BigNumber>;
  name(): Promise<string>;
  totalSupply(): Promise<BigNumber>;
  transfer(recipient: Address, amount: BigNumber): Promise<boolean>;
  transferFrom(sender: Address, recipient: Address, amount: BigNumber): Promise<boolean>;
}

export interface ITokenInfo {
  address: string;             // token address,
  totalSupply: string;         // total token supply,
  name: string;                // token name,
  symbol: string;              // token symbol,
  decimals: string;            // number of significant digits,
  price: {                   // token price(false, if not available)
    rate: number;            // current rate
    currency: string;        // token price currency(USD)
    diff: number;            // 24 hours rate difference(in percent)
    diff7d: number;          // 7 days rate difference(in percent)
    diff30d: number;         // 30 days rate difference(in percent)
    marketCapUsd: number;    // market cap(USD)
    availableSupply: number; // available supply
    volume24h: number;       // 24 hours volume
    ts: number;              // last rate update timestamp
  },
  owner: number;               // token owner address,
  countOps: number;            // total count of token operations
  totalIn: number;             // total amount of incoming tokens
  totalOut: number;            // total amount of outgoing tokens
  transfersCount: number;      // total number of token operations
  ethTransfersCount: number;   // total number of ethereum operations, optional
  holdersCount: number;        // total numnber of token holders
  issuancesCount: number;      // total count of token issuances
  image: string;               // token image url, optional
  description: string;         // token description, optional
  website: string;             // token website url, optional
  lastUpdated: number;         // last update timestamp
}

@autoinject
export class TokenService {

  erc20Abi: any;
  tokenInfos = new Map<Address, ITokenInfo>();

  constructor(
    private ethereumService: EthereumService,
    private consoleLogService: ConsoleLogService,
    contractsService: ContractsService) {
    this.erc20Abi = contractsService.getContractAbi(ContractNames.IERC20);
  }

  // private async _getBalance(
  //   token: IErc20Token,
  //   accountAddress: Address,
  //   inEth = false): Promise<BigNumber> {

  //   let amount = await token.balanceOf(accountAddress);
  //   if (inEth) {
  //     amount = BigNumber.from(formatEther(amount));
  //   }
  //   return amount;
  // }

  // public async getUserBalance(
  //   tokenName: ContractNames,
  //   inEth = false): Promise<BigNumber> {

  //   const userAddress = this.ethereumService.defaultAccountAddress;

  //   return this.getTokenBalance(tokenName, userAddress, inEth);
  // }

  // public async getTokenBalance(
  //   tokenName: ContractNames,
  //   accountAddress: Address,
  //   inEth = false): Promise<BigNumber> {

  //   const token = await this.getTokenContract(tokenName);

  //   if (!token) {
  //     return null;
  //   }

  //   return this._getBalance(token, accountAddress, inEth);
  // }

  public async getTokenInfo(address: Address): Promise<ITokenInfo> {

    let tokenInfo = this.tokenInfos.get(address);

    if (!tokenInfo) {
    const uri = `https://${this.ethereumService.targetedNetwork === Networks.Kovan ? "kovan-" : ""}api.ethplorer.io/getTokenInfo/${address}?apiKey=${process.env.ETHPLORER_KEY}`;
    return axios.get(uri)
      .then((response) => {
        tokenInfo = response.data;
        this.tokenInfos.set(address, tokenInfo);
        return tokenInfo;
      })
      .catch((error) => {
        this.consoleLogService.handleFailure(
          new EventConfigFailure(`TokenService: Error fetching token info: ${error?.response?.data?.error?.message ?? error?.message}`));
        // throw new Error(`${error.response?.data?.error.message ?? "Error fetching token info"}`);
        // TODO:  restore the exception?
        tokenInfo = { name: "N/A", symbol: "N/A" } as unknown as ITokenInfo;
        this.tokenInfos.set(address, tokenInfo);
        return tokenInfo;
      });
    }
    else {
      return tokenInfo;
    }
  }

  public getTokenContract(tokenAddress: Address): Contract & IErc20Token {
    return new ethers.Contract(
      tokenAddress,
      this.erc20Abi,
      this.ethereumService.readOnlyProvider) as unknown as Contract & IErc20Token;
  }
}
