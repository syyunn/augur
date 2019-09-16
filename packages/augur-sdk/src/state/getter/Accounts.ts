import { BigNumber } from 'bignumber.js';
import { DB } from '../db/DB';
import { Getter } from './Router';
import {
  CompleteSetsPurchasedLog,
  CompleteSetsSoldLog,
  DisputeCrowdsourcerContributionLog,
  DisputeCrowdsourcerRedeemedLog,
  InitialReporterRedeemedLog,
  InitialReportSubmittedLog,
  MarketCreatedLog,
  ParsedOrderEventLog,
  ParticipationTokensRedeemedLog,
  TradingProceedsClaimedLog,
  OrderType,
  TokenType,
} from "../logs/types";
import { sortOptions } from './types';
import {
  Augur,
  calculatePayoutNumeratorsValue,
  convertOnChainAmountToDisplayAmount,
  getOutcomeDescriptionFromOutcome,
  marketTypeToName
} from '../../index';
import { compareObjects } from '../../utils';

import * as t from 'io-ts';

export enum Action {
  ALL = 'ALL',
  BUY = 'BUY',
  SELL = 'SELL',
  CANCEL = 'CANCEL',
  CLAIM_PARTICIPATION_TOKENS = 'CLAIM_PARTICIPATION_TOKENS',
  CLAIM_TRADING_PROCEEDS = 'CLAIM_TRADING_PROCEEDS',
  CLAIM_WINNING_CROWDSOURCERS = 'CLAIM_WINNING_CROWDSOURCERS',
  DISPUTE = 'DISPUTE',
  INITIAL_REPORT = 'INITIAL_REPORT',
  MARKET_CREATION = 'MARKET_CREATION',
  COMPLETE_SETS = 'COMPLETE_SETS',
}

export enum Coin {
  ALL = 'ALL',
  ETH = 'ETH',
  REP = 'REP',
}

export const actionnDeserializer = t.keyof(Action);
export const coinDeserializer = t.keyof(Coin);

const getAccountTransactionHistoryParamsSpecific = t.type({
  universe: t.string,
  account: t.string,
  earliestTransactionTime: t.union([t.number, t.null, t.undefined]),
  latestTransactionTime: t.union([t.number, t.null, t.undefined]),
  coin: t.union([coinDeserializer, t.null, t.undefined]),
  action: t.union([actionnDeserializer, t.null, t.undefined]),
});

const getAccountReportingHistoryParamsSpecific = t.type({
  universe: t.string,
  account: t.string,
});

interface ContractInfo {
  address: string;
  amount: BigNumber;
  marketId: string;
}

interface ContractOverview {
  totalAmount: BigNumber;
  contracts: ContractInfo[];
}

interface ParticipationContract {
  address: string;
  amount: BigNumber;
  amountFees: BigNumber;
}

interface ParticipationOverview {
  totalAmount: BigNumber;
  totalFees: BigNumber;
  contracts: ParticipationContract[];
}

export interface AccountReportingHistory {
  profitLoss: BigNumber;
  profitAmount: BigNumber;
  reporting: ContractOverview | null;
  disputing: ContractOverview | null;
  participationTokens: ParticipationOverview;
}

export interface AccountTransaction {
  action: string;
  coin: string;
  details: string;
  fee: string;
  marketDescription: string;
  outcome: number | null;
  outcomeDescription: string | null;
  price: string;
  quantity: string;
  timestamp: number;
  total: string;
  transactionHash: string;
}

export interface MarketCreatedInfo {
  [key: string]: MarketCreatedLog;
}

export class Accounts<TBigNumber> {
  static getAccountTransactionHistoryParams = t.intersection([
    getAccountTransactionHistoryParamsSpecific,
    sortOptions,
  ]);

  static getAccountReportingHistoryParams = t.intersection([
    getAccountReportingHistoryParamsSpecific,
    sortOptions,
  ]);

  @Getter('getAccountReportingHistoryParams')
  static async getAccountReportingHistory<TBigNumber>(
    augur: Augur,
    db: DB,
    params: t.TypeOf<typeof Accounts.getAccountReportingHistoryParams>
  ): Promise<AccountReportingHistory> {
    const [
      marketCreatedLogs,
      initialReporterRedeemedLogs,
      disputeCrowdsourcerContributionLogs,
      disputeCrowdsourcerRedeemedLogs,
      tokensMintedLogs,
      participationTokensRedeemedLogs
    ] = await Promise.all([
      db.findMarketCreatedLogs({
        selector: {
          universe: params.universe,
          designatedReporter: params.account
        },
      }).then((r) => Promise.all(
        r.map(async ({ market }) => ({
          marketId: market,
          amount: await augur.getMarket(market).getValidityBondAttoCash_(),
          address: await augur.getMarket(market).getInitialReporter_(),
        }))
        )).then((r) => r.reduce((acc, { amount, address, marketId }) => {
          const compositeKey = `${marketId}-${address}`;
          return {
            ...acc,
            [compositeKey]: {
              marketId,
              address,
              amount,
            }
          };
        }, {} as { [compositeKey: string]: ContractInfo })),
        db.findInitialReporterRedeemedLogs(
          {
            selector: {
              universe: params.universe,
              reporter: params.account,
            },
          }
        ).then((r) => r.reduce((acc, { amountRedeemed, initialReport, market, }) => {
          const compositeKey = `${market}-${initialReport}`;
          return {
            ...acc,
            [compositeKey]: {
              marketId: market,
              address: initialReport,
              amount: amountRedeemed,
            },
          };
        }, {} as { [compositeKey: string]: ContractInfo })),
        db.findDisputeCrowdsourcerContributionLogs({
          selector: {
            universe: params.universe,
            reporter: params.account,
          },
        }).then((r) => r.reduce(
            (acc, { amountStaked, disputeCrowdsourcer, market }) => {
              const compositeKey = `${market}-${disputeCrowdsourcer}`;
              return {
                ...acc,
                [compositeKey]: {
                  marketId: market,
                  address: disputeCrowdsourcer,
                  amount: (compositeKey in acc) ?
                    acc[compositeKey].amount.plus(amountStaked) :
                    new BigNumber(amountStaked)
                }
              };
            }, {} as { [compositeKey: string]: ContractInfo })),
        db.findDisputeCrowdsourcerRedeemedLogs(
          {
            selector: {
              universe: params.universe,
              reporter: params.account
            }
          }
        ).then((r) => r.reduce(
            (acc, { amountRedeemed, disputeCrowdsourcer, market }) => ({
              ...acc,
              [`${market}-${disputeCrowdsourcer}`]: {
                marketId: market,
                address: disputeCrowdsourcer,
                amount: new BigNumber(amountRedeemed),
              },
            }), {} as { [compositeKey: string]: ContractInfo })),
      db.findTokensMintedLogs(params.account, {
          selector: {
            universe: params.universe,
            target: params.account,
            tokenType: TokenType.ParticipationToken,
          },
        }
      ).then((r) => r.reduce(
        (acc, { target, token, amount }) => ({
          ...acc,
          [`${target}`]: {
            address: target,
            amount: new BigNumber(amount),
            amountFees: new BigNumber(0),
          },
        }), {} as { [compositeKey:string]: ParticipationContract })),
      db.findParticipationTokensRedeemedLogs(
          {
            selector: {
              universe: params.universe,
              account: params.account,
            },
          }
        ).then((r) => r.reduce(
          (acc, { disputeWindow, attoParticipationTokens, feePayoutShare }) => ({
            ...acc,
            [`${disputeWindow}`]: {
              address: disputeWindow,
              amount: new BigNumber(attoParticipationTokens),
              amountFees: new BigNumber(feePayoutShare),
            },
        }), {} as { [compositeKey:string]: ParticipationContract })),
    ]);

    const disputeContractInfo:ContractInfo[] = [];
    for(const compositeKey in disputeCrowdsourcerContributionLogs) {
      const item = disputeCrowdsourcerContributionLogs[compositeKey];
      if(disputeCrowdsourcerRedeemedLogs[compositeKey]) {
        disputeContractInfo.push({
          ...item,
          amount: item.amount.minus(disputeCrowdsourcerRedeemedLogs[compositeKey].amount),
        });
      } else {
        disputeContractInfo.push(item);
      }
    }

    const disputing:ContractOverview = {
      contracts: disputeContractInfo,
      totalAmount: disputeContractInfo.reduce((acc, item) => acc.plus(item.amount), new BigNumber(0)),
    };

    const reportingContractInfo:ContractInfo[] = [];
    for(const compositeKey in marketCreatedLogs) {
      const item = marketCreatedLogs[compositeKey];
      if(initialReporterRedeemedLogs[compositeKey]) {
        reportingContractInfo.push({
          ...item,
          amount: item.amount.minus(initialReporterRedeemedLogs[compositeKey].amount),
        });
      } else {
        reportingContractInfo.push(item);
      }
    }

    const reporting:ContractOverview =  {
      contracts: reportingContractInfo,
      totalAmount: reportingContractInfo.reduce((acc, item) => acc.plus(item.amount), new BigNumber(0)),
    };

    const participationTokenContractInfo:ParticipationContract[] = [];
    for(const compositeKey in tokensMintedLogs) {
      const item = tokensMintedLogs[compositeKey];
      if(participationTokensRedeemedLogs[compositeKey]) {
        participationTokenContractInfo.push({
          ...item,
          amount: item.amount.minus(participationTokensRedeemedLogs[compositeKey].amount),
          amountFees: new BigNumber(participationTokensRedeemedLogs[compositeKey].amountFees),
        });
      } else {
        participationTokenContractInfo.push(item);
      }
    }

    const participationTokens:ParticipationOverview =  {
      contracts: participationTokenContractInfo,
      totalAmount: participationTokenContractInfo.reduce((acc, item) => acc.plus(item.amount), new BigNumber(0)),
      totalFees: participationTokenContractInfo.reduce((acc, item) => acc.plus(item.amountFees), new BigNumber(0)),
    };

    return  {
      profitLoss: new BigNumber(0),
      profitAmount: new BigNumber(0),
      reporting,
      disputing,
      participationTokens,
    };
  }

  @Getter('getAccountTransactionHistoryParams')
  static async getAccountTransactionHistory<TBigNumber>(
    augur: Augur,
    db: DB,
    params: t.TypeOf<typeof Accounts.getAccountTransactionHistoryParams>
  ): Promise<AccountTransaction[]> {
    if (!params.earliestTransactionTime) params.earliestTransactionTime = 0;
    if (!params.latestTransactionTime) {
      params.latestTransactionTime = (await augur.contracts.augur.getTimestamp_()).toNumber();
    }
    if (!params.coin) params.coin = Coin.ALL;
    if (!params.action) params.action = Action.ALL;
    if (!params.sortBy) params.sortBy = 'timestamp';
    if (typeof params.isSortDescending === 'undefined') {
      params.isSortDescending = true;
    }

    let actionCoinComboIsValid = false;
    let allFormattedLogs: any = [];
    if (
      (params.action === Action.BUY ||
        params.action === Action.SELL ||
        params.action === Action.ALL) &&
      (params.coin === Coin.ETH || params.coin === Coin.ALL)
    ) {
      const orderFilledLogs = await db.findOrderFilledLogs({
        selector: {
          $and: [
            { universe: params.universe },
            {
              $or: [
                { orderCreator: params.account },
                { orderFiller: params.account },
              ],
            },
            {
              timestamp: {
                $gte: `0x${params.earliestTransactionTime.toString(16)}`,
                $lte: `0x${params.latestTransactionTime.toString(16)}`,
              },
            },
          ],
        },
      });
      const marketInfo = await Accounts.getMarketCreatedInfo(
        db,
        orderFilledLogs
      );
      allFormattedLogs = allFormattedLogs.concat(
        formatOrderFilledLogs(orderFilledLogs, marketInfo, params)
      );
      actionCoinComboIsValid = true;
    }

    if (
      (params.action === Action.CANCEL || params.action === Action.ALL) &&
      (params.coin === Coin.ETH || params.coin === Coin.ALL)
    ) {
      const orderCanceledLogs = await db.findOrderCanceledLogs({
        selector: {
          universe: params.universe,
          orderCreator: params.account,
          timestamp: {
            $gte: `0x${params.earliestTransactionTime.toString(16)}`,
            $lte: `0x${params.latestTransactionTime.toString(16)}`,
          },
        },
      });
      const marketInfo = await Accounts.getMarketCreatedInfo(
        db,
        orderCanceledLogs
      );
      allFormattedLogs = allFormattedLogs.concat(
        formatOrderCanceledLogs(orderCanceledLogs, marketInfo)
      );
      actionCoinComboIsValid = true;
    }

    if (
      (params.action === Action.CLAIM_PARTICIPATION_TOKENS ||
        params.action === Action.ALL) &&
      (params.coin === Coin.ETH || params.coin === Coin.ALL)
    ) {
      const participationTokensRedeemedLogs = await db.findParticipationTokensRedeemedLogs(
        {
          selector: {
            universe: params.universe,
            account: params.account,
            timestamp: {
              $gte: `0x${params.earliestTransactionTime.toString(16)}`,
              $lte: `0x${params.latestTransactionTime.toString(16)}`,
            },
          },
        }
      );
      allFormattedLogs = allFormattedLogs.concat(
        formatParticipationTokensRedeemedLogs(participationTokensRedeemedLogs)
      );
      actionCoinComboIsValid = true;
    }

    if (
      (params.action === Action.CLAIM_TRADING_PROCEEDS ||
        params.action === Action.ALL) &&
      (params.coin === Coin.ETH || params.coin === Coin.ALL)
    ) {
      const tradingProceedsClaimedLogs = await db.findTradingProceedsClaimedLogs(
        {
          selector: {
            universe: params.universe,
            sender: params.account,
            timestamp: {
              $gte: `0x${params.earliestTransactionTime.toString(16)}`,
              $lte: `0x${params.latestTransactionTime.toString(16)}`,
            },
          },
        }
      );
      const marketInfo = await Accounts.getMarketCreatedInfo(
        db,
        tradingProceedsClaimedLogs
      );
      allFormattedLogs = allFormattedLogs.concat(
        await formatTradingProceedsClaimedLogs(
          tradingProceedsClaimedLogs,
          marketInfo,
          db
        )
      );
      actionCoinComboIsValid = true;
    }

    if (
      params.action === Action.CLAIM_WINNING_CROWDSOURCERS ||
      params.action === Action.ALL
    ) {
      const initialReporterRedeemedLogs = await db.findInitialReporterRedeemedLogs(
        {
          selector: {
            universe: params.universe,
            reporter: params.account,
            timestamp: {
              $gte: `0x${params.earliestTransactionTime.toString(16)}`,
              $lte: `0x${params.latestTransactionTime.toString(16)}`,
            },
          },
        }
      );
      let marketInfo = await Accounts.getMarketCreatedInfo(
        db,
        initialReporterRedeemedLogs
      );
      allFormattedLogs = allFormattedLogs.concat(
        await formatCrowdsourcerRedeemedLogs(
          initialReporterRedeemedLogs,
          marketInfo,
          params
        )
      );
      const disputeCrowdsourcerRedeemedLogs = await db.findDisputeCrowdsourcerRedeemedLogs(
        {
          selector: {
            universe: params.universe,
            reporter: params.account,
            timestamp: {
              $gte: `0x${params.earliestTransactionTime.toString(16)}`,
              $lte: `0x${params.latestTransactionTime.toString(16)}`,
            },
          },
        }
      );
      marketInfo = await Accounts.getMarketCreatedInfo(
        db,
        disputeCrowdsourcerRedeemedLogs
      );
      allFormattedLogs = allFormattedLogs.concat(
        await formatCrowdsourcerRedeemedLogs(
          disputeCrowdsourcerRedeemedLogs,
          marketInfo,
          params
        )
      );
      actionCoinComboIsValid = true;
    }

    if (
      (params.action === Action.MARKET_CREATION ||
        params.action === Action.ALL) &&
      (params.coin === Coin.ETH || params.coin === Coin.ALL)
    ) {
      const marketCreatedLogs = await db.findMarketCreatedLogs({
        selector: {
          universe: params.universe,
          marketCreator: params.account,
          timestamp: {
            $gte: `0x${params.earliestTransactionTime.toString(16)}`,
            $lte: `0x${params.latestTransactionTime.toString(16)}`,
          },
        },
      });
      const marketInfo = formatMarketCreatedLogs(marketCreatedLogs);
      allFormattedLogs = allFormattedLogs.concat(marketInfo);
      actionCoinComboIsValid = true;
    }

    if (
      (params.action === Action.DISPUTE || params.action === Action.ALL) &&
      (params.coin === Coin.REP || params.coin === Coin.ALL)
    ) {
      const disputeCrowdsourcerContributionLogs = await db.findDisputeCrowdsourcerContributionLogs(
        {
          selector: {
            universe: params.universe,
            reporter: params.account,
            timestamp: {
              $gte: `0x${params.earliestTransactionTime.toString(16)}`,
              $lte: `0x${params.latestTransactionTime.toString(16)}`,
            },
          },
        }
      );
      const marketInfo = await Accounts.getMarketCreatedInfo(
        db,
        disputeCrowdsourcerContributionLogs
      );
      allFormattedLogs = allFormattedLogs.concat(
        await formatDisputeCrowdsourcerContributionLogs(
          disputeCrowdsourcerContributionLogs,
          augur,
          marketInfo
        )
      );
      actionCoinComboIsValid = true;
    }

    if (
      (params.action === Action.INITIAL_REPORT ||
        params.action === Action.ALL) &&
      (params.coin === Coin.REP || params.coin === Coin.ALL)
    ) {
      const initialReportSubmittedLogs = await db.findInitialReportSubmittedLogs(
        {
          selector: {
            universe: params.universe,
            reporter: params.account,
            timestamp: {
              $gte: `0x${params.earliestTransactionTime.toString(16)}`,
              $lte: `0x${params.latestTransactionTime.toString(16)}`,
            },
          },
        }
      );
      const marketInfo = await Accounts.getMarketCreatedInfo(
        db,
        initialReportSubmittedLogs
      );
      allFormattedLogs = allFormattedLogs.concat(
        await formatInitialReportSubmittedLogs(
          initialReportSubmittedLogs,
          augur,
          marketInfo
        )
      );
      actionCoinComboIsValid = true;
    }

    if (
      (params.action === Action.COMPLETE_SETS ||
        params.action === Action.ALL) &&
      (params.coin === Coin.ETH || params.coin === Coin.ALL)
    ) {
      const completeSetsPurchasedLogs = await db.findCompleteSetsPurchasedLogs({
        selector: {
          universe: params.universe,
          account: params.account,
          timestamp: {
            $gte: `0x${params.earliestTransactionTime.toString(16)}`,
            $lte: `0x${params.latestTransactionTime.toString(16)}`,
          },
        },
      });
      let marketInfo = await Accounts.getMarketCreatedInfo(
        db,
        completeSetsPurchasedLogs
      );
      allFormattedLogs = allFormattedLogs.concat(
        formatCompleteSetsPurchasedLogs(completeSetsPurchasedLogs, marketInfo)
      );
      const completeSetsSoldLogs = await db.findCompleteSetsSoldLogs({
        selector: {
          universe: params.universe,
          account: params.account,
          timestamp: {
            $gte: `0x${params.earliestTransactionTime.toString(16)}`,
            $lte: `0x${params.latestTransactionTime.toString(16)}`,
          },
        },
      });
      marketInfo = await Accounts.getMarketCreatedInfo(
        db,
        completeSetsSoldLogs
      );
      allFormattedLogs = allFormattedLogs.concat(
        formatCompleteSetsSoldLogs(completeSetsSoldLogs, marketInfo)
      );
      actionCoinComboIsValid = true;
    }

    if (!actionCoinComboIsValid) {
      throw new Error('Invalid action/coin combination');
    }

    const order = params.isSortDescending ? 'desc' : 'asc';
    allFormattedLogs.sort(compareObjects(params.sortBy, order));

    if (params.limit == null && params.offset == null) return allFormattedLogs;

    const start = params.offset || 0;
    let end: number;
    if (params.limit) {
      if (params.offset) end = params.offset + params.limit;
      else end = params.limit;
    } else {
      end = allFormattedLogs.length;
    }
    return allFormattedLogs.slice(start, end);
  }

  static async getMarketCreatedInfo<TBigNumber>(
    db: DB,
    transactionLogs: Array<
      | ParsedOrderEventLog
      | TradingProceedsClaimedLog
      | DisputeCrowdsourcerRedeemedLog
      | InitialReporterRedeemedLog
      | DisputeCrowdsourcerContributionLog
      | InitialReportSubmittedLog
      | CompleteSetsPurchasedLog
      | CompleteSetsSoldLog
    >
  ): Promise<MarketCreatedInfo> {
    const markets = transactionLogs.map(
      transactionLogs => transactionLogs.market
    );
    const marketCreatedLogs = await db.findMarketCreatedLogs({
      selector: { market: { $in: markets } },
    });
    const marketCreatedInfo: MarketCreatedInfo = {};
    for (let i = 0; i < marketCreatedLogs.length; i++) {
      marketCreatedInfo[marketCreatedLogs[i].market] = marketCreatedLogs[i];
    }
    return marketCreatedInfo;
  }
}

function formatOrderFilledLogs(
  transactionLogs: ParsedOrderEventLog[],
  marketInfo: MarketCreatedInfo,
  params: t.TypeOf<typeof Accounts.getAccountTransactionHistoryParams>
): AccountTransaction[] {
  const formattedLogs: AccountTransaction[] = [];
  for (let i = 0; i < transactionLogs.length; i++) {
    const price = new BigNumber(transactionLogs[i].price);
    const quantity = new BigNumber(transactionLogs[i].amount);
    const maxPrice = new BigNumber(0);
    if (
      (params.action === Action.BUY || params.action === Action.ALL) &&
      ((transactionLogs[i].orderType === OrderType.Bid &&
        transactionLogs[i].orderCreator === params.account) ||
        (transactionLogs[i].orderType === OrderType.Ask &&
          transactionLogs[i].orderFiller === params.account))
    ) {
      formattedLogs.push({
        action: Action.BUY,
        coin: Coin.ETH,
        details: 'Buy order',
        fee: new BigNumber(transactionLogs[i].fees).toString(),
        marketDescription:
          marketInfo[transactionLogs[i].market].extraInfo &&
          JSON.parse(marketInfo[transactionLogs[i].market].extraInfo)
            .description
            ? JSON.parse(marketInfo[transactionLogs[i].market].extraInfo)
                .description
            : '',
        outcome: new BigNumber(transactionLogs[i].outcome).toNumber(),
        outcomeDescription: getOutcomeDescriptionFromOutcome(
          new BigNumber(transactionLogs[i].outcome).toNumber(),
          marketInfo[transactionLogs[i].market]
        ),
        price: price.toString(),
        quantity: quantity.toString(),
        timestamp: new BigNumber(transactionLogs[i].timestamp).toNumber(),
        total:
          transactionLogs[i].orderType === OrderType.Bid
            ? quantity.times(maxPrice.minus(price)).toString()
            : quantity.times(price).toString(),
        transactionHash: transactionLogs[i].transactionHash,
      });
    }
    if (
      (params.action === Action.SELL || params.action === Action.ALL) &&
      ((transactionLogs[i].orderType === OrderType.Ask &&
        transactionLogs[i].orderCreator === params.account) ||
        (transactionLogs[i].orderType === OrderType.Bid &&
          transactionLogs[i].orderFiller === params.account))
    ) {
      formattedLogs.push({
        action: Action.SELL,
        coin: Coin.ETH,
        details: 'Sell order',
        fee: new BigNumber(transactionLogs[i].fees).toString(),
        marketDescription:
          marketInfo[transactionLogs[i].market].extraInfo &&
          JSON.parse(marketInfo[transactionLogs[i].market].extraInfo)
            .description
            ? JSON.parse(marketInfo[transactionLogs[i].market].extraInfo)
                .description
            : '',
        outcome: new BigNumber(transactionLogs[i].outcome).toNumber(),
        outcomeDescription: getOutcomeDescriptionFromOutcome(
          new BigNumber(transactionLogs[i].outcome).toNumber(),
          marketInfo[transactionLogs[i].market]
        ),
        price: price.toString(),
        quantity: quantity.toString(),
        timestamp: new BigNumber(transactionLogs[i].timestamp).toNumber(),
        total:
          transactionLogs[i].orderType === OrderType.Bid
            ? quantity.times(maxPrice.minus(price)).toString()
            : quantity.times(price).toString(),
        transactionHash: transactionLogs[i].transactionHash,
      });
    }
  }
  return formattedLogs;
}

function formatOrderCanceledLogs(
  transactionLogs: ParsedOrderEventLog[],
  marketInfo: MarketCreatedInfo
): AccountTransaction[] {
  const formattedLogs: AccountTransaction[] = [];
  for (let i = 0; i < transactionLogs.length; i++) {
    formattedLogs.push({
      action: Action.CANCEL,
      coin: Coin.ETH,
      details: 'Cancel order',
      fee: '0',
      marketDescription:
        marketInfo[transactionLogs[i].market].extraInfo &&
        JSON.parse(marketInfo[transactionLogs[i].market].extraInfo).description
          ? JSON.parse(marketInfo[transactionLogs[i].market].extraInfo)
              .description
          : '',
      outcome: new BigNumber(transactionLogs[i].outcome).toNumber(),
      outcomeDescription: getOutcomeDescriptionFromOutcome(
        new BigNumber(transactionLogs[i].outcome).toNumber(),
        marketInfo[transactionLogs[i].market]
      ),
      price: new BigNumber(transactionLogs[i].price).toString(),
      quantity: new BigNumber(transactionLogs[i].amount).toString(),
      timestamp: new BigNumber(transactionLogs[i].timestamp).toNumber(),
      total: '0',
      transactionHash: transactionLogs[i].transactionHash,
    });
  }
  return formattedLogs;
}

function formatParticipationTokensRedeemedLogs(
  transactionLogs: ParticipationTokensRedeemedLog[]
): AccountTransaction[] {
  const formattedLogs: AccountTransaction[] = [];
  for (let i = 0; i < transactionLogs.length; i++) {
    formattedLogs.push({
      action: Action.CLAIM_PARTICIPATION_TOKENS,
      coin: Coin.ETH,
      details: 'Claimed reporting fees from participation tokens',
      fee: '0',
      marketDescription: '',
      outcome: null,
      outcomeDescription: null,
      price: '0',
      quantity: new BigNumber(
        transactionLogs[i].attoParticipationTokens
      ).toString(),
      timestamp: new BigNumber(transactionLogs[i].timestamp).toNumber(),
      total: new BigNumber(transactionLogs[i].feePayoutShare).toString(),
      transactionHash: transactionLogs[i].transactionHash,
    });
  }
  return formattedLogs;
}

async function formatTradingProceedsClaimedLogs(
  transactionLogs: TradingProceedsClaimedLog[],
  marketInfo: MarketCreatedInfo,
  db: DB
): Promise<AccountTransaction[]> {
  const formattedLogs: AccountTransaction[] = [];
  for (let i = 0; i < transactionLogs.length; i++) {
    const outcome = new BigNumber(transactionLogs[i].outcome).toNumber();
    const outcomeDescription = getOutcomeDescriptionFromOutcome(
      outcome,
      marketInfo[transactionLogs[i].market]
    );
    let orderFilledLogs = await db.findOrderFilledLogs({
      selector: {
        market: transactionLogs[i].market,
        outcome: transactionLogs[i].outcome,
      },
    });
    orderFilledLogs = orderFilledLogs.reverse();
    const price = orderFilledLogs[0].price;
    formattedLogs.push({
      action: Action.CLAIM_TRADING_PROCEEDS,
      coin: Coin.ETH,
      details: 'Claimed trading proceeds',
      fee: new BigNumber(transactionLogs[i].numShares)
        .times(price)
        .minus(transactionLogs[i].numPayoutTokens)
        .toString(),
      marketDescription:
        marketInfo[transactionLogs[i].market].extraInfo &&
        JSON.parse(marketInfo[transactionLogs[i].market].extraInfo).description
          ? JSON.parse(marketInfo[transactionLogs[i].market].extraInfo)
              .description
          : '',
      outcome,
      outcomeDescription,
      price: new BigNumber(price).toString(),
      quantity: new BigNumber(transactionLogs[i].numShares).toString(),
      timestamp: new BigNumber(transactionLogs[i].timestamp).toNumber(),
      total: new BigNumber(transactionLogs[i].numPayoutTokens).toString(),
      transactionHash: transactionLogs[i].transactionHash,
    });
  }
  return formattedLogs;
}

async function formatCrowdsourcerRedeemedLogs(
  transactionLogs:
    | InitialReporterRedeemedLog[]
    | DisputeCrowdsourcerRedeemedLog[],
  marketInfo: MarketCreatedInfo,
  params: t.TypeOf<typeof Accounts.getAccountTransactionHistoryParams>
): Promise<AccountTransaction[]> {
  const formattedLogs: AccountTransaction[] = [];
  for (let i = 0; i < transactionLogs.length; i++) {
    const market = marketInfo[transactionLogs[i].market];

    const payoutNumerators: BigNumber[] = [];
    for (
      let numeratorIndex = 0;
      numeratorIndex < transactionLogs[i].payoutNumerators.length;
      numeratorIndex++
    ) {
      payoutNumerators.push(
        new BigNumber(transactionLogs[i].payoutNumerators[numeratorIndex])
      );
    }
    const outcome = outcomeFromMarketLog(market, payoutNumerators);
    const outcomeDescription = getOutcomeDescriptionFromOutcome(
      outcome,
      market
    );
    if (params.coin === 'ETH' || params.coin === 'ALL') {
      formattedLogs.push({
        action: Action.CLAIM_WINNING_CROWDSOURCERS,
        coin: Coin.ETH,
        details: 'Claimed reporting fees from crowdsourcers',
        fee: '0',
        marketDescription:
          market.extraInfo &&
          JSON.parse(market.extraInfo)
            .description
            ? JSON.parse(market.extraInfo)
                .description
            : '',
        outcome,
        outcomeDescription,
        price: '0',
        quantity: '0',
        timestamp: new BigNumber(transactionLogs[i].timestamp).toNumber(),
        total: new BigNumber(transactionLogs[i].amountRedeemed).toString(),
        transactionHash: transactionLogs[i].transactionHash,
      });
    }
    if (params.coin === 'REP' || params.coin === 'ALL') {
      formattedLogs.push({
        action: Action.CLAIM_WINNING_CROWDSOURCERS,
        coin: Coin.REP,
        details: 'Claimed REP fees from crowdsourcers',
        fee: '0',
        marketDescription:
          market.extraInfo &&
          JSON.parse(market.extraInfo)
            .description
            ? JSON.parse(market.extraInfo)
                .description
            : '',
        outcome,
        outcomeDescription,
        price: '0',
        quantity: '0',
        timestamp: new BigNumber(transactionLogs[i].timestamp).toNumber(),
        total: new BigNumber(transactionLogs[i].repReceived).toString(),
        transactionHash: transactionLogs[i].transactionHash,
      });
    }
  }
  return formattedLogs;
}

function formatMarketCreatedLogs(
  transactionLogs: MarketCreatedLog[]
): AccountTransaction[] {
  const formattedLogs: AccountTransaction[] = [];
  for (let i = 0; i < transactionLogs.length; i++) {
    formattedLogs.push({
      action: Action.MARKET_CREATION,
      coin: Coin.ETH,
      details: 'ETH validity bond for market creation',
      fee: '0',
      marketDescription:
        transactionLogs[i].extraInfo &&
        JSON.parse(transactionLogs[i].extraInfo).description
          ? JSON.parse(transactionLogs[i].extraInfo).description
          : '',
      outcome: null,
      outcomeDescription: null,
      price: '0',
      quantity: '0',
      timestamp: new BigNumber(transactionLogs[i].timestamp).toNumber(),
      total: '0',
      transactionHash: transactionLogs[i].transactionHash,
    });
  }
  return formattedLogs;
}

async function formatDisputeCrowdsourcerContributionLogs(
  transactionLogs: DisputeCrowdsourcerContributionLog[],
  augur: Augur,
  marketInfo: MarketCreatedInfo
): Promise<AccountTransaction[]> {
  const formattedLogs: AccountTransaction[] = [];
  for (let i = 0; i < transactionLogs.length; i++) {
    const market = marketInfo[transactionLogs[i].market];
    const reportingParticipant = augur.contracts.getReportingParticipant(
      transactionLogs[i].disputeCrowdsourcer
    );
    const outcome = outcomeFromMarketLog(market, await reportingParticipant.getPayoutNumerators_());
    const outcomeDescription = getOutcomeDescriptionFromOutcome(
      outcome,
      market
    );
    formattedLogs.push({
      action: Action.DISPUTE,
      coin: Coin.REP,
      details: 'REP staked in dispute crowdsourcers',
      fee: '0',
      marketDescription:
        market.extraInfo &&
        JSON.parse(market.extraInfo).description
          ? JSON.parse(market.extraInfo)
              .description
          : '',
      outcome,
      outcomeDescription,
      price: '0',
      quantity: new BigNumber(transactionLogs[i].amountStaked).toString(),
      timestamp: new BigNumber(transactionLogs[i].timestamp).toNumber(),
      total: '0',
      transactionHash: transactionLogs[i].transactionHash,
    });
  }
  return formattedLogs;
}

async function formatInitialReportSubmittedLogs(
  transactionLogs: InitialReportSubmittedLog[],
  augur: Augur,
  marketInfo: MarketCreatedInfo
): Promise<AccountTransaction[]> {
  const formattedLogs: AccountTransaction[] = [];
  for (let i = 0; i < transactionLogs.length; i++) {
    const market = marketInfo[transactionLogs[i].market];
    const reportingParticipantAddress = await augur.contracts
      .marketFromAddress(transactionLogs[i].market)
      .getInitialReporter_();
    const reportingParticipant = augur.contracts.getReportingParticipant(
      reportingParticipantAddress
    );
    const outcome = outcomeFromMarketLog(market, await reportingParticipant.getPayoutNumerators_());
    const outcomeDescription = getOutcomeDescriptionFromOutcome(
      outcome,
      market
    );
    formattedLogs.push({
      action: Action.INITIAL_REPORT,
      coin: Coin.REP,
      details: 'REP staked in initial reports',
      fee: '0',
      marketDescription:
        market.extraInfo &&
        JSON.parse(market.extraInfo).description
          ? JSON.parse(market.extraInfo)
              .description
          : '',
      outcome,
      outcomeDescription,
      price: '0',
      quantity: new BigNumber(transactionLogs[i].amountStaked).toString(),
      timestamp: new BigNumber(transactionLogs[i].timestamp).toNumber(),
      total: '0',
      transactionHash: transactionLogs[i].transactionHash,
    });
  }
  return formattedLogs;
}

function formatCompleteSetsPurchasedLogs(
  transactionLogs: CompleteSetsPurchasedLog[],
  marketInfo: MarketCreatedInfo
): AccountTransaction[] {
  const formattedLogs: AccountTransaction[] = [];
  for (let i = 0; i < transactionLogs.length; i++) {
    formattedLogs.push({
      action: Action.COMPLETE_SETS,
      coin: Coin.ETH,
      details: 'Buy complete sets',
      fee: '0',
      marketDescription:
        marketInfo[transactionLogs[i].market].extraInfo &&
        JSON.parse(marketInfo[transactionLogs[i].market].extraInfo).description
          ? JSON.parse(marketInfo[transactionLogs[i].market].extraInfo)
              .description
          : '',
      outcome: null,
      outcomeDescription: null,
      price: new BigNumber(
        marketInfo[transactionLogs[i].market].numTicks
      ).toString(),
      quantity: new BigNumber(transactionLogs[i].numCompleteSets).toString(),
      timestamp: new BigNumber(transactionLogs[i].timestamp).toNumber(),
      total: '0',
      transactionHash: transactionLogs[i].transactionHash,
    });
  }
  return formattedLogs;
}

function formatCompleteSetsSoldLogs(
  transactionLogs: CompleteSetsSoldLog[],
  marketInfo: MarketCreatedInfo
): AccountTransaction[] {
  const formattedLogs: AccountTransaction[] = [];
  for (let i = 0; i < transactionLogs.length; i++) {
    formattedLogs.push({
      action: Action.COMPLETE_SETS,
      coin: Coin.ETH,
      details: 'Sell complete sets',
      fee: '0',
      marketDescription:
        marketInfo[transactionLogs[i].market].extraInfo &&
        JSON.parse(marketInfo[transactionLogs[i].market].extraInfo).description
          ? JSON.parse(marketInfo[transactionLogs[i].market].extraInfo)
              .description
          : '',
      outcome: null,
      outcomeDescription: null,
      price: new BigNumber(
        marketInfo[transactionLogs[i].market].numTicks
      ).toString(),
      quantity: new BigNumber(transactionLogs[i].numCompleteSets).toString(),
      timestamp: new BigNumber(transactionLogs[i].timestamp).toNumber(),
      total: '0',
      transactionHash: transactionLogs[i].transactionHash,
    });
  }
  return formattedLogs;
}

function outcomeFromMarketLog(market: MarketCreatedLog, payoutNumerators: BigNumber[]): number {
  return Number(calculatePayoutNumeratorsValue(
    convertOnChainAmountToDisplayAmount(new BigNumber(market.prices[1]), new BigNumber(market.numTicks)).toString(),
    convertOnChainAmountToDisplayAmount(new BigNumber(market.prices[0]), new BigNumber(market.numTicks)).toString(),
    new BigNumber(market.numTicks).toString(),
    marketTypeToName(market.marketType),
    payoutNumerators.map((bn) => bn.toString())));
}
