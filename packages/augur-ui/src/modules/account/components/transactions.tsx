import React from 'react';

import QuadBox from 'modules/portfolio/components/common/quad-box';
import {
  DepositButton,
  WithdrawButton,
  ViewTransactionsButton,
  REPFaucetButton,
  DAIFaucetButton,
  ApprovalButton,
} from 'modules/common/buttons';
import Styles from 'modules/account/components/transactions.styles.less';

interface TransactionsProps {
  showFaucets: boolean;
  repFaucet: Function;
  daiFaucet: Function;
  deposit: Function;
  withdraw: Function;
  transactions: Function;
  approval: Function;
  addFunds: Function;
  legacyRepFaucet: Function;
}

export const Transactions = ({
  transactions,
  addFunds,
  withdraw,
  showFaucets,
  repFaucet,
  daiFaucet,
  legacyRepFaucet,
}: TransactionsProps) => (
  <QuadBox
    title="Transactions"
    content={
      <div className={Styles.Content}>
        <div>
          <h4>Your transactions history</h4>
          <ViewTransactionsButton action={transactions} />
        </div>
        <div>
          <h4>Your funds</h4>
          <DepositButton action={addFunds} />
          <WithdrawButton action={withdraw} />
        </div>
        {showFaucets && (
          <div>
            <h4>REP for test net</h4>
            <h4>DAI for test net</h4>
            <REPFaucetButton action={repFaucet} />
            <DAIFaucetButton action={daiFaucet} />
          </div>
        )}
        {showFaucets && (
          <div>
            <h4>Legacy REP</h4>
            <REPFaucetButton
              title="Legacy REP Faucet"
              action={legacyRepFaucet}
            />
          </div>
        )}
      </div>
    }
  />
);
