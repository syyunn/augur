import { Provider, Log, ParsedLog } from '..';
import { abi } from '@augurproject/artifacts';
import { Abi } from 'ethereum';

export class ContractEvents {
  private readonly eventNameToContractName = {
    'TransferSingle': 'ShareToken',
    'TransferBatch': 'ShareToken',
    'OrderEvent': 'AugurTrading',
    'ProfitLossChanged': 'AugurTrading',
    'MarketVolumeChanged': 'AugurTrading',
    'Cancel': 'Exchange',
  };

  private readonly contractAddressToName = {};

  constructor(
    private readonly provider: Provider,
    private readonly augurAddress: string,
    private readonly augurTradingAddress: string,
    private readonly shareTokenAddress: string,
    private readonly zeroXExchangeAddress: string,
    ) {
    this.provider.storeAbiData(abi.Augur as Abi, 'Augur');
    this.provider.storeAbiData(abi.AugurTrading as Abi, 'AugurTrading');
    this.provider.storeAbiData(abi.ShareToken as Abi, 'ShareToken');
    this.provider.storeAbiData(abi.Exchange as Abi, 'Exchange');
    this.augurAddress = this.augurAddress.toLowerCase();
    this.augurTradingAddress = this.augurTradingAddress.toLowerCase();
    this.shareTokenAddress = this.shareTokenAddress.toLowerCase();
    this.zeroXExchangeAddress = this.zeroXExchangeAddress.toLowerCase();
    this.contractAddressToName[this.augurAddress] = 'Augur';
    this.contractAddressToName[this.augurTradingAddress] = 'AugurTrading';
    this.contractAddressToName[this.shareTokenAddress] = 'ShareToken';
    this.contractAddressToName[this.zeroXExchangeAddress] = 'Exchange';
  }

  getEventContractName = (eventName: string) => {
    const contractName = this.eventNameToContractName[eventName];
    return contractName || 'Augur';
  };

  getAugurContractAddresses = () => {
    return [
      this.augurAddress,
      this.shareTokenAddress,
      this.augurTradingAddress,
      this.zeroXExchangeAddress
    ];
  }

  getEventContractAddress = (eventName: string) => {
    const contractName = this.getEventContractName(eventName);
    if (contractName === 'ShareToken') return this.shareTokenAddress;
    if (contractName === 'AugurTrading') return this.augurTradingAddress;
    if (contractName === 'Exchange') return this.zeroXExchangeAddress;
    return this.augurAddress;
  };

  getEventTopics = (eventName: string) => {
    return [this.provider.getEventTopic(this.getEventContractName(eventName), eventName)];
  };

  parseLogs = (logs: Log[]): ParsedLog[] => {
    return logs.map((log) => {
      const contractName: string|undefined = this.contractAddressToName[log.address];
      if (typeof contractName === 'undefined') {
        console.error('Could not find contract name for log, check ABI', log);
        throw new Error(`Recieved a log for an unknown contract at address ${log.address}. Double check that deployment is up to date and new ABIs have been committed.`);
      }

      const logValues = this.provider.parseLogValues(contractName, log);
      return Object.assign(
        { name: '' },
        logValues,
        {
          address: log.address,
          blockNumber: log.blockNumber,
          blockHash: log.blockHash,
          transactionIndex: log.transactionIndex,
          removed: log.removed,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
          topics: log.topics,
        }
      );
    });
  }
}
