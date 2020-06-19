// Import modules
import * as async from 'async'

// Import interfaces
import { DeGiroClassInterface } from './interfaces'

// Import types
import {
  DeGiroSettupType,
  LoginResponseType,
  AccountConfigType,
  AccountDataType,
  CashFoundType,
  SearchProductResultType,
  GetPorfolioConfigType,
  SearchProductOptionsType,
  OrderType,
  CreateOrderResultType,
  IsLoginOptionsType,
  GetOrdersConfigType,
  GetOrdersResultType,
  GetAccountStateOptionsType,
  AccountReportsType,
  AccountInfoType,
  GetHistoricalOrdersOptionsType,
  HistoricalOrdersType,
  FavouriteProductType,
  StockType,
  GetNewsOptionsType,
  NewsType,
  WebUserSettingType,
  ConfigDictionaryType,
} from './types'

// Import requests
import {
  loginRequest,
  getAccountConfigRequest,
  getAccountDataRequest,
  getPortfolioRequest,
  getProductsByIdsRequest,
  searchProductRequest,
  createOrderRequest,
  executeOrderRequest,
  deleteOrderRequest,
  logoutRequest,
  getOrdersRequest,
  getAccountStateRequest,
  getConfigDictionaryRequest,
  getAccountInfoRequest,
} from './requests'

/**
 * @class DeGiro
 * @description Main class of DeGiro Unofficial API.
 */
export class DeGiro implements DeGiroClassInterface {

  /* Properties */

  private readonly username: string
  private readonly pwd: string
  private jsessionId: string | undefined
  private accountConfig: AccountConfigType | undefined
  private accountData: AccountDataType | undefined

  /* Constructor and generator function */

  constructor(params: DeGiroSettupType = {}) {
    let { username, pwd, jsessionId } = params

    username = username || process.env['DEGIRO_USER']
    pwd = pwd || process.env['DEGIRO_PWD']
    jsessionId = jsessionId || process.env['DEGIRO_JSESSIONID']

    if (!username) throw new Error('DeGiro api needs an username to access')
    if (!pwd) throw new Error('DeGiro api needs an password to access')

    this.username = username
    this.pwd = pwd

    this.jsessionId = jsessionId
  }

  static create(params: DeGiroSettupType): DeGiro {
    return new DeGiro(params)
  }

  /* Session methods */

  login(): Promise<AccountDataType> {
    if (this.jsessionId) return this.loginWithJSESSIONID(this.jsessionId)
    return new Promise((resolve, reject) => {
      loginRequest({ username: this.username, pwd: this.pwd })
        .then((loginResponse: LoginResponseType) => {
          if (!loginResponse.sessionId) reject('Login response have not a sessionId field')
          else return this.getAccountConfig(loginResponse.sessionId)
        })
        .then(() => this.getAccountData())
        .then(resolve)
        .catch(reject)
    })
  }

  logout(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.accountData || !this.accountConfig) {
        return reject('You must log in first')
      }
      logoutRequest(this.accountData, this.accountConfig)
        .then(() => {
          delete this.accountData
          delete this.accountConfig
          resolve()
        })
        .catch(reject)
    })
  }

  isLogin(options?: IsLoginOptionsType): boolean | Promise<boolean> {
    if (!options || !options.secure) return this.hasSessionId() && !!this.accountData
    return new Promise((resolve) => {
      this.getAccountConfig()
        .then(() => resolve(true))
        .catch(() => resolve(false))
    })
  }

  private hasSessionId = (): boolean => !!this.accountConfig && !!this.accountConfig.data && !!this.accountConfig.data.sessionId

  private loginWithJSESSIONID(jsessionId: string): Promise<AccountDataType> {
    return new Promise((resolve, reject) => {
      this.getAccountConfig(jsessionId)
        .then(() => this.getAccountData())
        .then((accountData) => {
          this.jsessionId = undefined // Remove the jsessionId to prevent reuse
          resolve(accountData)
        })
        .catch(reject)
    })
  }

  getJSESSIONID = () => this.hasSessionId() ? (<AccountConfigType>this.accountConfig).data.sessionId : undefined

  /* Account methods */

  getAccountConfig(sessionId?: string): Promise<AccountConfigType> {
    return new Promise((resolve, reject) => {
      if (!sessionId && !this.hasSessionId()) {
        return reject('You must log in first or provide a JSESSIONID')
      }
      getAccountConfigRequest(sessionId || (<AccountConfigType>this.accountConfig).data.sessionId)
        .then((accountConfig: AccountConfigType) => {
          this.accountConfig = accountConfig
          resolve(accountConfig)
        })
        .catch(reject)
    })
  }

  getAccountData(): Promise<AccountDataType> {
    return new Promise((resolve, reject) => {
      if (!this.hasSessionId()) {
        return reject('You must log in first')
      }
      getAccountDataRequest(<AccountConfigType>this.accountConfig)
        .then((accountData: AccountDataType) => {
          this.accountData = accountData
          resolve(accountData)
        })
        .catch(reject)
    })
  }

  getAccountState(options: GetAccountStateOptionsType): Promise<any[]> {
    if (!this.hasSessionId()) {
      return Promise.reject('You must log in first')
    }
    return getAccountStateRequest(<AccountDataType>this.accountData, <AccountConfigType>this.accountConfig, options)
  }

  getAccountReports(): Promise<AccountReportsType> {
    return new Promise((resolve, reject) => {
      reject('Method not implemented')
    })
  }

  getAccountInfo(): Promise<AccountInfoType> {
    if (!this.hasSessionId()) {
      return Promise.reject('You must log in first')
    }
    return getAccountInfoRequest(<AccountDataType>this.accountData, <AccountConfigType>this.accountConfig)
  }

  /* Search methods */

  searchProduct(options: SearchProductOptionsType): Promise<SearchProductResultType[]> {
    if (!this.hasSessionId()) {
      return Promise.reject('You must log in first')
    }
    return searchProductRequest(options, <AccountDataType>this.accountData, <AccountConfigType>this.accountConfig)
  }

  /* Cash Funds methods */

  getCashFunds(): CashFoundType[] {
    throw new Error('Method not implemented.')
  }

  /* Porfolio methods */

  getPortfolio(config: GetPorfolioConfigType): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.hasSessionId()) {
        return reject('You must log in first')
      }
      getPortfolioRequest(<AccountDataType>this.accountData, <AccountConfigType>this.accountConfig, config)
        .then(portfolio => this.completePortfolioDetails(portfolio, config.getProductDetails || false))
        .then(resolve)
        .catch(reject)
    })
  }

  private completePortfolioDetails(portfolio: any[], getProductDetails: boolean): Promise<any[]> {
    if (!getProductDetails) return Promise.resolve(portfolio)
    return new Promise((resolve, reject) => {
      async.map(portfolio, (position, next) => {
        if (position.positionType !== 'PRODUCT') return next(null, position)
        this.getProductsByIds([(position.id)])
          .then((product) => {
            position.productData = product[position.id]
            next(null, position)
          })
          .catch(error => next(error))
      // tslint:disable-next-line: align
      }, (error, portfolio) => {
        if (error) return reject(error)
        resolve(portfolio)
      })
    })
  }

  /* Stocks methods */

  getFavouriteProducts(): Promise<FavouriteProductType[]> {
    return new Promise((resolve, reject) => {
      reject('Method not implemented')
    })
  }

  getPopularStocks(): Promise<StockType[]> {
    return new Promise((resolve, reject) => {
      reject('Method not implemented')
    })
  }

  /* Orders methods */

  getOrders (config: GetOrdersConfigType): Promise<GetOrdersResultType> {
    if (!this.hasSessionId()) {
      return Promise.reject('You must log in first')
    }
    return getOrdersRequest(<AccountDataType>this.accountData, <AccountConfigType>this.accountConfig, config)
  }

  getHistoricalOrders(options: GetHistoricalOrdersOptionsType): Promise<HistoricalOrdersType> {
    return new Promise((resolve, reject) => {
      reject('Method not implemented')
    })
  }

  createOrder(order: OrderType): Promise<CreateOrderResultType> {
    if (!this.hasSessionId()) {
      return Promise.reject('You must log in first')
    }
    return createOrderRequest(order, <AccountDataType>this.accountData, <AccountConfigType>this.accountConfig)
  }

  executeOrder(order: OrderType, executeId: String): Promise<String> {
    if (!this.hasSessionId()) {
      return Promise.reject('You must log in first')
    }
    return executeOrderRequest(order, executeId, <AccountDataType>this.accountData, <AccountConfigType>this.accountConfig)
  }

  deleteOrder(orderId: String): Promise<void> {
    if (!this.hasSessionId()) {
      return Promise.reject('You must log in first')
    }
    return deleteOrderRequest(orderId, <AccountDataType>this.accountData, <AccountConfigType>this.accountConfig)
  }

  /* Miscellaneous methods */

  getProductsByIds(ids: string[]): Promise<any[]> {
    if (!this.hasSessionId()) {
      return Promise.reject('You must log in first')
    }
    return getProductsByIdsRequest(ids, <AccountDataType>this.accountData, <AccountConfigType>this.accountConfig)
  }

  getNews(options: GetNewsOptionsType): Promise<NewsType> {
    return new Promise((resolve, reject) => {
      reject('Method not implemented')
    })
  }

  getWebi18nMessages(): Promise<any> {
    return new Promise((resolve, reject) => {
      reject('Method not implemented')
    })
  }

  getWebSettings(): Promise<any> {
    return new Promise((resolve, reject) => {
      reject('Method not implemented')
    })
  }

  getWebUserSettings(): Promise<WebUserSettingType> {
    return new Promise((resolve, reject) => {
      reject('Method not implemented')
    })
  }

  getConfigDictionary(): Promise<ConfigDictionaryType> {
    if (!this.hasSessionId()) {
      return Promise.reject('You must log in first')
    }
    return getConfigDictionaryRequest(<AccountDataType>this.accountData, <AccountConfigType>this.accountConfig)
  }

}