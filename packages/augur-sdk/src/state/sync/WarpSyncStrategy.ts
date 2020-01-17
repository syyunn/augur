import { Log } from '@augurproject/types';
import { WarpController } from '../../warp/WarpController';
import _ from 'lodash';
import { Address } from '../logs/types';

export class WarpSyncStrategy {
  constructor(
    protected warpSyncController: WarpController,
    protected onLogsAdded: (blockNumber: number, logs: Log[]) => Promise<void>
  ) {}

  async syncMarket(ipfsRootHash?: string, marketId?: Address) {
    // No hash, nothing to do!
    if (!ipfsRootHash) return undefined;

    // No marketId, nothing to do!
    if (!marketId) return undefined;

    const marketLogs = await this.warpSyncController.getFile(
      `${ipfsRootHash}/markets/${marketId}`
    );

    return this.processFile(marketLogs);
  }

  async syncMarkets(ipfsRootHash?: string) {
    // No hash, nothing to do!
    if (!ipfsRootHash) return undefined;

    const marketLogs = await this.warpSyncController.getFile(
      `${ipfsRootHash}/markets/index`
    );

    return this.processFile(marketLogs);
  }

  async syncAccount(ipfsRootHash?: string, account?: Address) {
    // No hash, nothing to do!
    if (!ipfsRootHash) return undefined;

    // No account, nothing to do!
    if (!account) return undefined;

    const accountRollup = await this.warpSyncController.getFile(
      `${ipfsRootHash}/accounts/${account}`
    );

    return this.processFile(accountRollup);
  }

  async pinHashByGatewayUrl(url: string) {
    return this.warpSyncController.pinHashByGatewayUrl(url);
  }

  async start(ipfsRootHash?: string): Promise<number | undefined> {
    // No hash, nothing to do!
    if (!ipfsRootHash) return undefined;

    // Check if we have previous state. If so, just load the next checkpoint.
    if(await this.warpSyncController.hasMostRecentCheckpoint()) {
      return this.loadCheckpoints(ipfsRootHash);
    } else {
      const allLogs = await this.warpSyncController.getFile(
        `${ipfsRootHash}/index`
      );

      return this.processFile(allLogs);
    }
  }

  async loadCheckpoints(ipfsRootHash: string): Promise<number | undefined> {
    const availableCheckpoints = await this.warpSyncController.getAvailableCheckpointsByHash(ipfsRootHash);
    const { begin } = await this.warpSyncController.getMostRecentCheckpoint();
    
    const checkpointsToSync = availableCheckpoints.filter((item) => item >= begin.number);
    let maxBlockNumber;
    for (let i = 0; i < checkpointsToSync.length; i++) {
      const logs = await this.warpSyncController.getCheckpointFile(ipfsRootHash, checkpointsToSync[i]);
      maxBlockNumber = await this.processFile(logs);
    }

    return maxBlockNumber;
  }

  async processFile(buffer: Buffer): Promise<number | undefined> {
    const splitLogs = buffer
      .toString()
      .split('\n')
      .filter(log => log)
      .map(log => {
        try {
          return JSON.parse(log);
        } catch (e) {
          console.error(e, log);
        }
      });

    const groupedLogs = _.groupBy(splitLogs, 'blockNumber');
    for (const blockNumber in groupedLogs) {
      if (groupedLogs.hasOwnProperty(blockNumber)) {
        await this.onLogsAdded(
          Number(blockNumber),
          _.sortBy(groupedLogs[blockNumber], 'logIndex')
        );
      }
    }

    return _.maxBy<number>(_.map(splitLogs, 'blockNumber'), item =>
      Number(item)
    );
  }
}
