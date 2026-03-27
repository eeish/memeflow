# Cord Tokenomics & Mechanics

## Phase 1 — Share Market

### Overview

Each creator has a single shared `Market` object. Participation is capped at **30 holders**, with exactly one share per wallet. The creator must purchase the first share upon market creation. All SUI revenue accumulates in a non-withdrawable treasury until graduation.

### Bonding Curve

The price (in SUI) for the **x-th share** is:

$$p(x) = 0.02 + \frac{0.35}{x + 3} + \frac{1}{38 - x}, \quad x \in \{1, \ldots, 30\}$$

Internally computed in MIST (1 SUI = 10⁹ MIST) using integer division:

$$p(x)_{\text{mist}} = 20{,}000{,}000 + \left\lfloor \frac{350{,}000{,}000}{x + 3} \right\rfloor + \left\lfloor \frac{1{,}000{,}000{,}000}{38 - x} \right\rfloor$$

The denominator base `38` is derived as `max_supply + 8` (configured per deployment). On testnet `max_supply = 2`, so `TERM2_DENOM_BASE = 10`.

### Buy / Sell Pricing

| Action | Price argument |
|--------|---------------|
| **Buy** | $p(\text{holders} + 1)$ — price of becoming the next holder |
| **Sell (gross)** | $p(\text{holders})$ — bonding curve value at current holder count |
| **Sell (net)** | $p(\text{holders}) \times \frac{8{,}500}{10{,}000}$ — actual payout after 15% fee |

This creates a **spread**: the buy price is always strictly greater than the net sell refund at the same holder count.

### Sell Fee

A **15% fee** (`SELL_FEE_BPS = 1_500`) is deducted from every sell refund and retained in the market treasury:

$$\text{net\_refund} = \left\lfloor p(\text{holders}) \times \frac{10{,}000 - 1{,}500}{10{,}000} \right\rfloor = \left\lfloor p(\text{holders}) \times 0.85 \right\rfloor$$

$$\text{fee} = p(\text{holders}) - \text{net\_refund}$$

The fee is **not extracted** — it remains in the treasury, increasing the liquidity available for the Phase 2 AMM pool. The treasury balance check is performed against `net_refund` only (the fee portion was never deducted from the treasury to begin with).

### Selected Price Points (mainnet, max\_supply = 30)

| x | p(x) (SUI) |
|---|-----------|
| 1  | ≈ 0.1345 |
| 10 | ≈ 0.0914 |
| 20 | ≈ 0.0973 |
| 30 | ≈ 0.1556 |

The curve is U-shaped: cheapest around x = 10–15, expensive at the extremes due to the divergent $1/(38-x)$ term.

### Constraints

- **One share per wallet.** A wallet cannot hold more than one share.
- **Creator cannot buy their own shares** after market creation.
- **No creator withdraw.** The treasury is locked until graduation.
- **Buy/sell disabled after graduation.**
- **Sells do not reset graduation progress.** The `total_buys` counter is cumulative and never decremented.

---

## Phase 2 — Token Graduation

### Graduation Trigger

Graduation can be initiated (by creator or platform admin) once the **cumulative buy count** reaches the threshold, regardless of current holder count:

$$\text{total\_buys} \geq \text{graduation\_limit} = \text{max\_supply} = 30$$

Sells reduce `holders` but have no effect on `total_buys`. A market where supporters have repeatedly bought and sold can still graduate once the cumulative buy volume crosses the threshold. Upon graduation the market is **locked** — no further share buys or sells are permitted.

### Token Registration & Holder Distribution

The creator publishes a bespoke `Coin<T>` package and registers its `TreasuryCap<T>` with the `GraduationRegistry`. At registration time, every Phase 1 holder is immediately airdropped:

$$\text{tokens\_per\_holder} = 1{,}000{,}000{,}000{,}000 \text{ raw units} = 1{,}000 \text{ tokens (9 decimals)}$$

Total tokens minted at registration = $1{,}000 \times \text{holder\_count}$.

The remaining `TreasuryCap<T>` is stored in a shared `CreatorTokenVault<T>` for subsequent liquidity operations.

### AMM Pool Initialization

The Phase 1 treasury (all accumulated SUI) is drained and paired with freshly minted creator tokens to seed a protocol-owned constant-product AMM pool.

#### Swap Formula

For a swap with input $\Delta_{\text{in}}$ and fee rate $f$ (in basis points, $f < 10{,}000$):

$$\Delta_{\text{in}}^* = \Delta_{\text{in}} \times \frac{10{,}000 - f}{10{,}000}$$

$$\Delta_{\text{out}} = \left\lfloor \frac{\Delta_{\text{in}}^* \times R_{\text{out}}}{R_{\text{in}} \times 10{,}000 + \Delta_{\text{in}}^*} \right\rfloor$$

where $R_{\text{in}}$ and $R_{\text{out}}$ are the current pool reserves. This is standard **x·y = k** constant-product pricing with a fee applied to the input.

#### Spot Price

$$\text{spot price (MIST/token)} = \left\lfloor \frac{R_{\text{SUI}} \times 10^9}{R_{\text{token}}} \right\rfloor$$

#### AMM Properties

- **Protocol-owned liquidity.** No LP token positions in v1; there is no external liquidity provision.
- **Fees remain in pool.** Swap fees accrue to the pool reserves, increasing $k$ over time.
- **Slippage protection.** Both swap entry points accept a `min_out` parameter; the transaction aborts if output falls below it.
- **Exact-input swaps only.** Both `buy_exact_sui_for_tokens` and `sell_exact_tokens_for_sui` take a fixed input amount.

---

## Summary of Key Parameters

| Parameter | Mainnet | Testnet |
|-----------|---------|---------|
| `max_supply` (Phase 1 cap) | 30 | 2 |
| `graduation_limit` | 30 | 2 |
| `TERM2_DENOM_BASE` | 38 | 10 |
| `PRICE_BASE` | 0.02 SUI | 0.02 SUI |
| `PRICE_TERM1_NUM` | 0.35 SUI | 0.35 SUI |
| `PRICE_TERM2_NUM` | 1.00 SUI | 1.00 SUI |
| `TOKENS_PER_HOLDER` | 1,000 tokens | 1,000 tokens |
| `SELL_FEE_BPS` | 1,500 (15%) | 1,500 (15%) |
| AMM fee | configurable (`fee_bps`) | configurable |
