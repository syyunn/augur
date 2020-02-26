export const abi = require('./abi.json');
export const abiV1 = require('./abi.v1.json');
export const Contracts = require('./contracts.json');
export * from './templates';
export { ContractEvents } from './events';

import { exists, readFile, writeFile, readdir } from 'async-file';
import path from 'path';
import requireAll from 'require-all';

export interface SDKConfiguration {
  networkId: NetworkId,
  ethereum?: {
    http?: string,
    rpcRetryCount: number,
    rpcRetryInterval: number,
    rpcConcurrency: number
  },
  sdk?: {
    enabled: boolean,
    ws: string,
  },
  gnosis?: {
    enabled: boolean,
    http: string,
    relayerAddress?: string,
  },
  zeroX?: {
    rpc?: {
      enabled: boolean,
      ws: string
    },
    mesh?: {
      verbosity?: 0|1|2|3|4|5,
      enabled: boolean,
      bootstrapList?: string[]
    }
  },
  syncing?: {
    enabled: boolean,
    blockstreamDelay?: number,
    chunkSize?: number
  },
  uploadBlockNumber?: number,
  addresses?: ContractAddresses,
  server?: {
    httpPort: number;
    startHTTP: boolean;
    httpsPort: number;
    startHTTPS: boolean;
    wsPort: number;
    startWS: boolean;
    wssPort: number;
    startWSS: boolean;
    certificateFile?: string;
    certificateKeyFile?: string;
  }
};

export const environments: {[network: string]: SDKConfiguration} = requireAll(__dirname + '/environments');

export enum NetworkId {
  Mainnet = '1',
  Ropsten = '3',
  Rinkeby = '4',
  Kovan = '42',
  Private1 = '101',
  Private2 = '102',
  Private3 = '103',
  Private4 = '104',
  PrivateGanache = '123456',
};

export function isDevNetworkId(id: NetworkId): boolean {
  return [
    NetworkId.Mainnet,
    NetworkId.Ropsten,
    NetworkId.Rinkeby,
    NetworkId.Kovan,
  ].indexOf(id) === -1;
}

export interface UploadBlockNumbers {
  [networkId: string]: number
}

export interface ContractAddresses {
  Universe: string;
  Augur: string;
  AugurTrading: string;
  LegacyReputationToken: string;
  CancelOrder: string;
  Cash: string;
  ShareToken: string;
  CreateOrder: string;
  FillOrder: string;
  Order?: string;
  Orders: string;
  Trade: string;
  SimulateTrade: string;
  Controller?: string;
  OrdersFinder?: string;
  OrdersFetcher?: string;
  TradingEscapeHatch?: string;
  Time?: string;
  TimeControlled?: string;
  GnosisSafe?: string;
  ProxyFactory?: string;
  BuyParticipationTokens?: string;
  RedeemStake?: string;
  CashFaucet?: string;
  GnosisSafeRegistry?: string;
  HotLoading?: string;
  ZeroXTrade?: string;
  Affiliates?: string;
  AffiliateValidator?: string;
  ProfitLoss?: string;
  EthExchange?: string;
  WarpSync?: string;

  // 0x
  //   The 0x contract names must be what 0x mesh expects.
  ERC20Proxy?: string;
  ERC721Proxy?: string;
  ERC1155Proxy?: string;
  Exchange?: string; // ZeroXExchange
  Coordinator?: string; // ZeroXCoordinator
  ChaiBridge?: string;
  DevUtils?: string;
  WETH9?: string;
  ZRXToken?: string;
}

export interface AllContractAddresses {
  [networkId: string]: ContractAddresses
}

// TS doesn't allow mapping of any type but string or number so we list it out manually
export interface NetworkContractAddresses {
  1: ContractAddresses;
  3: ContractAddresses;
  4: ContractAddresses;
  19: ContractAddresses;
  42: ContractAddresses;
  101: ContractAddresses;
  102: ContractAddresses;
  103: ContractAddresses;
  104: ContractAddresses;
}

export async function setEnvironmentConfig(env: string, config: SDKConfiguration): Promise<void> {
  await Promise.all(['src', 'build'].map(async (dir: string) => {
    const filepath = path.join(__dirname, '..', dir, 'environments', env);
    await writeFile(filepath, JSON.stringify(config, null, 2), 'utf8');
  }));
}

export async function updateConfig(env: string, config: Partial<SDKConfiguration>): Promise<SDKConfiguration> {
  const original: Partial<SDKConfiguration> = await readConfig(env).then((c) => c || {}).catch(() => ({}));
  const updated = {
    ...original,
    ...config
  };
  if (isValidConfig(updated)) {
    return updated;
  } else {
    throw Error(`Invalid SDKConfiguration: ${updated}`)
  }
}

export function getEnvironmentConfigForNetwork(networkId: NetworkId, breakOnMulti=false, validate=true): SDKConfiguration {
  let targetConfig: SDKConfiguration = null;
  Object.values(environments).forEach((config) => {
    if (config.networkId === networkId) {
      if (breakOnMulti && targetConfig) throw Error(`Multiple environment configs for network "${networkId}"`)
      targetConfig = config;
    }
  });

  if (validate) {
    if (!targetConfig) {
      throw new Error(`No config for network "${networkId}". Existing configs: ${JSON.stringify(environments)}`);
    }
    if (!targetConfig.addresses) {
      throw new Error(`Config for network is missing addresses. Config: ${JSON.stringify(targetConfig)}`)
    }
    if (!targetConfig.uploadBlockNumber) {
      throw new Error(`Config for network is missing uploadBlockNumber. Config: ${JSON.stringify(targetConfig)}`)
    }
  }

  return targetConfig;
}

export function getAddressesForNetwork(networkId: NetworkId): ContractAddresses {
  return getEnvironmentConfigForNetwork(networkId).addresses;
}

export function getStartingBlockForNetwork(networkId: NetworkId): number {
  return getEnvironmentConfigForNetwork(networkId).uploadBlockNumber;
}

export async function updateEnvironmentsConfig(): Promise<void> {
  // be sure to be in src dir, not build
  const basepath = path.join(__dirname, '../src/environments');
  const files = await readdir(basepath);

  await Promise.all(files.map(async (filename) => {
    const env = path.parse(filename).name;
    environments[env] = await readConfig(env);
  }));
}

async function readConfig(env: string): Promise<SDKConfiguration> {
  const filepath = path.join(__dirname, '../src/environments', `${env}.json`);
  if (await exists(filepath)) {
    let config;
    try {
      const blob = await readFile(filepath, 'utf8');
      config = JSON.parse(blob);
    } catch {
      throw Error(`Cannot parse config file ${filepath}`)
    }

    if (isValidConfig(config)) {
      return config;
    } else {
      throw Error(`Bad config file at ${filepath}`)
    }
  } else {
    return null;
  }
}

export function isValidConfig(suspect: Partial<SDKConfiguration>): suspect is SDKConfiguration {
  return typeof suspect.networkId === 'string';
}

const DEFAULT_SDK_CONFIGURATION: SDKConfiguration = {
  networkId: NetworkId.PrivateGanache,
  ethereum: {
    rpcRetryCount: 5,
    rpcRetryInterval: 0,
    rpcConcurrency: 40
  },
  uploadBlockNumber: 0,
};

export function buildConfig(specified: Partial<SDKConfiguration>): SDKConfiguration {
  return {
    ...deepCopy(DEFAULT_SDK_CONFIGURATION),
    ...deepCopy(specified)
  }
}

function deepCopy<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}
