import { formatInt256 } from '@augurproject/utils/build';
import Dexie from 'dexie';
import { Block } from 'ethers/providers';
import * as IPFS from 'ipfs';
import * as Unixfs from 'ipfs-unixfs';
import { DAGNode } from 'ipld-dag-pb';
import _ from 'lodash';
import { NULL_ADDRESS, Provider } from '..';

import { DB } from '../state/db/DB';
import { Address, Log } from '../state/logs/types';
import { Checkpoints } from './Checkpoints';

export const WARPSYNC_VERSION = '1';

type NameOfType<T, R> = {
  [P in keyof T]: T[P] extends R ? P : never;
}[keyof T];

type AllDBNames = NameOfType<DB, Dexie.Table<Log, unknown>>;
type AllDbs = {
  [P in AllDBNames]: DB[P] extends Dexie.Table<infer R, unknown> ? R : never;
};

// Assuming indexes we need are simple ones e.g. 'market'.
// Will need to rethink this for something like '[universe+reporter]'.
type DbExpander<P> = P extends keyof AllDbs
  ? { databaseName: P; indexes?: Array<keyof AllDbs[P]> }
  : never;
type Db = DbExpander<keyof AllDbs>;
type RollupDescription = Readonly<Db[]>;

interface IPFSObject {
  Hash: string;
  Name?: string;
  Size: number;
}

const databasesToSync: RollupDescription = [
  { databaseName: 'CompleteSetsPurchased' },
  { databaseName: 'CompleteSetsSold' },
  { databaseName: 'DisputeCrowdsourcerContribution' },
  { databaseName: 'DisputeCrowdsourcerCompleted' },
  { databaseName: 'DisputeCrowdsourcerCreated' },
  { databaseName: 'DisputeCrowdsourcerRedeemed' },
  { databaseName: 'DisputeWindowCreated' },
  { databaseName: 'InitialReporterRedeemed' },
  { databaseName: 'InitialReportSubmitted' },
  { databaseName: 'InitialReporterTransferred' },
  { databaseName: 'MarketCreated' },
  { databaseName: 'MarketFinalized' },
  { databaseName: 'MarketMigrated' },
  { databaseName: 'MarketParticipantsDisavowed' },
  { databaseName: 'MarketTransferred' },
  { databaseName: 'MarketVolumeChanged' },
  { databaseName: 'MarketOIChanged' },
  { databaseName: 'OrderEvent' },
  { databaseName: 'ParticipationTokensRedeemed' },
  { databaseName: 'ProfitLossChanged' },
  { databaseName: 'ReportingParticipantDisavowed' },
  { databaseName: 'TimestampSet' },
  { databaseName: 'TokenBalanceChanged' },
  { databaseName: 'TokensMinted' },
  { databaseName: 'TokensTransferred' },
  { databaseName: 'TradingProceedsClaimed' },
  { databaseName: 'UniverseCreated' },
  { databaseName: 'UniverseForked' },
  { databaseName: 'TransferSingle' },
  { databaseName: 'TransferBatch' },
  { databaseName: 'ShareTokenBalanceChanged' },
];

export class WarpController {
  private static DEFAULT_NODE_TYPE = { format: 'dag-pb', hashAlg: 'sha2-256' };
  checkpoints: Checkpoints;

  get ready() {
    return this.ipfs.ready;
  }

  static async create(db: DB, provider: Provider, uploadBlockNumber: Block) {
    const ipfs = await IPFS.create();
    return new WarpController(db, ipfs, provider, uploadBlockNumber);
  }

  constructor(
    private db: DB,
    private ipfs: IPFS,
    provider: Provider,
    private uploadBlockNumber: Block
  ) {
    this.checkpoints = new Checkpoints(provider);
  }

  onNewBlock = async (newBlock: Block): Promise<void> => {
    const mostRecentCheckpoint = await this.db.warpCheckpoints.getMostRecentCheckpoint();
    if (
      mostRecentCheckpoint &&
      this.checkpoints.isSameDay(mostRecentCheckpoint.begin, newBlock)
    ) {
      return;
    }

    // Presumably we would report here.
    this.createAllCheckpoints(newBlock);
  };

  async createInitialCheckpoint() {
    const mostRecentCheckpoint = await this.db.warpCheckpoints.getMostRecentCheckpoint();
    if (!mostRecentCheckpoint) {
      this.db.warpCheckpoints.createInitialCheckpoint(this.uploadBlockNumber);
    }
  }

  async createAllCheckpoints(highestBlock: Block) {
    await this.createInitialCheckpoint();
    await this.createCheckpoints(highestBlock);

    // For reproducibility we need hash consistent block number ranges for each warp sync.
    const [
      begin,
      end,
    ] = await this.db.warpCheckpoints.getCheckpointBlockRange();

    const topLevelDirectory = new DAGNode(
      Unixfs.default('directory').marshal()
    );
    const versionFile = await this.ipfs.add({
      content: Buffer.from(WARPSYNC_VERSION),
    });
    topLevelDirectory.addLink({
      Name: 'VERSION',
      Hash: versionFile[0].hash,
      Size: 1,
    });

    topLevelDirectory.addLink(
      await this.buildDirectory('accounts', await this.createAccountRollups())
    );

    topLevelDirectory.addLink(
      await this.buildDirectory(
        'checkpoints',
        await this.db.warpCheckpoints.getAllIPFSObjects()
      )
    );

    topLevelDirectory.addLink(
      await this.buildDirectory(
        'markets',
        await this.createMarketRollups(begin.number, end.number)
      )
    );

    let indexFileLinks = [];
    const tableNode = new DAGNode(Unixfs.default('directory').marshal());
    for (const { databaseName } of databasesToSync) {
      const [links, r] = await this.addDBToIPFS(
        this.db[databaseName]
          .where('blockNumber')
          .between(begin.number, end.number, true, true),
        databaseName
      );
      indexFileLinks = [...indexFileLinks, ...links];
      tableNode.addLink(r);
    }

    topLevelDirectory.addLink({
      Name: 'tables',
      Hash: await this.ipfs.dag.put(
        tableNode,
        WarpController.DEFAULT_NODE_TYPE
      ),
      Size: 0,
    });

    const file = Unixfs.default('file');
    for (let i = 0; i < indexFileLinks.length; i++) {
      file.addBlockSize(indexFileLinks[i].Size);
    }

    const indexFile = new DAGNode(file.marshal());
    for (let i = 0; i < indexFileLinks.length; i++) {
      indexFile.addLink(indexFileLinks[i]);
    }

    const indexFileResponse = await this.ipfs.dag.put(
      indexFile,
      WarpController.DEFAULT_NODE_TYPE
    );
    topLevelDirectory.addLink({
      Name: 'index',
      Hash: indexFileResponse,
      Size: file.fileSize(),
    });

    const d = await this.ipfs.dag.put(
      topLevelDirectory,
      WarpController.DEFAULT_NODE_TYPE
    );

    console.log('checkpoint', d.toString());
    return d.toString();
  }

  async addDBToIPFS(
    table: Pick<Dexie.Table<any, any>, 'toArray'>,
    name: string
  ): Promise<[IPFSObject[], IPFSObject]> {
    const results = await this.ipfsAddRows(await table.toArray());

    const file = Unixfs.default('file');
    for (let i = 0; i < results.length; i++) {
      file.addBlockSize(results[i].Size);
    }
    const links = [];
    const indexFile = new DAGNode(file.marshal());
    for (let i = 0; i < results.length; i++) {
      const link = results[i];
      links.push(link);
      indexFile.addLink(link);
    }

    const indexFileResponse = await this.ipfs.dag.put(
      indexFile,
      WarpController.DEFAULT_NODE_TYPE
    );

    const directory = Unixfs.default('directory');
    for (let i = 0; i < results.length; i++) {
      directory.addBlockSize(results[i].Size);
    }

    directory.addBlockSize(file.fileSize());
    const directoryNode = new DAGNode(directory.marshal());
    for (let i = 0; i < results.length; i++) {
      directoryNode.addLink({
        Name: `file${i}`,
        Hash: results[i].Hash,
        Size: results[i].Size,
      });
    }

    directoryNode.addLink({
      Name: 'index',
      Hash: indexFileResponse.toString(),
      Size: file.fileSize(),
    });

    const q = await this.ipfs.dag.put(
      directoryNode,
      WarpController.DEFAULT_NODE_TYPE
    );
    return [
      links,
      {
        Name: name,
        Hash: q.toString(),
        Size: 0,
      },
    ];
  }

  private async buildDirectory(name: string, items: IPFSObject[] = []) {
    const file = Unixfs.default('file');
    const directory = Unixfs.default('directory');
    for (let i = 0; i < items.length; i++) {
      directory.addBlockSize(items[i].Size);
    }

    directory.addBlockSize(file.fileSize());
    const directoryNode = new DAGNode(directory.marshal());

    for (let i = 0; i < items.length; i++) {
      await directoryNode.addLink(items[i]);
    }

    const q = await this.ipfs.dag.put(
      directoryNode,
      WarpController.DEFAULT_NODE_TYPE
    );

    return {
      Name: name,
      Hash: q.toString(),
      Size: 0,
    };
  }

  private async ipfsAddRows(rows: any[]): Promise<IPFSObject[]> {
    if (_.isEmpty(rows)) {
      return [];
    }

    const requests = rows.map((row, i) => ({
      content: Buffer.from(JSON.stringify(row) + '\n'),
    }));

    const data = await this.ipfs.add(requests);
    return data.map(item => ({
      Hash: item.hash,
      Size: item.size,
    }));
  }

  async createMarketRollups(
    startBlockNumber?: number,
    endBlockNumber?: number
  ) {
    const dbNamesToSync: RollupDescription = [
      { databaseName: 'MarketCreated', indexes: ['market'] },
      { databaseName: 'MarketVolumeChanged', indexes: ['market'] },
      { databaseName: 'MarketOIChanged', indexes: ['market'] },
      { databaseName: 'InitialReportSubmitted', indexes: ['market'] },
      { databaseName: 'DisputeCrowdsourcerCompleted', indexes: ['market'] },
      { databaseName: 'MarketFinalized', indexes: ['market'] },
      { databaseName: 'MarketParticipantsDisavowed', indexes: ['market'] },
      { databaseName: 'MarketMigrated', indexes: ['market'] },
      { databaseName: 'OrderEvent', indexes: ['market'] },
      { databaseName: 'ProfitLossChanged', indexes: ['market'] },
    ];

    const result = (await this.db.MarketCreated.toArray()).map(
      ({ market }) => market
    );

    const results = await this.createRollup(dbNamesToSync, result);
    return results[1];
  }

  async createCheckpoint(begin: Block, end: Block) {
    let indexFileLinks = [];
    for (const { databaseName } of databasesToSync) {
      const table = this.db[databaseName];
      const [links, r] = await this.addDBToIPFS(
        table
          .where('blockNumber')
          .between(begin.number, end.number, true, true),
        databaseName
      );
      indexFileLinks = [...indexFileLinks, ...links];
    }

    const file = Unixfs.default('file');
    for (let i = 0; i < indexFileLinks.length; i++) {
      file.addBlockSize(indexFileLinks[i].Size);
    }

    const indexFile = new DAGNode(file.marshal());
    for (let i = 0; i < indexFileLinks.length; i++) {
      indexFile.addLink(indexFileLinks[i]);
    }

    const indexFileResponse = await this.ipfs.dag.put(
      indexFile,
      WarpController.DEFAULT_NODE_TYPE
    );

    return {
      Name: `${begin.number}`,
      Hash: indexFileResponse.toString(),
      Size: file.fileSize(),
    };
  }

  async createCheckpoints(end: Block) {
    const mostRecentCheckpoint = await this.db.warpCheckpoints.getMostRecentCheckpoint();
    const [
      newBeginBlock,
      newEndBlock,
    ] = await this.checkpoints.calculateBoundary(
      mostRecentCheckpoint.begin,
      end
    );

    // This is where we actually create the checkpoint.
    const checkPointIPFSObject = await this.createCheckpoint(
      mostRecentCheckpoint.begin,
      newBeginBlock
    );
    await this.db.warpCheckpoints.createCheckpoint(
      newBeginBlock,
      newEndBlock,
      checkPointIPFSObject
    );

    if (this.checkpoints.isSameDay(newEndBlock, end)) {
      return;
    } else {
      return this.createCheckpoints(end);
    }
  }

  async createAccountRollups(
    startBlockNumber?: number,
    endBlockNumber?: number
  ) {
    const dbNamesToSync: RollupDescription = [
      {
        databaseName: 'TransferBatch',
        indexes: ['to', 'from'],
      },
      {
        databaseName: 'TransferSingle',
        indexes: ['from', 'to'],
      },
    ];

    // @todo figure out if this is the best way to find all accounts.
    const result = _.uniq(
      (await this.db.ProfitLossChanged.toArray()).map(({ account }) => account)
    );

    const results = await this.createRollup(
      dbNamesToSync,
      result,
      startBlockNumber,
      endBlockNumber
    );
    return results[1];
  }

  queryDB = async (
    dbName: AllDBNames,
    properties: string[] = [],
    criteria: Address,
    startBlockNumber = 0,
    endBlockNumber?: number
  ) => {
    const query = properties.reduce(
      (table, value) => table.or(value).equalsIgnoreCase(criteria),
      (db => {
        if (endBlockNumber) {
          return db.between(startBlockNumber, endBlockNumber, true, true);
        }
        return db.aboveOrEqual(0);
      })(this.db[dbName].where('blockNumber'))
    );
    const logs = await query.toArray();

    return this.ipfsAddRows(logs);
  };

  async createRollup(
    rollupDescriptions: RollupDescription,
    ids: Address[],
    startBlockNumber?: number,
    endBlockNumber?: number
  ) {
    const resultPromises = ids.map(
      async (id): Promise<[IPFSObject[], IPFSObject[]]> => {
        const links: IPFSObject[] = [];
        const items = _.flatten(
          await Promise.all(
            rollupDescriptions.map(r =>
              this.queryDB(
                r.databaseName,
                r.indexes,
                id,
                startBlockNumber,
                endBlockNumber
              )
            )
          )
        );

        const file = Unixfs.default('file');
        for (let i = 0; i < items.length; i++) {
          file.addBlockSize(items[i].Size);
        }

        const indexFile = new DAGNode(file.marshal());
        for (let i = 0; i < items.length; i++) {
          links.push(items[i]);
          indexFile.addLink(items[i]);
        }

        const indexFileResponse = await this.ipfs.dag.put(
          indexFile,
          WarpController.DEFAULT_NODE_TYPE
        );

        return [
          links,
          [
            {
              Name: id,
              Hash: indexFileResponse.toString(),
              Size: file.fileSize(),
            },
          ],
        ];
      }
    );

    const result = await Promise.all(resultPromises);
    const [links, files] = result.reduce<[IPFSObject[], IPFSObject[]]>(
      (acc, item) => {
        return [[...acc[0], ...item[0]], [...acc[1], ...item[1]]];
      },
      [[], []]
    );

    const file = Unixfs.default('file');
    for (let i = 0; i < links.length; i++) {
      file.addBlockSize(links[i].Size);
    }

    const indexFile = new DAGNode(file.marshal());
    for (let i = 0; i < links.length; i++) {
      indexFile.addLink(links[i]);
    }

    const indexFileResponse = await this.ipfs.dag.put(
      indexFile,
      WarpController.DEFAULT_NODE_TYPE
    );

    return [
      links.slice(),
      [
        {
          Name: 'index',
          Hash: indexFileResponse.toString(),
          Size: file.fileSize(),
        },
        ...files,
      ],
    ];
  }

  getFile(ipfsPath: string) {
    return this.ipfs.cat(ipfsPath);
  }

  async getAvailableCheckpointsByHash(ipfsRootHash: string): Promise<number[]> {
    const files = await this.ipfs.ls(`${ipfsRootHash}/checkpoints/`);
    return files.map(item => Number(item.name));
  }

  async getCheckpointFile(
    ipfsRootHash: string,
    checkpointBlockNumber: string | number
  ) {
    return this.getFile(`${ipfsRootHash}/checkpoints/${checkpointBlockNumber}`);
  }

  async pinHashByGatewayUrl(urlString: string) {
    const url = new URL(urlString);
    try {
      await this.ipfs.pin.add(url.pathname);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async getMostRecentCheckpoint() {
    return this.db.warpCheckpoints.getMostRecentCheckpoint();
  }

  async hasMostRecentCheckpoint() {
    return (await this.getMostRecentCheckpoint()) !== undefined;
  }
}
