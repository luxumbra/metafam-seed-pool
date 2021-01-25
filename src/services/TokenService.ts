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

export interface ITokenPrices {
  // key is "weth" or "primedao"
  [key: string]: number;
}

export interface ITokenInfo {
  address: Address;
  id: string;     // id on coingecko
  name: string;   // token name,
  symbol: string; // token symbol,
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

  public async getTokenInfoFromAddress(address: Address): Promise<ITokenInfo> {

    let tokenInfo = this.tokenInfos.get(address);

    if (!tokenInfo) {
      const uri = `https://${this.ethereumService.targetedNetwork === Networks.Kovan ? "kovan-" : ""}api.ethplorer.io/getTokenInfo/${address}?apiKey=${process.env.ETHPLORER_KEY}`;
      return axios.get(uri)
        .then(async (response) => {
          tokenInfo = response.data;
          tokenInfo.id = await this.getTokenGeckoId(tokenInfo.name, tokenInfo.symbol);
          tokenInfo.address = address;
          this.tokenInfos.set(address, tokenInfo);
          return tokenInfo;
        })
        .catch((error) => {
          this.consoleLogService.handleFailure(
            new EventConfigFailure(`TokenService: Error fetching token info: ${error?.response?.data?.error?.message ?? error?.message}`));
          // throw new Error(`${error.response?.data?.error.message ?? "Error fetching token info"}`);
          // TODO:  restore the exception?
          tokenInfo = { address, name: "N/A", symbol: "N/A", id: null } as unknown as ITokenInfo;
          this.tokenInfos.set(address, tokenInfo);
          return tokenInfo;
        });
    }
    else {
      return tokenInfo;
    }
  }

  geckoCoinInfo: Map<string,string>;

  getTokenGeckoMapKey(name: string, symbol: string): string {
    // PRIMEDao Token HACK!!!
    if (name.toLowerCase() === "primedao token") { name = "primedao"; };
    return `${name.toLowerCase()}_${symbol.toLowerCase()}`;
  }

  async getTokenGeckoId(name: string, symbol: string): Promise<string> {
    if (!this.geckoCoinInfo) {
      const uri = "https://api.coingecko.com/api/v3/coins/list";

      await axios.get(uri)
        .then((response) => {
          this.geckoCoinInfo = new Map<string,string>();

          response.data.map((tokenInfo: ITokenInfo) => 
            this.geckoCoinInfo.set(this.getTokenGeckoMapKey(tokenInfo.name, tokenInfo.symbol), tokenInfo.id));
        })
        .catch((error) => {
          this.consoleLogService.handleFailure(
            new EventConfigFailure(`TokenService: Error fetching token info: ${error?.response?.data?.error?.message ?? error?.message}`));
        });
    }

    if (this.geckoCoinInfo) {
      const id = this.geckoCoinInfo.get(this.getTokenGeckoMapKey(name, symbol));
      if (id) {
        return id;
      } else {
        this.consoleLogService.handleFailure(
          new EventConfigFailure(`TokenService: Error fetching token info: token not found, or more than one match found (${name}/${symbol})`));
      }
    }
    return "";
}

  public getTokenContract(tokenAddress: Address): Contract & IErc20Token {
    return new ethers.Contract(
      tokenAddress,
      this.erc20Abi,
      this.ethereumService.readOnlyProvider) as unknown as Contract & IErc20Token;
  }
}
