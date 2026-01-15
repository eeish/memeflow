module memeflow::social_follow {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use sui::tx_context::{Self as tx};

    /// =============================
    /// 常量 & 错误码
    /// =============================
    const PRICE_DENOM: u64 = 16000;               // price = S^2 / 16000 (以 SUI 计价)
    const MIST_PER_SUI: u64 = 1_000_000_000;      // 1 SUI = 1e9 MIST
    const NEW_USER_FREE_FOLLOWS: u64 = 7;         // 新用户免费关注额度

    const E_SELF_FOLLOW: u64 = 1;
    const E_NOT_OWNER: u64 = 2;
    const E_SPONSOR_EXHAUSTED: u64 = 3;
    const E_NOT_FOLLOWING: u64 = 4;
    const E_OVERFLOW: u64 = 5;
    const E_INSUFFICIENT_PAYMENT: u64 = 6;

    /// =============================
    /// 事件
    /// =============================
    public struct Followed has copy, drop {
        follower: address,
        followee: address,
    }

    public struct Unfollowed has copy, drop {
        follower: address,
        followee: address,
    }

    public struct BoughtKey has copy, drop {
        buyer: address,
        seller: address,
        price_mist: u64,     // 本次支付（MIST）
        sponsored: bool,
        new_supply: u64,
    }

    public struct SoldKey has copy, drop {
        seller: address,      // 卖出 Key 的地址（原持有者）
        target: address,      // Key 所属的创作者地址
        refund_mist: u64,
        new_supply: u64,
    }

    /// =============================
    /// 核心对象
    /// =============================

    /// 个人的关注簿（owned 对象）—— 只记录"我关注了谁"
    public struct FollowBook has key, store {
        id: object::UID,
        owner: address,
        following: Table<address, bool>,
        following_count: u64,
        sponsor_left: u64, // 新用户前 N 次免费关注
    }

    /// 每个创作者的市场（owned 对象）
    public struct Market has key, store {
        id: object::UID,
        owner: address,
        supply: u64,                 // 已发行 Key 数量（= 关注我的人数）
        treasury: Balance<SUI>,      // 卖出 Key 累计收入
    }

    /// =============================
    /// 创建/初始化
    /// =============================

    /// 一键创建：同时初始化 FollowBook 与 Market，便于新用户上手
    public entry fun create_profile(ctx: &mut TxContext) {
        let sender = tx::sender(ctx);

        // FollowBook
        let fb = FollowBook {
            id: object::new(ctx),
            owner: sender,
            following: table::new(ctx),
            following_count: 0,
            sponsor_left: NEW_USER_FREE_FOLLOWS,
        };
        transfer::transfer(fb, sender);

        // Market
        let mk = Market {
            id: object::new(ctx),
            owner: sender,
            supply: 0,
            treasury: balance::zero<SUI>(),
        };
        transfer::transfer(mk, sender);
    }

    /// 只创建 FollowBook（如需独立步骤）
    public entry fun create_follow_book(ctx: &mut TxContext) {
        let sender = tx::sender(ctx);
        let fb = FollowBook {
            id: object::new(ctx),
            owner: sender,
            following: table::new(ctx),
            following_count: 0,
            sponsor_left: NEW_USER_FREE_FOLLOWS,
        };
        transfer::transfer(fb, sender);
    }

    /// 只创建 Market（如需独立步骤）
    public entry fun create_market(ctx: &mut TxContext) {
        let sender = tx::sender(ctx);
        let mk = Market {
            id: object::new(ctx),
            owner: sender,
            supply: 0,
            treasury: balance::zero<SUI>(),
        };
        transfer::transfer(mk, sender);
    }

    /// =============================
    /// 价格曲线（Friend.tech S^2/16000）
    /// =============================

    /// 以 “SUI”为单位的价格，输出为 MIST（最小单位）
    /// - 成本采用 u128 中间态避免溢出
    fun price_mist_for_supply(s: u64): u64 {
        let num: u128 = (s as u128) * (s as u128) * (MIST_PER_SUI as u128);
        let denom: u128 = (PRICE_DENOM as u128);
        let p128 = num / denom;
        assert!(p128 <= (0xffffffffffffffff as u128), E_OVERFLOW);
        (p128 as u64)
    }

    /// 查询下一个买入的价格（以当前 supply+1 计算）
    public fun next_buy_price_mist(current_supply: u64): u64 {
        price_mist_for_supply(current_supply + 1)
    }

    /// 当前卖出一张时的退款（按当前 supply 计算）
    public fun current_sell_refund_mist(current_supply: u64): u64 {
        price_mist_for_supply(current_supply)
    }

    /// =============================
    /// 基础关注（无价格）—— 仅在内部复用
    /// =============================
    fun internal_follow(book: &mut FollowBook, target: address) {
        let me = book.owner;
        assert!(me != target, E_SELF_FOLLOW);
        if (!table::contains(&book.following, target)) {
            table::add(&mut book.following, target, true);
            book.following_count = book.following_count + 1;
            event::emit(Followed { follower: me, followee: target });
        }
    }

    fun internal_unfollow(book: &mut FollowBook, target: address) {
        if (table::contains(&book.following, target)) {
            let _ = table::remove(&mut book.following, target); // 触发存储返还
            book.following_count = book.following_count - 1;
            event::emit(Unfollowed { follower: book.owner, followee: target });
        } else {
            // 非必须：未关注时忽略
            // 可选择 assert!(false, E_NOT_FOLLOWING)
        }
    }

    /// 只读：是否已关注
    public fun is_following(book: &FollowBook, target: address): bool {
        table::contains(&book.following, target)
    }
    
    /// 只读：获取市场供应量
    public fun get_market_supply(market: &Market): u64 {
        market.supply
    }

    /// =============================
    /// 买入（关注） & 赞助免付
    /// =============================

    /// 赞助免费关注（不需要传 Coin）。
    /// - 限制：调用者必须是 FollowBook.owner；且 sponsor_left > 0。
    public entry fun sponsored_buy_key(
        buyer_book: &mut FollowBook,
        seller_market: &mut Market,
        ctx: &mut TxContext,
    ) {
        let caller = tx::sender(ctx);
        assert!(caller == buyer_book.owner, E_NOT_OWNER);

        // 已关注则幂等返回
        if (is_following(buyer_book, seller_market.owner)) return;

        assert!(buyer_book.sponsor_left > 0, E_SPONSOR_EXHAUSTED);
        buyer_book.sponsor_left = buyer_book.sponsor_left - 1;

        // 价格为 0，直接增发供给并关注
        let new_s = seller_market.supply + 1;
        seller_market.supply = new_s;

        internal_follow(buyer_book, seller_market.owner);

        event::emit(BoughtKey {
            buyer: caller,
            seller: seller_market.owner,
            price_mist: 0,
            sponsored: true,
            new_supply: new_s,
        });
    }

    /// 正常买入（需要支付）
    /// - 传入的 `payment` 可大于价格，函数会把找零退回给买家
    public entry fun buy_key(
        buyer_book: &mut FollowBook,
        seller_market: &mut Market,
        mut payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let caller = tx::sender(ctx);
        assert!(caller == buyer_book.owner, E_NOT_OWNER);

        // 已关注则幂等返回（不消耗 payment）
        if (is_following(buyer_book, seller_market.owner)) {
            transfer::public_transfer(payment, caller);
            return
        };

        let price = price_mist_for_supply(seller_market.supply + 1);
        let pay_val = coin::value(&payment);
        assert!(pay_val >= price, E_INSUFFICIENT_PAYMENT);

        // 切出价格部分
        let pay_coin = coin::split(&mut payment, price, ctx);
        let pay_bal = coin::into_balance(pay_coin);
        balance::join(&mut seller_market.treasury, pay_bal);

        // 退还找零
        if (coin::value(&payment) > 0) {
            transfer::public_transfer(payment, caller);
        } else {
            // 避免线性型值泄漏
            coin::destroy_zero(payment);
        };

        // 更新供给并关注
        let new_s = seller_market.supply + 1;
        seller_market.supply = new_s;
        internal_follow(buyer_book, seller_market.owner);

        event::emit(BoughtKey {
            buyer: caller,
            seller: seller_market.owner,
            price_mist: price,
            sponsored: false,
            new_supply: new_s,
        });
    }

    // Batch operations commented out due to Move 2024 limitations
    // Move doesn't support vectors of mutable references
    // TODO: Redesign batch operations using object IDs instead
    /*
    /// 批量买入（可摊薄计算费）。对每个地址依次尝试支付或跳过已关注的目标。
    /// - `payments` 与 `targets` 长度相同；若某个位置的价格为 0（赞助路径），可传入 0 金额的 Coin（会被直接退回），或改用 `sponsored_buy_key`。
    public entry fun batch_buy_keys(
        buyer_book: &mut FollowBook,
        seller_markets: vector<&mut Market>,
        mut payments: vector<Coin<SUI>>,
        ctx: &mut TxContext,
    ) {
        // Implementation removed - vectors of mutable references not supported
    }
    */

    /// 卖出（取关 + 退款）
    public entry fun sell_key(
        seller_book: &mut FollowBook,
        target_market: &mut Market,
        ctx: &mut TxContext,
    ) {
        let caller = tx::sender(ctx);
        assert!(caller == seller_book.owner, E_NOT_OWNER);

        let target = target_market.owner;
        assert!(is_following(seller_book, target), E_NOT_FOLLOWING);

        let s = target_market.supply;
        assert!(s > 0, E_OVERFLOW);
        let refund = price_mist_for_supply(s);

        // 退款（从目标创作者的金库里转出）
        // 安全起见可检查余额是否足够（理论上应当足够）
        let bal_val = balance::value(&target_market.treasury);
        assert!(bal_val >= refund, E_OVERFLOW);
        let out_bal = balance::split(&mut target_market.treasury, refund);
        let out_coin = coin::from_balance(out_bal, ctx);
        transfer::public_transfer(out_coin, caller);

        // 更新供给并取关（触发存储返还）
        target_market.supply = s - 1;
        internal_unfollow(seller_book, target);

        event::emit(SoldKey {
            seller: caller,
            target,
            refund_mist: refund,
            new_supply: s - 1,
        });
    }

    /// 创作者提现：把 treasury 中的金额提取到自己地址
    public entry fun withdraw_treasury(
        market: &mut Market,
        amount_mist: u64,
        ctx: &mut TxContext,
    ) {
        let caller = tx::sender(ctx);
        assert!(caller == market.owner, E_NOT_OWNER);

        let bal_val = balance::value(&market.treasury);
        assert!(bal_val >= amount_mist, E_OVERFLOW);

        let out_bal = balance::split(&mut market.treasury, amount_mist);
        let out_coin = coin::from_balance(out_bal, ctx);
        transfer::public_transfer(out_coin, caller);
    }
}
