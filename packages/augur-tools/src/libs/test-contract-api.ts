import { WSClient } from '@0x/mesh-rpc-client';
import { ContractAddresses } from '@augurproject/artifacts';
import { EthersProvider } from '@augurproject/ethersjs-provider';
import { IGnosisRelayAPI } from '@augurproject/gnosis-relay-api';
import {
  Augur,
  BrowserMesh,
  Connectors,
  EmptyConnector,
  ZeroX,
} from '@augurproject/sdk';
import { DB } from '@augurproject/sdk/build/state/db/DB';
import { BulkSyncStrategy } from '@augurproject/sdk/build/state/sync/BulkSyncStrategy';
import { BigNumber } from 'bignumber.js';
import { ContractDependenciesGnosis } from 'contract-dependencies-gnosis/build';
import { Account } from '../constants';
import { makeGnosisDependencies, makeSigner } from './blockchain';
import { ContractAPI } from './contract-api';
import { makeDbMock } from './MakeDbMock';
import { API } from '@augurproject/sdk/build/state/getter/API';

export class TestContractAPI extends ContractAPI {
  protected bulkSyncStrategy: BulkSyncStrategy;
  api: API;

  static async userWrapper(
    account: Account,
    provider: EthersProvider,
    addresses: ContractAddresses,
    connector: Connectors.BaseConnector = new EmptyConnector(),
    gnosisRelay: IGnosisRelayAPI = undefined,
    meshClient: WSClient = undefined,
    meshBrowser: BrowserMesh = undefined,
  ) {
    const signer = await makeSigner(account, provider);
    const dependencies = makeGnosisDependencies(
      provider,
      gnosisRelay,
      signer,
      addresses.Cash,
      new BigNumber(0),
      null,
      account.publicKey,
    );

    let zeroX = null;
    if (meshClient || meshBrowser) {
      zeroX = new ZeroX();
      zeroX.rpc = meshClient;
    }
    const augur = await Augur.create(
      provider,
      dependencies,
      addresses,
      connector,
      zeroX,
      true,
    );
    if (zeroX && meshBrowser) {
      zeroX.mesh = meshBrowser;
    }

    const db = await makeDbMock().makeDB(augur);

    return new TestContractAPI(augur, provider, dependencies, account, db);
  }

  constructor(
    readonly augur: Augur,
    readonly provider: EthersProvider,
    readonly dependencies: ContractDependenciesGnosis,
    public account: Account,
    public db: DB,
  ) {
    super(augur, provider, dependencies, account);

    this.api = new API(augur, Promise.resolve(db));

    this.bulkSyncStrategy = new BulkSyncStrategy(
      provider.getLogs,
      db.logFilters.buildFilter,
      db.logFilters.onLogsAdded,
      augur.contractEvents.parseLogs,
    );
  }

  sync = async (highestBlockNumberToSync?: number) => {
    let startingSyncBlock = await this.db.syncStatus.getLowestSyncingBlockForAllDBs();
    if (startingSyncBlock == -1) startingSyncBlock = 0;
    console.log(`SYNCING FROM ${startingSyncBlock}`);
    await this.bulkSyncStrategy.start(
      startingSyncBlock,
      highestBlockNumberToSync || await this.provider.getBlockNumber(),
    );

    await this.db.sync();
  };
}
