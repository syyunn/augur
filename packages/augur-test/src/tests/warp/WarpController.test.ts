import { ContractAddresses, NetworkId } from '@augurproject/artifacts';
import { DB } from '@augurproject/sdk/build/state/db/DB';
import { API } from '@augurproject/sdk/build/state/getter/API';
import { BulkSyncStrategy } from '@augurproject/sdk/build/state/sync/BulkSyncStrategy';
import { WarpSyncStrategy } from '@augurproject/sdk/build/state/sync/WarpSyncStrategy';
import { configureDexieForNode } from '@augurproject/sdk/build/state/utils/DexieIDBShim';
import { WarpController } from '@augurproject/sdk/build/warp/WarpController';
import {
  ACCOUNTS,
  ContractAPI,
  defaultSeedPath,
  loadSeedFile,
  makeDependencies,
  makeSigner,
} from '@augurproject/tools';
import { Seed } from '@augurproject/tools/build';
import { TestEthersProvider } from '@augurproject/tools/build/libs/TestEthersProvider';
import { BigNumber } from 'bignumber.js';
import { ContractDependenciesEthers } from 'contract-dependencies-ethers';
import { Block } from 'ethers/providers';
import * as IPFS from 'ipfs';
import { makeDbMock, makeProvider } from '../../libs';

const mock = makeDbMock();

describe('WarpController', () => {
  const biggestNumber = new BigNumber(2).pow(256).minus(2);
  let addresses: ContractAddresses;
  let db: DB;
  let dependencies: ContractDependenciesEthers;
  let ipfs;
  let john: ContractAPI;
  let networkId: NetworkId;
  let provider: TestEthersProvider;
  let warpController: WarpController;
  let firstCheckpointFileHash: string;
  let secondCheckpointFileHash: string;
  let allMarketIds: string[];
  let uploadBlockHeaders: Block;
  let firstCheckpointBlockHeaders: Block;
  let newBlockHeaders: Block;
  let seed: Seed;
  let bulkSyncStrategy: BulkSyncStrategy;

  beforeAll(async () => {
    configureDexieForNode(true);
    ipfs = await IPFS.create({
      repo: './data',
    });

    seed = await loadSeedFile(defaultSeedPath, 'WarpSync');

    provider = await makeProvider(seed, ACCOUNTS);
    networkId = await provider.getNetworkId();
    const signer = await makeSigner(ACCOUNTS[0], provider);
    dependencies = makeDependencies(ACCOUNTS[0], provider, signer);
    addresses = seed.addresses;

    uploadBlockHeaders = await provider.getBlock(0);
    firstCheckpointBlockHeaders = await provider.getBlock(170);
    newBlockHeaders = await provider.getBlock('latest');

    john = await ContractAPI.userWrapper(ACCOUNTS[0], provider, seed.addresses);

    db = await mock.makeDB(john.augur, ACCOUNTS);

    bulkSyncStrategy = new BulkSyncStrategy(
      provider.getLogs,
      db.logFilters.buildFilter,
      db.logFilters.onLogsAdded,
      john.augur.contractEvents.parseLogs,
      50,
    );

    // partially populate db.
    await bulkSyncStrategy.start(0, 170);

    // I'm just assuming the upload block is 0. Shouldn't
    // really be a problem that we are grabbing extra blocks.
    warpController = new WarpController(db, ipfs, provider, uploadBlockHeaders);
    firstCheckpointFileHash = await warpController.createAllCheckpoints(
      await provider.getBlock(170),
    );

    await bulkSyncStrategy.start(170, await provider.getBlockNumber());

    secondCheckpointFileHash = await warpController.createAllCheckpoints(
      newBlockHeaders,
    );

    allMarketIds = (await db.MarketCreated.toArray()).map(
      market => market.market,
    );
  });

  afterAll(async () => {
    await ipfs.stop();
  });

  describe('queryDB', () => {
    test('limit blocks in query', async () => {
      const result = await warpController.queryDB('TransferSingle',
        ['to', 'from'], john.account.publicKey, 0, 175);
      expect(result).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          blockNumber: '176',
        })]));
    });

    test('filter by block range', async () => {
      await expect(
        warpController.queryDB(
          'MarketCreated',
          ['market'],
          allMarketIds[0],
          uploadBlockHeaders.number,
          newBlockHeaders.number,
        ),
      ).resolves.toEqual([
        expect.objectContaining({
          market: allMarketIds[0],
        })
      ]);
    });
  });

  describe('getCheckpointBlockRange', () => {
    test('should return the range', async () => {
      await expect(
        db.warpCheckpoints.getCheckpointBlockRange(),
      ).resolves.toEqual([
        expect.objectContaining({
          number: 0,
        }),
        expect.objectContaining({
          number: 177,
        }),
      ]);
    });
  });

  describe('createCheckpoint method', () => {
    test('should create checkpoint file and return the hash', async () => {
      // Specific event type doesn't matter. Just need two logs that
      // will produce a range of blocks whose first and last will
      // contain said log.
      const logs = await john.augur.contractEvents.getLogs('MarketCreated', uploadBlockHeaders.number, newBlockHeaders.number);

      const targetBeginNumber = Math.min(...logs.map(item  => item.blockNumber));;
      const targetEndNumber = Math.max(...logs.map(item  => item.blockNumber));;

      const hash = await warpController.createCheckpoint(
        await provider.getBlock(targetBeginNumber),
        await provider.getBlock(targetEndNumber),
      );
      const result = (await ipfs.cat(`${hash.Hash}`)).toString().
        split('\n').
        filter(log => log).
        map(log => {
          try {
            return JSON.parse(log);
          } catch (e) {
            console.error(e, log);
          }
        }).
        map(item => item.blockNumber);

      expect(Math.min(...result)).toEqual(targetBeginNumber);
      expect(Math.max(...result)).toEqual(targetEndNumber);
    });
  });

  describe('getAvailableCheckpointsByHash method', () => {
    test('return array of checkpoints available', async () => {
      await expect(
        warpController.getAvailableCheckpointsByHash(secondCheckpointFileHash),
      ).resolves.toEqual([0, 168, 176]);
    });
  });

  describe('createCheckpoints', () => {
    test('Create checkpoint db records', async () => {
      await expect(db.warpCheckpoints.table.toArray()).resolves.toEqual([
        expect.objectContaining({
          _id: 1,
          begin: expect.objectContaining({
            number: 0,
          }),
          end: expect.objectContaining({
            number: 167,
          }),
          ipfsInfo: expect.objectContaining({
            Name: '0',
          }),
        }),
        expect.objectContaining({
          _id: 2,
          begin: expect.objectContaining({
            number: 168,
          }),
          end: expect.objectContaining({
            number: 175,
          }),
          ipfsInfo: expect.objectContaining({
            Name: '168',
          }),
        }),
        expect.objectContaining({
          _id: 3,
          begin: expect.objectContaining({
            number: 176,
          }),
          end: expect.objectContaining({
            number: 177,
          }),
          ipfsInfo: expect.objectContaining({
            Name: '176',
          }),
        }),
        expect.objectContaining({
          _id: 4,
          begin: expect.objectContaining({
            number: 178,
          }),
        }),
      ]);
    });

    test('should create initial checkpoints', async () => {
      await expect(
        ipfs.ls(`${secondCheckpointFileHash}/checkpoints/`),
      ).resolves.toEqual([
        expect.objectContaining({
          name: '0',
        }),
        expect.objectContaining({
          name: '168',
        }),
        expect.objectContaining({
          name: '176',
        }),
      ]);
    });

    test('getCheckpointBlockRange', async () => {
      await expect(db.warpCheckpoints.getCheckpointBlockRange()).
        resolves.
        toEqual([
          expect.objectContaining({
            number: 0,
          }),
          expect.objectContaining({
            number: 177,
          }),
        ]);
    });
  });

  describe('structure', () => {
    describe('top-level directory', () => {
      test('should have a version file with the version number', async () => {
        await expect(
          ipfs.cat(`${secondCheckpointFileHash}/VERSION`),
        ).resolves.toEqual(Buffer.from('1'));
      });

      test('should have the prescribed layout', async () => {
        await expect(ipfs.ls(`${secondCheckpointFileHash}`)).resolves.toEqual([
          expect.objectContaining({
            name: 'VERSION',
            type: 'file',
          }),
          expect.objectContaining({
            name: 'accounts',
            type: 'dir',
          }),
          expect.objectContaining({
            name: 'checkpoints',
            type: 'dir',
          }),
          expect.objectContaining({
            name: 'index',
            type: 'file',
          }),
          expect.objectContaining({
            name: 'markets',
            type: 'dir',
          }),
          expect.objectContaining({
            name: 'tables',
            type: 'dir',
          }),
        ]);
      });

      describe('market rollup', () => {
        test('should create an item for all the markets', async () => {
          const allMarkets = allMarketIds.map(market => {
            return expect.objectContaining({
              name: market,
              type: 'file',
            });
          });

          await expect(
            ipfs.ls(`${secondCheckpointFileHash}/markets`),
          ).resolves.toEqual(
            expect.arrayContaining([
              ...allMarkets,
              expect.objectContaining({
                name: 'index',
                type: 'file',
              }),
            ]),
          );
        });

        test('market file should have contents', async () => {
          const result = await ipfs.cat(
            `${secondCheckpointFileHash}/markets/${allMarketIds[0]}`,
          );

          expect(result.toString()).not.toEqual('');
        });

        test('index file should have contents', async () => {
          const result = await ipfs.cat(
            `${secondCheckpointFileHash}/markets/index`,
          );

          expect(result.toString()).not.toEqual('');
        });
      });

      describe('account rollups', () => {
        test('should create files for each account', async () => {
          await expect(
            ipfs.ls(`${secondCheckpointFileHash}/accounts/`),
          ).resolves.toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: john.account.publicKey,
                type: 'file',
              }),
              expect.objectContaining({
                name: 'index',
                type: 'file',
              }),
            ]),
          );
        });
      });
    });
  });

  describe('non-empty dbs', () => {
    // This is a spot check.
    test('should have some logs', async () => {
      const marketCreated = await ipfs.cat(
        `${secondCheckpointFileHash}/tables/MarketCreated/index`,
      );
      const splitLogs = marketCreated.toString().
        split('\n').
        filter(log => log).
        map(log => {
          try {
            return JSON.parse(log);
          } catch (e) {
            console.error(e, log);
          }
        });

      expect(splitLogs).toEqual(await db.MarketCreated.toArray());
    });
  });

  describe('syncing', () => {
    let fixture: ContractAPI;
    let fixtureApi: API;
    let fixtureDB: DB;
    let fixtureBulkSyncStrategy: BulkSyncStrategy;

    let newJohn: ContractAPI;
    let newJohnApi: API;
    let newJohnDB: DB;
    let newJohnWarpController: WarpController;
    let warpSyncStrategy: WarpSyncStrategy;

    beforeEach(async () => {
      fixture = await ContractAPI.userWrapper(
        ACCOUNTS[0],
        provider,
        seed.addresses,
      );

      fixtureDB = await mock.makeDB(fixture.augur, ACCOUNTS);
      fixtureApi = new API(john.augur, Promise.resolve(fixtureDB));

      fixtureBulkSyncStrategy = new BulkSyncStrategy(
        provider.getLogs,
        fixtureDB.logFilters.buildFilter,
        fixtureDB.logFilters.onLogsAdded,
        fixture.augur.contractEvents.parseLogs,
        1,
      );

      newJohn = await ContractAPI.userWrapper(
        ACCOUNTS[0],
        provider,
        seed.addresses,
      );

      newJohnDB = await mock.makeDB(newJohn.augur, ACCOUNTS);
      newJohnWarpController = new WarpController(
        newJohnDB,
        ipfs,
        provider,
        uploadBlockHeaders,
      );
      newJohnApi = new API(newJohn.augur, Promise.resolve(newJohnDB));
      warpSyncStrategy = new WarpSyncStrategy(
        newJohnWarpController,
        newJohnDB.logFilters.onLogsAdded,
      );

      newJohnWarpController = new WarpController(
        newJohnDB,
        ipfs,
        provider,
        uploadBlockHeaders,
      );
      newJohnApi = new API(newJohn.augur, Promise.resolve(newJohnDB));

      warpSyncStrategy = new WarpSyncStrategy(
        newJohnWarpController,
        newJohnDB.logFilters.onLogsAdded,
      );
    });

    describe('partial sync', () => {
      test('should load specific market data', async () => {
        const marketId = allMarketIds[3];
        const blockNumber = await warpSyncStrategy.syncMarket(
          secondCheckpointFileHash,
          marketId,
        );

        await fixtureBulkSyncStrategy.start(0, blockNumber);
        const fixtureMarketList = await fixtureApi.route('getMarketsInfo', {
          marketIds: [marketId],
        });

        const newJohnMarketList = await newJohnApi.route('getMarketsInfo', {
          marketIds: [marketId],
        });

        expect(newJohnMarketList).toEqual(fixtureMarketList);
      });

      test('should load specific user data', async () => {
        const marketId = allMarketIds[3];

        await warpSyncStrategy.syncMarket(secondCheckpointFileHash, marketId);
        const blockNumber = await warpSyncStrategy.syncAccount(
          secondCheckpointFileHash,
          newJohn.account.publicKey,
        );

        await fixtureBulkSyncStrategy.start(0, blockNumber);
        const fixtureUserAccountData = await fixtureApi.route('getUserAccountData', {
          universe: addresses.Universe,
          account: john.account.publicKey,
        });

        await expect(
          newJohnApi.route('getUserAccountData', {
            universe: addresses.Universe,
            account: newJohn.account.publicKey,
          }),
        ).resolves.toEqual(fixtureUserAccountData);
      });
    });

    describe('full sync', () => {
      test('should populate market data', async () => {
        // populate db.
        const blockNumber = await warpSyncStrategy.start(secondCheckpointFileHash);

        await fixtureBulkSyncStrategy.start(0, blockNumber);
        const fixtureMarketList = await fixtureApi.route('getMarkets', {
          universe: addresses.Universe,
        });

        await expect(
          newJohnApi.route('getMarkets', {
            universe: addresses.Universe,
          }),
        ).resolves.toEqual(fixtureMarketList);
      });
    });

    describe('checkpoint syncing', () => {
      test('identify new diff and just pull that', async () => {
        // populate db.
        let blockNumber = await warpSyncStrategy.start(firstCheckpointFileHash);

        // This should populate the checkpoints DB.
        await newJohnWarpController.createAllCheckpoints(
          firstCheckpointBlockHeaders,
        );

        await fixtureBulkSyncStrategy.start(0, blockNumber);
        const fixtureMarketList = await fixtureApi.route('getMarkets', {
          universe: addresses.Universe,
        });

        // Sanity check.
        await expect(
          newJohnApi.route('getMarkets', {
            universe: addresses.Universe,
          }),
        ).resolves.toEqual(fixtureMarketList);

        // populate db. Admittedly this just proves the logs were loaded.
        blockNumber = await warpSyncStrategy.start(
          secondCheckpointFileHash,
        );

        await fixtureBulkSyncStrategy.start(0, blockNumber);
        const rolledbackFixtureMarketList = await fixtureApi.route('getMarkets', {
          universe: addresses.Universe,
        });

        await expect(
          newJohnApi.route('getMarkets', {
            universe: addresses.Universe,
          }),
        ).resolves.toEqual(rolledbackFixtureMarketList);
      });
    });
  });
  describe('pinning ui', () => {
    test.skip('valid hash', async () => {
      await warpController.pinHashByGatewayUrl(
        'https://cloudflare-ipfs.com/ipfs/QmXnnyufdzAWL5CqZ2RnSNgPbvCc1ALT73s6epPrRnZ1Xy',
      );
      await expect(ipfs.pin.ls()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            hash: 'QmXnnyufdzAWL5CqZ2RnSNgPbvCc1ALT73s6epPrRnZ1Xy',
          }),
        ]),
      );
    });
    test('invalid hash', async () => {
      await warpController.pinHashByGatewayUrl(
        'https://cloudflare-ipfs.com/ipfs/QQakF4QZQ9CYciRmcYA56kisvnEFHZRThzKBAzF5MXw6zv',
      );
      await expect(ipfs.pin.ls()).resolves.not.toEqual([
        expect.arrayContaining([
          expect.objectContaining({
            hash: 'QQakF4QZQ9CYciRmcYA56kisvnEFHZRThzKBAzF5MXw6zv',
          }),
        ]),
      ]);
    });
  });
});
