import { WSClient } from '@0x/mesh-rpc-client';
import { ContractAddresses } from '@augurproject/artifacts';
import { EthersProvider } from '@augurproject/ethersjs-provider';
import { BrowserMesh, Connectors } from '@augurproject/sdk';
import { DB } from '@augurproject/sdk/build/state/db/DB';
import { API } from '@augurproject/sdk/build/state/getter/API';
import {
  ACCOUNTS,
  ContractAPI,
  defaultSeedPath,
  loadSeedFile,
} from '@augurproject/tools';
import { makeProvider } from '@augurproject/tools/build/libs/LocalAugur';
import { makeDbMock, MockGnosisRelayAPI } from '../../libs';
import { MockBrowserMesh } from '../../libs/MockBrowserMesh';
import { MockMeshServer } from '../../libs/MockMeshServer';

const mock = makeDbMock();

describe('DB handleMergeEvent', () => {
  let john: ContractAPI;
  let johnDB: Promise<DB>;
  let johnAPI: API;

  let provider: EthersProvider;
  let addresses: ContractAddresses;

  let meshBrowser: BrowserMesh;
  let meshClient: WSClient;
  const mock = makeDbMock();

  beforeAll(async () => {
    const { port } = await MockMeshServer.create();
    meshClient = new WSClient(`ws://localhost:${port}`);
    meshBrowser = new MockBrowserMesh(meshClient);

    const seed = await loadSeedFile(defaultSeedPath);
    addresses = seed.addresses;
    provider = await makeProvider(seed, ACCOUNTS);
    const johnConnector = new Connectors.DirectConnector();
    const johnGnosis = new MockGnosisRelayAPI();
    john = await ContractAPI.userWrapper(
      ACCOUNTS[0],
      provider,
      addresses,
      johnConnector,
      johnGnosis,
      meshClient,
      meshBrowser,
    );
    expect(john).toBeDefined();

    johnGnosis.initialize(john);
    johnDB = mock.makeDB(john.augur, ACCOUNTS);
    johnConnector.initialize(john.augur, await johnDB);
    johnAPI = new API(john.augur, johnDB);
  });

  test('should merge dem logs', async () => {
    await expect((await johnDB).Markets.toArray()).resolves.toEqual([]);
    await (await johnDB).marketDatabase.handleMergeEvent(185, [
      {
        'name': 'MarketCreated',
        'universe': '0x1b8dae4F281A437E797f6213C6564926a04D9959',
        'endTime': '0x5064e881',
        'extraInfo': '{"categories": ["common", "yesNo 1 secondary", "yesNo 1 tertiary"], "description": "yesNo description 1", "longDescription": "yesNo longDescription 1"}',
        'market': '0x235A1911EDbF88574658C0cde1f72cbd14f99eCb',
        'marketCreator': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'designatedReporter': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'feePerCashInAttoCash': '0xb1a2bc2ec50000',
        'prices': ['0x00', '0x0de0b6b3a7640000'],
        'marketType': 0,
        'numTicks': '0x64',
        'outcomes': [],
        'noShowBond': '0x04da50ad20fa6d2e',
        'timestamp': '0x50639701',
        'address': '0xFCaf25bF38E7C86612a25ff18CB8e09aB07c9885',
        'blockNumber': 160,
        'blockHash': '0x18a9119541fc03d136dbb5fea854f01dcf68e11b9495d9383cda16e1869c38e3',
        'transactionIndex': 0,
        'removed': false,
        'transactionLogIndex': 0,
        'transactionHash': '0xe8beb1eaa96a5f5200d1631d22e17ea5ecac5f55d1f567b87620a41fe2149eb7',
        'logIndex': 17,
        'topics': [
          '0xea17ae24b0d40ea7962a6d832db46d1f81eaec1562946d0830d1c21d4c000ec1',
          '0x0000000000000000000000001b8dae4f281a437e797f6213c6564926a04d9959',
          '0x000000000000000000000000913da4198e6be1d5f5e4a40d0667f70c0b5430eb'],
      }, {
        'name': 'MarketCreated',
        'universe': '0x1b8dae4F281A437E797f6213C6564926a04D9959',
        'endTime': '0x5064e881',
        'extraInfo': '{"categories": ["yesNo 2 primary", "yesNo 2 secondary", "yesNo 2 tertiary"], "description": "yesNo description 2", "longDescription": "yesNo longDescription 2"}',
        'market': '0xE55699163F5F6049bdd18A29AC102A21F86E2b37',
        'marketCreator': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'designatedReporter': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'feePerCashInAttoCash': '0xb1a2bc2ec50000',
        'prices': ['0x00', '0x0de0b6b3a7640000'],
        'marketType': 0,
        'numTicks': '0x64',
        'outcomes': [],
        'noShowBond': '0x04da50ad20fa6d2e',
        'timestamp': '0x50639701',
        'address': '0xFCaf25bF38E7C86612a25ff18CB8e09aB07c9885',
        'blockNumber': 163,
        'blockHash': '0x55e629254c77dc95556d6fcc23b9864c1f00afcfa5756a91b930a389fa2c80b7',
        'transactionIndex': 0,
        'removed': false,
        'transactionLogIndex': 0,
        'transactionHash': '0xa53aa60f7dfd1c55d4c1f911aa189935cab565474c7004a0d17be82977f290a5',
        'logIndex': 12,
        'topics': [
          '0xea17ae24b0d40ea7962a6d832db46d1f81eaec1562946d0830d1c21d4c000ec1',
          '0x0000000000000000000000001b8dae4f281a437e797f6213c6564926a04d9959',
          '0x000000000000000000000000913da4198e6be1d5f5e4a40d0667f70c0b5430eb'],
      }, {
        'name': 'MarketCreated',
        'universe': '0x1b8dae4F281A437E797f6213C6564926a04D9959',
        'endTime': '0x5064e881',
        'extraInfo': '{"categories": ["categorical 1 primary", "categorical 1 secondary", "categorical 1 tertiary"], "description": "categorical description 1", "longDescription": "categorical longDescription 1"}',
        'market': '0x0ba5943E723966BcE1ef625A321292d3D33E1296',
        'marketCreator': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'designatedReporter': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'feePerCashInAttoCash': '0xb1a2bc2ec50000',
        'prices': ['0x00', '0x0de0b6b3a7640000'],
        'marketType': 1,
        'numTicks': '0x64',
        'outcomes': [
          '0x4100000000000000000000000000000000000000000000000000000000000000',
          '0x4200000000000000000000000000000000000000000000000000000000000000',
          '0x4300000000000000000000000000000000000000000000000000000000000000'],
        'noShowBond': '0x04da50ad20fa6d2e',
        'timestamp': '0x50639701',
        'address': '0xFCaf25bF38E7C86612a25ff18CB8e09aB07c9885',
        'blockNumber': 166,
        'blockHash': '0xe288c6b1d00024e733a7ffdc29029f570de38ed378491607e600cdc762913681',
        'transactionIndex': 0,
        'removed': false,
        'transactionLogIndex': 0,
        'transactionHash': '0xeacdf3ca8f9d056f3028331781bd6f7495c95ab386d90cf9ce5e1a5999db94e1',
        'logIndex': 12,
        'topics': [
          '0xea17ae24b0d40ea7962a6d832db46d1f81eaec1562946d0830d1c21d4c000ec1',
          '0x0000000000000000000000001b8dae4f281a437e797f6213c6564926a04d9959',
          '0x000000000000000000000000913da4198e6be1d5f5e4a40d0667f70c0b5430eb'],
      }, {
        'name': 'MarketCreated',
        'universe': '0x1b8dae4F281A437E797f6213C6564926a04D9959',
        'endTime': '0x5064e881',
        'extraInfo': '{"categories": ["categorical 2 primary", "categorical 2 secondary", "categorical 2 tertiary"], "description": "categorical description 2", "longDescription": "categorical longDescription 2"}',
        'market': '0x32d4D03600Cf8432fdA9A22c548B1F8b6ac92728',
        'marketCreator': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'designatedReporter': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'feePerCashInAttoCash': '0x016345785d8a0000',
        'prices': ['0x00', '0x0de0b6b3a7640000'],
        'marketType': 1,
        'numTicks': '0x64',
        'outcomes': [
          '0x4100000000000000000000000000000000000000000000000000000000000000',
          '0x4200000000000000000000000000000000000000000000000000000000000000',
          '0x4300000000000000000000000000000000000000000000000000000000000000'],
        'noShowBond': '0x04da50ad20fa6d2e',
        'timestamp': '0x50639701',
        'address': '0xFCaf25bF38E7C86612a25ff18CB8e09aB07c9885',
        'blockNumber': 169,
        'blockHash': '0xa71089f2f078a3040159b0d59113f86e5fb04cae4f816fbd57d604bdda86d204',
        'transactionIndex': 0,
        'removed': false,
        'transactionLogIndex': 0,
        'transactionHash': '0xc20089b656d51ef2237708bb2bb373e9935a0eea58b26df7218b0f0db69dd2e6',
        'logIndex': 12,
        'topics': [
          '0xea17ae24b0d40ea7962a6d832db46d1f81eaec1562946d0830d1c21d4c000ec1',
          '0x0000000000000000000000001b8dae4f281a437e797f6213c6564926a04d9959',
          '0x000000000000000000000000913da4198e6be1d5f5e4a40d0667f70c0b5430eb'],
      }, {
        'name': 'MarketCreated',
        'universe': '0x1b8dae4F281A437E797f6213C6564926a04D9959',
        'endTime': '0x5064e881',
        'extraInfo': '{"categories": ["common", "scalar 1 secondary", "scalar 1 tertiary"], "description": "scalar description 1", "longDescription": "scalar longDescription 1", "_scalarDenomination": "scalar denom 1"}',
        'market': '0x10E8fDDABe2C5BE2d1297459C7976A82B51fFE35',
        'marketCreator': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'designatedReporter': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'feePerCashInAttoCash': '0x016345785d8a0000',
        'prices': ['0x00', '0x056bc75e2d63100000'],
        'marketType': 2,
        'numTicks': '0x64',
        'outcomes': [],
        'noShowBond': '0x04da50ad20fa6d2e',
        'timestamp': '0x50639701',
        'address': '0xFCaf25bF38E7C86612a25ff18CB8e09aB07c9885',
        'blockNumber': 172,
        'blockHash': '0xaf89cbb5dc975ae8e0777e0de51262bea66f33f7367b5af7cac93b115267430a',
        'transactionIndex': 0,
        'removed': false,
        'transactionLogIndex': 0,
        'transactionHash': '0x7ae9ac59d418a0565feb8b15be4e281bd8f0ae0aef9474a416f04bc5be5c7c76',
        'logIndex': 12,
        'topics': [
          '0xea17ae24b0d40ea7962a6d832db46d1f81eaec1562946d0830d1c21d4c000ec1',
          '0x0000000000000000000000001b8dae4f281a437e797f6213c6564926a04d9959',
          '0x000000000000000000000000913da4198e6be1d5f5e4a40d0667f70c0b5430eb'],
      }, {
        'name': 'MarketCreated',
        'universe': '0x1b8dae4F281A437E797f6213C6564926a04D9959',
        'endTime': '0x5064e882',
        'extraInfo': '{"categories": ["scalar 2 primary", "scalar 2 secondary", "scalar 2 tertiary"], "description": "scalar description 2", "longDescription": "scalar longDescription 2", "_scalarDenomination": "scalar denom 2"}',
        'market': '0xc9d4094aD387F3f968673b2967794fE4EA1F4516',
        'marketCreator': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'designatedReporter': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'feePerCashInAttoCash': '0x016345785d8a0000',
        'prices': ['0x00', '0x056bc75e2d63100000'],
        'marketType': 2,
        'numTicks': '0x64',
        'outcomes': [],
        'noShowBond': '0x04da50ad20fa6d2e',
        'timestamp': '0x50639701',
        'address': '0xFCaf25bF38E7C86612a25ff18CB8e09aB07c9885',
        'blockNumber': 175,
        'blockHash': '0x3954841b36ff6af87ca4f31c9bd9cee97197c6578ada277c22f096f49f913e1d',
        'transactionIndex': 0,
        'removed': false,
        'transactionLogIndex': 0,
        'transactionHash': '0x06deff466541a1ee728f1207a47f9a673e5d3a1dc87e21c9ac3f360b03990366',
        'logIndex': 12,
        'topics': [
          '0xea17ae24b0d40ea7962a6d832db46d1f81eaec1562946d0830d1c21d4c000ec1',
          '0x0000000000000000000000001b8dae4f281a437e797f6213c6564926a04d9959',
          '0x000000000000000000000000913da4198e6be1d5f5e4a40d0667f70c0b5430eb'],
      }, {
        'name': 'MarketCreated',
        'universe': '0x1b8dae4F281A437E797f6213C6564926a04D9959',
        'endTime': '0x5064e881',
        'extraInfo': '{"categories": ["yesNo 1 primary", "yesNo 1 secondary", "yesNo 1 tertiary"], "description": "yesNo description 1", "longDescription": "yesNo longDescription 1"}',
        'market': '0xf8d45bf354a88AbFCAb95870a4eA1Cc3334eb264',
        'marketCreator': '0xE4EC477Bc4Abd2B18225Bb8CBa14BF57867f082B',
        'designatedReporter': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'feePerCashInAttoCash': '0xb1a2bc2ec50000',
        'prices': ['0x00', '0x0de0b6b3a7640000'],
        'marketType': 0,
        'numTicks': '0x64',
        'outcomes': [],
        'noShowBond': '0x04da50ad20fa6d2e',
        'timestamp': '0x50639701',
        'address': '0xFCaf25bF38E7C86612a25ff18CB8e09aB07c9885',
        'blockNumber': 178,
        'blockHash': '0xae0fa4a7b118bbe242f73dcd17199a3c803ae63bf580c4a1fa1df5734d97c948',
        'transactionIndex': 0,
        'removed': false,
        'transactionLogIndex': 0,
        'transactionHash': '0xb3765383414a24134e98895b493a8e17a01597597dc4957587a4a4bcd519e977',
        'logIndex': 12,
        'topics': [
          '0xea17ae24b0d40ea7962a6d832db46d1f81eaec1562946d0830d1c21d4c000ec1',
          '0x0000000000000000000000001b8dae4f281a437e797f6213c6564926a04d9959',
          '0x000000000000000000000000e4ec477bc4abd2b18225bb8cba14bf57867f082b'],
      }, {
        'name': 'InitialReportSubmitted',
        'universe': '0x1b8dae4F281A437E797f6213C6564926a04D9959',
        'reporter': '0xE4EC477Bc4Abd2B18225Bb8CBa14BF57867f082B',
        'market': '0xE55699163F5F6049bdd18A29AC102A21F86E2b37',
        'initialReporter': '0x524925Edb7a29cC35d886968253cb5e209655cf4',
        'amountStaked': '0x04da50ad20fa6d2e',
        'isDesignatedReporter': false,
        'payoutNumerators': ['0x00', '0x64', '0x00'],
        'description': '',
        'nextWindowStartTime': '0x50679990',
        'nextWindowEndTime': '0x5068eb10',
        'timestamp': '0x50678b81',
        'address': '0xFCaf25bF38E7C86612a25ff18CB8e09aB07c9885',
        'blockNumber': 180,
        'blockHash': '0xde5dc6ab41b06c0e463d50adddaf1123c9a6b38e1463d9ccb928b8cd0488d06c',
        'transactionIndex': 0,
        'removed': false,
        'transactionLogIndex': 0,
        'transactionHash': '0x2c025e051ba467496e1600d9f68f9c0e9e8edf1c83b8f399ed1572ce4918348c',
        'logIndex': 5,
        'topics': [
          '0xc3ebb227c22e7644e9bef8822009f746a72c86f239760124d67fdc2c302b3115',
          '0x0000000000000000000000001b8dae4f281a437e797f6213c6564926a04d9959',
          '0x000000000000000000000000e4ec477bc4abd2b18225bb8cba14bf57867f082b',
          '0x000000000000000000000000e55699163f5f6049bdd18a29ac102a21f86e2b37'],
      }, {
        'name': 'InitialReportSubmitted',
        'universe': '0x1b8dae4F281A437E797f6213C6564926a04D9959',
        'reporter': '0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Eb',
        'market': '0x0ba5943E723966BcE1ef625A321292d3D33E1296',
        'initialReporter': '0xC86b113Fc21352711AD0370a4440fAc2c6d890b7',
        'amountStaked': '0x04da50ad20fa6d2e',
        'isDesignatedReporter': true,
        'payoutNumerators': ['0x00', '0x64', '0x00', '0x00'],
        'description': '',
        'nextWindowStartTime': '0x50679990',
        'nextWindowEndTime': '0x5068eb10',
        'timestamp': '0x50678b81',
        'address': '0xFCaf25bF38E7C86612a25ff18CB8e09aB07c9885',
        'blockNumber': 181,
        'blockHash': '0xf46dd810a0fb30f9e21475178cd4c9ff6683534a7efb8e7a0a12a938052b9afd',
        'transactionIndex': 0,
        'removed': false,
        'transactionLogIndex': 0,
        'transactionHash': '0x9bf99e3091af4d2298abdf57af190ad33ccffe31ae30f4cfe6299f520c0337f3',
        'logIndex': 4,
        'topics': [
          '0xc3ebb227c22e7644e9bef8822009f746a72c86f239760124d67fdc2c302b3115',
          '0x0000000000000000000000001b8dae4f281a437e797f6213c6564926a04d9959',
          '0x000000000000000000000000913da4198e6be1d5f5e4a40d0667f70c0b5430eb',
          '0x0000000000000000000000000ba5943e723966bce1ef625a321292d3d33e1296'],
      }],
    );

    const derivedLogs = await (await johnDB).Markets.toArray();

    expect(derivedLogs).toHaveLength(7);
    expect(derivedLogs).toEqual([
      expect.objectContaining({
        liquidity: expect.any(Array)
      }),
      expect.objectContaining({
        liquidity: expect.any(Array)
      }),
      expect.objectContaining({
        liquidity: expect.any(Array)
      }),
      expect.objectContaining({
        liquidity: expect.any(Array)
      }),
      expect.objectContaining({
        liquidity: expect.any(Array)
      }),
      expect.objectContaining({
        liquidity: expect.any(Array)
      }),
      expect.objectContaining({
        liquidity: expect.any(Array)
      })
    ])

  });
});

