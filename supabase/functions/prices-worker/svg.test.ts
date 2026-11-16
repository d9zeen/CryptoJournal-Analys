import { describe, expect, it } from 'vitest'
import { parseTvScan, pickLogoId, safeSvg, svgColor, tradingViewLogo } from './svg'

const btc = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><path fill="#F7931A" d="M0 0h18v18H0z"/><path fill="#fff" d="M5 5h8v8H5z"/></svg>'

describe('логотипы TradingView', () => {
  it('обычный логотип проходит', () => {
    expect(safeSvg(btc)).toBe(btc)
    expect(safeSvg(`<?xml version="1.0"?>\n${btc}`)).not.toBeNull()
    // так начинаются настоящие файлы TradingView (сверено 16.11.2026)
    expect(safeSvg(`<!-- by TradingView -->${btc}`)).not.toBeNull()
    const grad = '<svg viewBox="0 0 1 1"><defs><linearGradient id="g"><stop stop-color="#9945FF"/><stop offset="1" stop-color="#14F195"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1v1H0z"/></svg>'
    expect(safeSvg(grad)).toBe(grad)
  })
  it('скрипты, обработчики, внешние ссылки и вложенные картинки — нет', () => {
    for (const bad of [
      '<svg><script>alert(1)</script></svg>',
      '<svg onload="alert(1)"><path/></svg>',
      '<svg><a href="javascript:alert(1)"><path/></a></svg>',
      '<svg><a href="https://evil.example"><path/></a></svg>',
      '<svg><use xlink:href="https://evil.example/x.svg#a"/></svg>',
      '<svg><image href="data:image/png;base64,AAAA"/></svg>',
      '<svg><foreignObject><div/></foreignObject></svg>',
      '<svg><style>@import url(https://evil.example/a.css)</style></svg>',
      '<svg><path style="fill:url(https://evil.example/x)"/></svg>',
      '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>',
      '<html><body>not svg</body></html>',
      '',
    ])
      expect(safeSvg(bad), bad).toBeNull()
  })
  it('цвет монеты — из логотипа: белую букву и чёрный фон не берём', () => {
    expect(svgColor(btc)).toBe('#f7931a')
    expect(svgColor('<svg><circle fill="#000" r="9"/><path fill="#97FCE4"/><path fill="#97FCE4"/></svg>')).toBe('#97fce4')
    expect(svgColor('<svg><path fill="#fff"/><path fill="#000"/></svg>')).toBeNull()
    // насыщенный важнее серого, даже если серого больше
    expect(svgColor('<svg><path fill="#777"/><path fill="#777"/><path fill="#26A17B"/></svg>')).toBe('#26a17b')
    expect(svgColor('<svg><path style="fill:#627EEA"/></svg>')).toBe('#627eea')
  })
  it('почти чёрный (XRP: #1A1E21) — не цвет монеты', () => {
    expect(svgColor('<svg><stop stop-color="#1A1E21"/><stop stop-color="#06060A"/><path fill="#fff"/></svg>')).toBeNull()
  })
  it('логотип — по тикеру и названию из рейтинга TradingView (HYPE у них — две разные монеты)', () => {
    // настоящий ответ сканера (сверено 16.11.2026) + чужая монета с тем же тикером
    const list = parseTvScan({
      totalCount: 3,
      data: [
        { s: 'CRYPTO:BTCUSD', d: ['BTC', 'Bitcoin', 'crypto/XTVCBTC', 1] },
        { s: 'CRYPTO:HYPEHUSD', d: ['HYPE', 'Hyperliquid', 'crypto/XTVCHYPEH', 9] },
        { s: 'CRYPTO:HYPEUSD', d: ['HYPE', 'Hype Token', 'crypto/XTVCHYPE', 1800] },
        { s: 'X', d: ['EVIL', 'Evil', '../../etc/passwd', 5] },
      ],
    })
    expect(list).toHaveLength(3)
    expect(pickLogoId(list, 'HYPE', 'Hyperliquid')).toBe('crypto/XTVCHYPEH')
    expect(pickLogoId(list, 'BTC', 'Bitcoin')).toBe('crypto/XTVCBTC')
    expect(pickLogoId(list, 'USDT', 'Tether')).toBeNull()
    // название другое и монета далеко в рейтинге — не берём
    expect(pickLogoId([{ symbol: 'ABC', name: 'Other', logoid: 'crypto/XTVCABC', rank: 900 }], 'ABC', 'Alpha')).toBeNull()
    expect(tradingViewLogo('crypto/XTVCBTC')).toBe('https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC.svg')
  })
})
