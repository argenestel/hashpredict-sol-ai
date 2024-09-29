module prediction_marketplace::reward_system {
    use std::signer;
    use std::vector;
    use std::string::{Self, String};
    use aptos_framework::timestamp;
    use aptos_framework::account;
    use aptos_framework::event::{Self, EventHandle};
    use aptos_std::table::{Self, Table};
    use aptos_framework::aptos_coin::AptosCoin;
    use prediction_marketplace::user_account;
    use prediction_marketplace::chip_token;

    // Error codes
    const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_NOT_AUTHORIZED: u64 = 3;
    const E_ALREADY_CLAIMED_TODAY: u64 = 4;
    const E_INVALID_REFERRAL: u64 = 5;
    const E_REFERRAL_CODE_NOT_FOUND: u64 = 6;
    const E_REFERRAL_CODE_ALREADY_USED: u64 = 7;

    // Constants
    const BASE_DAILY_REWARD_AMOUNT: u64 = 1000 * 100000000; // 10 CHIP tokens
    const REFERRAL_REWARD_AMOUNT: u64 = 5000 * 100000000; // 50 CHIP tokens
    const MAX_STREAK_BONUS: u64 = 10000; // 100% bonus
    const STREAK_BONUS_INCREMENT: u64 = 5; // 5% increase per day

    struct RewardSystem has key {
        daily_claims: Table<address, DailyClaimInfo>,
        referral_codes: Table<String, ReferralCode>,
        referrals: Table<address, vector<address>>,
    }

    struct DailyClaimInfo has store {
        last_claim_time: u64,
        current_streak: u64,
    }

    struct ReferralCode has store {
        creator: address,
        is_active: bool,
    }

    struct RewardEvents has key {
        daily_reward_events: EventHandle<DailyRewardEvent>,
        referral_reward_events: EventHandle<ReferralRewardEvent>,
    }

    struct DailyRewardEvent has drop, store {
        user_address: address,
        amount: u64,
        streak: u64,
        timestamp: u64,
    }

    struct ReferralRewardEvent has drop, store {
        referrer_address: address,
        referred_address: address,
        amount: u64,
        timestamp: u64,
    }

     fun init_module(account: &signer) {
        let account_addr = signer::address_of(account);
        assert!(account_addr == @prediction_marketplace, E_NOT_AUTHORIZED);
        assert!(!exists<RewardSystem>(account_addr), E_ALREADY_INITIALIZED);

        move_to(account, RewardSystem {
            daily_claims: table::new(),
            referral_codes: table::new(),
            referrals: table::new(),
        });

        move_to(account, RewardEvents {
            daily_reward_events: account::new_event_handle<DailyRewardEvent>(account),
            referral_reward_events: account::new_event_handle<ReferralRewardEvent>(account),
        });
    }

public entry fun claim_daily_reward(admin: &signer, user_addr: address) acquires RewardSystem, RewardEvents {
        assert!(signer::address_of(admin) == @prediction_marketplace, E_NOT_AUTHORIZED);
        assert!(user_account::has_claimed_account(user_addr), E_NOT_INITIALIZED);

        let reward_system = borrow_global_mut<RewardSystem>(@prediction_marketplace);
        let current_time = timestamp::now_seconds();

        let (last_claim_time, current_streak) = if (table::contains(&reward_system.daily_claims, user_addr)) {
            let claim_info = table::borrow_mut(&mut reward_system.daily_claims, user_addr);
            let last_time = claim_info.last_claim_time;
            assert!(current_time - last_time >= 86400, E_ALREADY_CLAIMED_TODAY); // 86400 seconds = 1 day
            
            if (current_time - last_time < 172800) { // 172800 seconds = 2 days
                claim_info.current_streak = claim_info.current_streak + 1;
            } else {
                claim_info.current_streak = 1; // Reset streak if more than 2 days have passed
            };
            claim_info.last_claim_time = current_time;
            (last_time, claim_info.current_streak)
        } else {
            let claim_info = DailyClaimInfo { last_claim_time: current_time, current_streak: 1 };
            table::add(&mut reward_system.daily_claims, user_addr, claim_info);
            (0, 1)
        };

        // Calculate reward with streak bonus
        let streak_bonus = (current_streak - 1) * STREAK_BONUS_INCREMENT;
        if (streak_bonus > MAX_STREAK_BONUS) {
            streak_bonus = MAX_STREAK_BONUS;
        };
        let reward_amount = BASE_DAILY_REWARD_AMOUNT + (BASE_DAILY_REWARD_AMOUNT * streak_bonus / 100);

        // Mint and transfer CHIP tokens
        chip_token::mint(admin, user_addr, reward_amount);

        // Emit event
        let events = borrow_global_mut<RewardEvents>(@prediction_marketplace);
        event::emit_event(&mut events.daily_reward_events, DailyRewardEvent {
            user_address: user_addr,
            amount: reward_amount,
            streak: current_streak,
            timestamp: current_time,
        });
    }

    public entry fun use_referral_code(admin: &signer, user_addr: address, code: String) acquires RewardSystem, RewardEvents {
        assert!(signer::address_of(admin) == @prediction_marketplace, E_NOT_AUTHORIZED);
        assert!(user_account::has_claimed_account(user_addr), E_NOT_INITIALIZED);

        let reward_system = borrow_global_mut<RewardSystem>(@prediction_marketplace);
        assert!(table::contains(&reward_system.referral_codes, code), E_REFERRAL_CODE_NOT_FOUND);

        let referral_code = table::borrow_mut(&mut reward_system.referral_codes, code);
        assert!(referral_code.is_active, E_REFERRAL_CODE_ALREADY_USED);
        assert!(referral_code.creator != user_addr, E_INVALID_REFERRAL);

        referral_code.is_active = false;

        let referrer_addr = referral_code.creator;
        if (!table::contains(&reward_system.referrals, referrer_addr)) {
            table::add(&mut reward_system.referrals, referrer_addr, vector::empty());
        };

        let referred_users = table::borrow_mut(&mut reward_system.referrals, referrer_addr);
        vector::push_back(referred_users, user_addr);

        // Mint and transfer CHIP tokens to the referrer
        chip_token::mint(admin, referrer_addr, REFERRAL_REWARD_AMOUNT);

        // Emit event
        let events = borrow_global_mut<RewardEvents>(@prediction_marketplace);
        event::emit_event(&mut events.referral_reward_events, ReferralRewardEvent {
            referrer_address: referrer_addr,
            referred_address: user_addr,
            amount: REFERRAL_REWARD_AMOUNT,
            timestamp: timestamp::now_seconds(),
        });
    }

    public entry fun generate_referral_code(account: &signer, code: String) acquires RewardSystem {
        let account_addr = signer::address_of(account);
        assert!(user_account::has_claimed_account(account_addr), E_NOT_INITIALIZED);

        let reward_system = borrow_global_mut<RewardSystem>(@prediction_marketplace);
        assert!(!table::contains(&reward_system.referral_codes, code), E_INVALID_REFERRAL);

        table::add(&mut reward_system.referral_codes, code, ReferralCode { creator: account_addr, is_active: true });
    }



    #[view]
    public fun get_referrals(user_addr: address): vector<address> acquires RewardSystem {
        let reward_system = borrow_global<RewardSystem>(@prediction_marketplace);
        if (table::contains(&reward_system.referrals, user_addr)) {
            *table::borrow(&reward_system.referrals, user_addr)
        } else {
            vector::empty()
        }
    }

    #[view]
    public fun get_daily_claim_info(user_addr: address): (u64, u64) acquires RewardSystem {
        let reward_system = borrow_global<RewardSystem>(@prediction_marketplace);
        if (table::contains(&reward_system.daily_claims, user_addr)) {
            let claim_info = table::borrow(&reward_system.daily_claims, user_addr);
            (claim_info.last_claim_time, claim_info.current_streak)
        } else {
            (0, 0)
        }
    }

    #[view]
    public fun is_referral_code_active(code: String): bool acquires RewardSystem {
        let reward_system = borrow_global<RewardSystem>(@prediction_marketplace);
        if (table::contains(&reward_system.referral_codes, code)) {
            table::borrow(&reward_system.referral_codes, code).is_active
        } else {
            false
        }
    }
}