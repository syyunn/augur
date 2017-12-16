import { connect } from 'react-redux'
import { withRouter } from 'react-router-dom'
import TopicsView from 'modules/categories/components/categories-view/categories-view'

import { selectLoginAccount } from 'modules/auth/selectors/login-account'
import { selectTopics } from 'modules/categories/selectors/categories'

const mapStateToProps = state => ({
  universe: state.universe,
  isMobile: state.isMobile,
  topics: selectTopics(state),
  loginAccount: selectLoginAccount(state),
  isLogged: state.isLogged
})

const Topics = withRouter(connect(mapStateToProps)(TopicsView))

export default Topics
