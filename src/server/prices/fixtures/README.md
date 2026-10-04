# Price fixtures

- `frankfurter-usd-idr.json`: USD/IDR daily reference rates, 2020-10-01 to 2026-10-02, recorded on
  2026-10-04 from Frankfurter (https://api.frankfurter.dev), which publishes the **European Central
  Bank's euro foreign exchange reference rates**. Source: ECB, via Frankfurter. Used only with
  `PRICES_FRANKFURTER=fixtures` (tests).
- There is **no recorded Yahoo data** here. Yahoo's terms forbid automated collection and
  redistribution (D9); `PRICES_YAHOO=fixtures` uses a synthetic, made-up history generated in
  Yahoo's response shape (`syntheticChart` in `../yahoo.ts`), stored with `source = "synthetic"`.
- No recorded gold-api.com, Binance or Indodax data either (OR-27). Their fixtures modes generate
  made-up replies in each API's documented shape (`syntheticSpot` in `../goldapi.ts`,
  `syntheticKlines` in `../binance.ts`, and the Indodax ticker in `../indodax.ts`), stored with
  `source = "synthetic"`. Metal histories use the synthetic GC=F / SI=F futures.
