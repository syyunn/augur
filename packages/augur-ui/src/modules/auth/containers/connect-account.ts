import { connect } from 'react-redux';
import ConnectAccount from 'modules/auth/components/connect-account/connect-account';
import {
  updateAuthStatus,
  IS_CONNECTION_TRAY_OPEN,
} from 'modules/auth/actions/auth-status';
import { loadUniverseDetails } from 'modules/universe/actions/load-universe-details';
import { updateMobileMenuState } from 'modules/app/actions/update-sidebar-status';

const mapStateToProps = state => ({
  isLogged: state.authStatus.isLogged,
  universeId: state.universe.id,
  userInfo: state.loginAccount.meta,
  isConnectionTrayOpen: state.authStatus.isConnectionTrayOpen,
  mobileMenuState: state.sidebarStatus.mobileMenuState,
});

const mapDispatchToProps = dispatch => ({
  updateMobileMenuState: data => dispatch(updateMobileMenuState(data)),
  updateConnectionTray: value =>
    dispatch(updateAuthStatus(IS_CONNECTION_TRAY_OPEN, value)),
  loadUniverseDetails: (universe, account) =>
    dispatch(loadUniverseDetails(universe, account))
});

const mergeProps = (sP: any, dP: any, oP: any) => {
  if (sP.isLogged) {
    dP.loadUniverseDetails(sP.universeId, sP.userInfo.address);
  }
  return {
    ...oP,
    ...sP,
    ...dP,
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps
)(ConnectAccount);
