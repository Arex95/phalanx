/**
 * Double Submit Cookie config for the refresh/logout requests — see
 * `config/global/csrfConfig.ts` for the full reasoning.
 */
export interface CsrfConfig {
  headerName: string;
  cookieName: string;
}
