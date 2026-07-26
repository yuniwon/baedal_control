import type { ManagedPasswordManagerLoginDescriptor } from '../../services/managed-chrome-login-page-probe'
import { coupangEatsSelectors } from './selectors'

export const coupangEatsPasswordManagerLoginDescriptor = {
  platformCode: 'coupangeats',
  loginUrl: 'https://store.coupangeats.com/merchant/login',
  loginPathPattern: '^/merchant/login(?:/|$)',
  managementPathPattern: '^/merchant/management(?:/|$)',
  usernameSelector: coupangEatsSelectors.username,
  passwordSelector: coupangEatsSelectors.password,
  submitSelector: coupangEatsSelectors.loginButton
} as const satisfies ManagedPasswordManagerLoginDescriptor
