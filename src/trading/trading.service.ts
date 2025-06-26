import { Injectable, Logger } from '@nestjs/common';
import {
  AlorApi,
  Condition,
  Exchange,
  Format,
  HistoryObject,
  Side,
} from 'alor-api';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TradingService {
  private readonly lvl_1 =
    'GAZP SBER SBERP LKOH NVTK GMKN ROSN TATN TATNP PLZL POLY MOEX MTSS MGNT SNGS SNGSP AFKS VTBR PHOR RUAL HYDR ALRS CHMF NLMK TRNFP YNDX OZON';

  private readonly lvl_2 =
    'AFLT VEON-RX FIVE PIKK QIWI TCSG LSRG MVID RENI MRKY RTKM AGRO FEES CNTL CIAN UPRO SFIN FLOT SVAV MRKZ MRKC MRKP KMAZ KZOS KZOSP PMSB PMSBP RNFT RUGR SELG SGZH SMLT SPBE TTLK TRMK UGLD ABRD AKRN APTK BELU BLNG BSPB CBOM DSKY DVEC ETLN FESH FRHC GECO GEMC GLTR HHRU IRAO KAZT KAZTP KROT LENT LNZL LNZLP MGTSP MRKV MRKS MRKU MSTT MSNG NMTP NKNC NKNCP NKHP OGKB RKKE ROLO SFTL SIBN VSMO WUSH';

  private readonly lvl_3 =
    'AQUA ABIO AMEZ BANE BANEP CARM DIAS EUTR ELFV ENPG FIXP GTRK GCHE HHRU IRKT KLSB KRKNP LSNG LSNGP MDMG MTLR MTLRP NSVZ OKEY POSI RASP RTKMP SVCB UNAC UNKL UWGN YAKG DELI';

  private readonly MAX_DIFF = 0.015; // 1,5%;
  private readonly MIN_DIFF = 0.006; // 0,6%;

  private readonly logger = new Logger(TradingService.name);
  constructor(
    private readonly alor: AlorApi,
    private readonly config: ConfigService,
  ) {
    this.start();
  }

  async start() {
    const tickers = [
      ...this.lvl_1.split(' '),
      ...this.lvl_2.split(' '),
      ...this.lvl_3.split(' '),
    ];

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      await this.processStock(ticker);
    }
  }

  async sendMarketOrder(ticker: string, quantity: number) {
    if (quantity < 1) {
      return undefined;
    }
    let orderResult;
    try {
      orderResult = await this.alor.orders.sendMarketOrder({
        quantity,
        user: {
          portfolio: this.config.get('ALOR_PORTFOLIO'),
        },
        instrument: {
          symbol: ticker,
          exchange: Exchange.MOEX,
        },
        type: 'market',
        side: Side.Buy,
      });
    } catch (e) {
      this.logger.error(e);
    }

    return orderResult;
  }

  async estimateOrder(ticker: string, price: number) {
    let estimate;
    try {
      estimate = await this.alor.orders.estimateOrder({
        ticker,
        exchange: Exchange.MOEX,
        price,
        portfolio: this.config.get('ALOR_PORTFOLIO'),
      });
    } catch (e) {
      this.logger.error(e);
    }
    return estimate?.quantityToBuy;
  }

  async sendTakeProfit(ticker: string, quantity: number, price: number) {
    if (quantity < 1) {
      return undefined;
    }
    let orderResult;
    try {
      orderResult = await this.alor.orders.sendLimitOrder({
        quantity,
        user: {
          portfolio: this.config.get('ALOR_PORTFOLIO'),
        },
        type: 'limit',
        price,
        side: Side.Sell,
        instrument: {
          symbol: ticker,
          exchange: Exchange.MOEX,
        },
      });
    } catch (e) {
      this.logger.error(e);
    }

    return orderResult;
  }

  async sendStopLoss(ticker: string, quantity: number, triggerPrice: number) {
    if (quantity < 1) {
      return undefined;
    }
    let orderResult;
    try {
      orderResult = await this.alor.stoporders.sendStopOrder({
        quantity,
        user: {
          portfolio: this.config.get('ALOR_PORTFOLIO'),
        },
        condition: Condition.Less,
        triggerPrice,
        side: Side.Sell,
        instrument: {
          symbol: ticker,
          exchange: Exchange.MOEX,
        },
      });
    } catch (e) {
      this.logger.error(e);
    }

    return orderResult;
  }

  async processStock(ticker: string) {
    const percent = this.lvl_1.includes(ticker) ? this.MIN_DIFF : this.MAX_DIFF;
    try {
      await this.alor.subscriptions.candles(
        {
          tf: '60',
          format: Format.Simple,
          code: ticker,
          exchange: Exchange.MOEX,
          from: Math.round(Date.now() / 1000),
        },
        async (candle) => {
          const result = this.calculateTazik(candle, percent);
          if (result) {
            const quantity = await this.estimateOrder(ticker, candle.close);
            if (quantity >= 1) {
              const orderResult = await this.sendMarketOrder(ticker, quantity);
              // @ts-ignore
              if (orderResult?.orderNumber) {
                this.logger.log(
                  `[${ticker}] Покупка ${quantity} лотов по цене ${candle.close}`,
                );
                const tpResult = await this.sendTakeProfit(
                  ticker,
                  quantity,
                  candle.open,
                );
                if (tpResult?.orderNumber) {
                  this.logger.log(
                    `[${ticker}] Тейк-профит по цене ${candle.open}`,
                  );
                }

                const stopPrice = await this.calculateStopPrice(
                  ticker,
                  candle.close,
                );
                if (stopPrice) {
                  await this.sendStopLoss(ticker, quantity, stopPrice);
                }
              }
            }
            this.logger.log(`[${ticker}] ${result}`);
          }
        },
      );
      this.logger.log(`[${ticker}] Получаем свечки`);
    } catch (e) {}
  }

  async calculateStopPrice(ticker: string, openPrice: number) {
    const orderbook = await this.alor.instruments.getOrderbookBySeccode({
      format: Format.Simple,
      exchange: Exchange.MOEX,
      seccode: ticker,
      depth: 50,
    });

    if (!orderbook?.bids.length) {
      return 0;
    }

    const sortedBids = orderbook.bids.sort((a, b) => b.volume - a.volume);
    const filteredBids = sortedBids.filter((b) => b.price < openPrice);
    if (!filteredBids.length) {
      return 0;
    }
    return filteredBids[0].price;
  }

  calculateTazik(candle: HistoryObject, percent: number) {
    const { open, close } = candle;
    const diff = open - close;
    const result = diff / open;
    if (result >= percent) {
      return result;
    }
    return undefined;
  }
}
