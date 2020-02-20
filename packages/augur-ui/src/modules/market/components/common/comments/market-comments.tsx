import React, { Component } from 'react';
import Box from '3box';
import Comments from '3box-comments-react';

import Styles from 'modules/market/components/market-view/market-view.styles.less';

export class MarketComments extends Component {
  state = {
    box: {},
    myProfile: {},
    myAddress: '',
    isReady: false,
  };

  componentDidMount(): void {
    this.handleLogin();
  };

  handleLogin = async () => {
    const addresses = await window.ethereum.enable();
    const myAddress = addresses[0];
    console.log('myAddress', myAddress);

    const box = await Box.openBox(myAddress, window.ethereum);
    console.log('box', box);

    box.onSyncDone(() => {
      this.setState({box, myAddress, isReady: true});
    });
  };

  render () {
    const {
      box,
      myAddress,
      isReady,
    } = this.state;

    return (
      <section style={{backgroundColor: "#ddd"}}>
        3Box Comment Plugin
        {isReady && (
          <Comments
            // required
            spaceName="3boxtestcomments"
            threadName="explicitNestLevel6"
            adminEthAddr="0x2a0D29C819609Df18D8eAefb429AEC067269BBb6"

            // Required props for context A) & B)
            box={box}
            currentUserAddr={myAddress}

            // Required prop for context B
            // loginFunction={this.handleLogin}

            // Required prop for context C)
            // ethereum={window.ethereum}

            // optional
            // members={false}
            // showCommentCount={10}
            // threadOpts={{}}
            // useHovers={false}
            // currentUser3BoxProfile={currentUser3BoxProfile}
            // userProfileURL={address => `https://mywebsite.com/user/${address}`}
          />
        )}
      </section>
    );
  }
}
