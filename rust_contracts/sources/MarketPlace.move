module prediction_marketplace::hashpredictalpha {
   use std::string::{Self, String};
    use aptos_framework::timestamp;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_framework::event::{Self, EventHandle};
    use std::signer;
    use aptos_std::table::{Self, Table};
    use aptos_std::simple_map::{Self, SimpleMap};
    use std::vector;
    use prediction_marketplace::chip_token;
    use prediction_marketplace::user_account;
    // Errors
      const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_NOT_AUTHORIZED: u64 = 3;
    const E_PREDICTION_CLOSED: u64 = 4;
    const E_PREDICTION_NOT_ACTIVE: u64 = 5;
    const E_INSUFFICIENT_FUNDS: u64 = 7;
    const E_PREDICTION_NOT_FOUND: u64 = 8;
    const E_DIVISION_BY_ZERO: u64 = 9;
    const E_INVALID_SHARE: u64 = 10;
    const E_PREDICTION_ALREADY_RESOLVED: u64 = 11;
    const E_PREDICTION_NOT_RESOLVED: u64 = 12;

    // Enums
    struct State has copy, drop, store {
        value: u8
    }

    // Constants for State
    const STATE_ACTIVE: u8 = 0;
    const STATE_PAUSED: u8 = 1;
    const STATE_RESOLVED: u8 = 2;

    // Constants for Result
    const RESULT_TRUE: u8 = 0;
    const RESULT_FALSE: u8 = 1;
    const RESULT_UNDEFINED: u8 = 2;

const SHARE_AMOUNT: u64 = 1000000; // 0.01 APT
const CHIP_EXCHANGE_RATE: u64 = 10000000000; // 100 CHIP = 1 APT, accounting for 8 decimal places


      struct UserPrediction has store, drop, copy {
        share: u64,
        verdict: bool,
        is_chip: bool,
    }

    struct PredictionDetails has store, copy, drop {
        id: u64,
        state: State,
        description: String,
        start_time: u64,
        end_time: u64,
        total_votes: u64,
        yes_votes: u64,
        no_votes: u64,
        yes_price: u64,
        no_price: u64,
        result: u8,
        total_bet: u64,
        prediction_type: u8,
        options_count: u8,
        tags: vector<String>,
        
    }

    struct MarketState has key {
        predictions: SimpleMap<u64, PredictionDetails>,
        user_predictions: Table<address, SimpleMap<u64, vector<UserPrediction>>>,
        admin: address,
        next_prediction_id: u64,
        prediction_created_events: EventHandle<PredictionCreatedEvent>,
        prediction_made_events: EventHandle<PredictionMadeEvent>,
        prediction_resolved_events: EventHandle<PredictionResolvedEvent>,
    }

    struct PredictionCreatedEvent has drop, store {
        prediction_id: u64,
        creator: address,
        description: String,
    }

 struct PredictionMadeEvent has drop, store {
        prediction_id: u64,
        user: address,
        verdict: bool,
        share: u64,
        is_chip: bool,
    }


    struct PredictionResolvedEvent has drop, store {
        prediction_id: u64,
        result: u8,
    }

    struct UserTracker has key {
        users: vector<address>,
    }

fun init_module(admin: &signer) {
    let admin_addr = signer::address_of(admin);
    assert!(!exists<MarketState>(admin_addr), E_ALREADY_INITIALIZED);

    move_to(admin, MarketState {
        predictions: simple_map::create(),
        user_predictions: table::new(),
        admin: admin_addr,
        next_prediction_id: 0,
        prediction_created_events: account::new_event_handle<PredictionCreatedEvent>(admin),
        prediction_made_events: account::new_event_handle<PredictionMadeEvent>(admin),
        prediction_resolved_events: account::new_event_handle<PredictionResolvedEvent>(admin),
    });

    move_to(admin, UserTracker {
        users: vector::empty<address>(),
    });

    user_account::initialize(admin);
}
    fun add_user_to_tracker(user: address) acquires UserTracker {
        let tracker = borrow_global_mut<UserTracker>(@prediction_marketplace);
        if (!vector::contains(&tracker.users, &user)) {
            vector::push_back(&mut tracker.users, user);
        }
    }
  public entry fun create_prediction(
        account: &signer,
        description: String,
        duration: u64,
        tags: vector<String>,
        prediction_type: u8,
        options_count: u8
    ) acquires MarketState {
        let account_addr = signer::address_of(account);
        let market_state = borrow_global_mut<MarketState>(@prediction_marketplace);
        
        assert!(account_addr == market_state.admin, E_NOT_AUTHORIZED);

        let prediction_id = market_state.next_prediction_id;
        market_state.next_prediction_id = prediction_id + 1;

        let prediction_details = PredictionDetails {
            id: prediction_id,
            state: State { value: STATE_ACTIVE },
            description,
            start_time: timestamp::now_seconds(),
            end_time: timestamp::now_seconds() + duration,
            total_votes: 0,
            yes_votes: 0,
            no_votes: 0,
            yes_price: 0,
            no_price: 0,
            result: RESULT_UNDEFINED,
            total_bet: 0,
            prediction_type,
            options_count,
            tags,
        };

        simple_map::add(&mut market_state.predictions, prediction_id, prediction_details);

        event::emit_event(&mut market_state.prediction_created_events, PredictionCreatedEvent {
            prediction_id,
            creator: account_addr,
            description,
        });
    }

    public entry fun predict(
        account: &signer,
        prediction_id: u64,
        verdict: bool,
        share: u64,
        use_chip: bool
    ) acquires MarketState {
        let account_addr = signer::address_of(account);
        let market_state = borrow_global_mut<MarketState>(@prediction_marketplace);

        assert!(simple_map::contains_key(&market_state.predictions, &prediction_id), E_PREDICTION_NOT_FOUND);
        let prediction = simple_map::borrow_mut(&mut market_state.predictions, &prediction_id);

        assert!(prediction.state.value == STATE_ACTIVE, E_PREDICTION_NOT_ACTIVE);
        assert!(timestamp::now_seconds() <= prediction.end_time, E_PREDICTION_CLOSED);
        assert!(share > 0, E_INVALID_SHARE);

        if (!table::contains(&market_state.user_predictions, account_addr)) {
            table::add(&mut market_state.user_predictions, account_addr, simple_map::create());
        };
        let user_predictions = table::borrow_mut(&mut market_state.user_predictions, account_addr);
        
        if (!simple_map::contains_key(user_predictions, &prediction_id)) {
            simple_map::add(user_predictions, prediction_id, vector::empty<UserPrediction>());
        };
        let user_prediction_vector = simple_map::borrow_mut(user_predictions, &prediction_id);
        
         let required_amount = if (use_chip) {
        share * CHIP_EXCHANGE_RATE
    } else {
        share * SHARE_AMOUNT
    };

    let apt_equivalent = if (use_chip) {
        share * SHARE_AMOUNT // Convert CHIP to APT equivalent
    } else {
        required_amount
    };

   if (use_chip) {
        assert!(chip_token::balance(account_addr) >= required_amount, E_INSUFFICIENT_FUNDS);
        // Instead of burning, transfer CHIP tokens to the prediction marketplace
        chip_token::transfer_chips(account, @prediction_marketplace, required_amount);
    } else {
        assert!(coin::balance<AptosCoin>(account_addr) >= required_amount, E_INSUFFICIENT_FUNDS);
        coin::transfer<AptosCoin>(account, @prediction_marketplace, required_amount);
    };
        // Update prediction details
        prediction.total_votes = prediction.total_votes + 1;
        if (verdict) {
            prediction.yes_votes = prediction.yes_votes + 1;
            prediction.yes_price = prediction.yes_price + apt_equivalent;
        } else {
            prediction.no_votes = prediction.no_votes + 1;
            prediction.no_price = prediction.no_price + apt_equivalent;
        };

        // Record prediction
        vector::push_back(user_prediction_vector, UserPrediction { share, verdict, is_chip: use_chip });

        // Update total bet
        prediction.total_bet = prediction.total_bet + apt_equivalent;

        // Record prediction in user account
        // user_account::record_prediction(account_addr, prediction_id, apt_equivalent, use_chip, verdict);
    user_account::update_balances(account);

    // Record prediction in user account
    user_account::record_prediction(account_addr, prediction_id, apt_equivalent, use_chip, verdict);
        event::emit_event(&mut market_state.prediction_made_events, PredictionMadeEvent {
            prediction_id,
            user: account_addr,
            verdict,
            share,
            is_chip: use_chip,
        });
    }



public entry fun resolve_prediction(account: &signer, prediction_id: u64, result: u8) acquires MarketState {
    let account_addr = signer::address_of(account);
    let market_state = borrow_global_mut<MarketState>(@prediction_marketplace);

    assert!(account_addr == market_state.admin, E_NOT_AUTHORIZED);
    assert!(simple_map::contains_key(&market_state.predictions, &prediction_id), E_PREDICTION_NOT_FOUND);
    
    let prediction = simple_map::borrow_mut(&mut market_state.predictions, &prediction_id);
    assert!(prediction.state.value != STATE_RESOLVED, E_PREDICTION_ALREADY_RESOLVED);
    assert!(result == RESULT_TRUE || result == RESULT_FALSE, E_INVALID_SHARE);

    prediction.result = result;
    prediction.state = State { value: STATE_RESOLVED };

    event::emit_event(&mut market_state.prediction_resolved_events, PredictionResolvedEvent {
        prediction_id,
        result,
    });

    // Since we can't iterate over the table, we'll update user predictions in the withdraw function
}



    public entry fun pause_prediction(account: &signer, prediction_id: u64) acquires MarketState {
        let account_addr = signer::address_of(account);
        let market_state = borrow_global_mut<MarketState>(@prediction_marketplace);

        assert!(account_addr == market_state.admin, E_NOT_AUTHORIZED);
        assert!(simple_map::contains_key(&market_state.predictions, &prediction_id), E_PREDICTION_NOT_FOUND);
        
        let prediction = simple_map::borrow_mut(&mut market_state.predictions, &prediction_id);
        assert!(prediction.state.value == STATE_ACTIVE, E_PREDICTION_NOT_ACTIVE);

        prediction.state = State { value: STATE_PAUSED };
    }

    public entry fun resume_prediction(account: &signer, prediction_id: u64) acquires MarketState {
        let account_addr = signer::address_of(account);
        let market_state = borrow_global_mut<MarketState>(@prediction_marketplace);

        assert!(account_addr == market_state.admin, E_NOT_AUTHORIZED);
        assert!(simple_map::contains_key(&market_state.predictions, &prediction_id), E_PREDICTION_NOT_FOUND);
        
        let prediction = simple_map::borrow_mut(&mut market_state.predictions, &prediction_id);
        assert!(prediction.state.value == STATE_PAUSED, E_PREDICTION_NOT_ACTIVE);

        prediction.state = State { value: STATE_ACTIVE };
    }

    public entry fun withdraw(account: &signer, withdrawaladdress: address, prediction_id: u64) acquires MarketState {
        let account_addr = signer::address_of(account);
        let market_state = borrow_global_mut<MarketState>(@prediction_marketplace);
        assert!(account_addr == market_state.admin, E_NOT_AUTHORIZED);

        assert!(simple_map::contains_key(&market_state.predictions, &prediction_id), E_PREDICTION_NOT_FOUND);
        let prediction = simple_map::borrow(&market_state.predictions, &prediction_id);

        assert!(prediction.state.value == STATE_RESOLVED, E_PREDICTION_NOT_ACTIVE);
        assert!(prediction.result != RESULT_UNDEFINED, E_PREDICTION_NOT_RESOLVED);
        assert!(table::contains(&market_state.user_predictions, withdrawaladdress), E_NOT_AUTHORIZED);

        let user_predictions = table::borrow_mut(&mut market_state.user_predictions, withdrawaladdress);
        assert!(simple_map::contains_key(user_predictions, &prediction_id), E_NOT_AUTHORIZED);

        let user_prediction_vector = simple_map::borrow_mut(user_predictions, &prediction_id);
        
        let total_winning_amount = 0u64;
        let i = 0;
        let len = vector::length(user_prediction_vector);
        
        while (i < len) {
            let user_prediction = vector::borrow(user_prediction_vector, i);
            let is_winner = (user_prediction.verdict && prediction.result == RESULT_TRUE) ||
                            (!user_prediction.verdict && prediction.result == RESULT_FALSE);
            
            if (is_winner) {
                let winning_amount = if (prediction.result == RESULT_TRUE) {
                    assert!(prediction.yes_votes > 0, E_DIVISION_BY_ZERO);
                    (95 * prediction.total_bet * user_prediction.share * SHARE_AMOUNT) / (100 * prediction.yes_price)
                } else {
                    assert!(prediction.no_votes > 0, E_DIVISION_BY_ZERO);
                    (95 * prediction.total_bet * user_prediction.share * SHARE_AMOUNT) / (100 * prediction.no_price)
                };
                total_winning_amount = total_winning_amount + winning_amount;
            };
            i = i + 1;
        };

        // Transfer total winnings from the prediction marketplace to the user
        coin::transfer<AptosCoin>(account, withdrawaladdress, total_winning_amount);
        
        // Clear the user's predictions for this event
        simple_map::remove(user_predictions, &prediction_id);
    }

    public fun get_all_prediction_addresses(): vector<address> acquires UserTracker {
        let tracker = borrow_global<UserTracker>(@prediction_marketplace);
        *&tracker.users
    }

public entry fun mass_withdraw(account: &signer, prediction_id: u64) acquires MarketState, UserTracker {
    let account_addr = signer::address_of(account);
    let market_state = borrow_global_mut<MarketState>(@prediction_marketplace);
    assert!(account_addr == market_state.admin, E_NOT_AUTHORIZED);

    assert!(simple_map::contains_key(&market_state.predictions, &prediction_id), E_PREDICTION_NOT_FOUND);
    let prediction = simple_map::borrow(&market_state.predictions, &prediction_id);

    assert!(prediction.state.value == STATE_RESOLVED, E_PREDICTION_NOT_ACTIVE);
    assert!(prediction.result != RESULT_UNDEFINED, E_PREDICTION_NOT_RESOLVED);

    let users = get_all_prediction_addresses();
    let i = 0;
    let len = vector::length(&users);

    while (i < len) {
        let user = *vector::borrow(&users, i);
        if (table::contains(&market_state.user_predictions, user)) {
            let user_predictions = table::borrow_mut(&mut market_state.user_predictions, user);
            if (simple_map::contains_key(user_predictions, &prediction_id)) {
                let user_prediction_vector = simple_map::borrow_mut(user_predictions, &prediction_id);
                
                let total_winning_amount = 0u64;
                let j = 0;
                let pred_len = vector::length(user_prediction_vector);
                
                while (j < pred_len) {
                    let user_prediction = vector::borrow(user_prediction_vector, j);
                    let is_winner = (user_prediction.verdict && prediction.result == RESULT_TRUE) ||
                                    (!user_prediction.verdict && prediction.result == RESULT_FALSE);
                    
                    if (is_winner) {
                        let winning_amount = if (prediction.result == RESULT_TRUE) {
                            assert!(prediction.yes_votes > 0, E_DIVISION_BY_ZERO);
                            (95 * prediction.total_bet * user_prediction.share * SHARE_AMOUNT) / (100 * prediction.yes_price)
                        } else {
                            assert!(prediction.no_votes > 0, E_DIVISION_BY_ZERO);
                            (95 * prediction.total_bet * user_prediction.share * SHARE_AMOUNT) / (100 * prediction.no_price)
                        };
                        total_winning_amount = total_winning_amount + winning_amount;
                    };

                    // Update user account prediction outcome here
                    user_account::update_prediction_outcome(user, prediction_id, is_winner);

                    j = j + 1;
                };

                if (total_winning_amount > 0) {
                    // Transfer winnings from the prediction marketplace to the user
                    coin::transfer<AptosCoin>(account, user, total_winning_amount);
                };

                // Remove the prediction from the user's predictions
                simple_map::remove(user_predictions, &prediction_id);
            };
        };
        i = i + 1;
    };
}
    // Helper function to check if a user made a prediction
    #[view]
    public fun has_user_predicted(user: address, prediction_id: u64): bool acquires MarketState {
        let market_state = borrow_global<MarketState>(@prediction_marketplace);
        if (!table::contains(&market_state.user_predictions, user)) {
            return false
        };
        let user_predictions = table::borrow(&market_state.user_predictions, user);
        simple_map::contains_key(user_predictions, &prediction_id)
    }

   #[view]
    public fun get_prediction(prediction_id: u64): PredictionDetails acquires MarketState {
        let market_state = borrow_global<MarketState>(@prediction_marketplace);
        assert!(simple_map::contains_key(&market_state.predictions, &prediction_id), E_PREDICTION_NOT_FOUND);
        *simple_map::borrow(&market_state.predictions, &prediction_id)
    }

    #[view]
    public fun get_user_predictions(user: address, prediction_id: u64): vector<UserPrediction> acquires MarketState {
        let market_state = borrow_global<MarketState>(@prediction_marketplace);
        if (!table::contains(&market_state.user_predictions, user)) {
            return vector::empty<UserPrediction>()
        };
        let user_predictions = table::borrow(&market_state.user_predictions, user);
        if (!simple_map::contains_key(user_predictions, &prediction_id)) {
            return vector::empty<UserPrediction>()
        };
        *simple_map::borrow(user_predictions, &prediction_id)
    }

    #[view]
    public fun get_all_predictions(): vector<PredictionDetails> acquires MarketState {
        let market_state = borrow_global<MarketState>(@prediction_marketplace);
        let predictions = &market_state.predictions;
        let prediction_ids = simple_map::keys(predictions);
        let result = vector::empty<PredictionDetails>();
        let i = 0;
        let len = vector::length(&prediction_ids);
        while (i < len) {
            let prediction_id = *vector::borrow(&prediction_ids, i);
            vector::push_back(&mut result, *simple_map::borrow(predictions, &prediction_id));
            i = i + 1;
        };
        result
    }

    #[view]
    public fun get_user_winnings(user: address, prediction_id: u64): u64 acquires MarketState {
        let market_state = borrow_global<MarketState>(@prediction_marketplace);
        assert!(simple_map::contains_key(&market_state.predictions, &prediction_id), E_PREDICTION_NOT_FOUND);
        let prediction = simple_map::borrow(&market_state.predictions, &prediction_id);
        assert!(prediction.state.value == STATE_RESOLVED, E_PREDICTION_NOT_ACTIVE);
        assert!(prediction.result != RESULT_UNDEFINED, E_PREDICTION_NOT_RESOLVED);

        if (!table::contains(&market_state.user_predictions, user)) {
            return 0
        };

        let user_predictions = table::borrow(&market_state.user_predictions, user);
        if (!simple_map::contains_key(user_predictions, &prediction_id)) {
            return 0
        };

        let user_prediction_vector = simple_map::borrow(user_predictions, &prediction_id);
        let total_winnings = 0u64;
        let i = 0;
        let len = vector::length(user_prediction_vector);
        
        while (i < len) {
            let user_prediction = vector::borrow(user_prediction_vector, i);
            let is_winner = (user_prediction.verdict && prediction.result == RESULT_TRUE) ||
                            (!user_prediction.verdict && prediction.result == RESULT_FALSE);

            if (is_winner) {
                let winning_amount = if (prediction.result == RESULT_TRUE) {
                    (prediction.total_bet * user_prediction.share) / prediction.yes_price
                } else {
                    (prediction.total_bet * user_prediction.share) / prediction.no_price
                };
                total_winnings = total_winnings + winning_amount;
            };
            i = i + 1;
        };

        total_winnings
    }

    #[view]
    public fun is_prediction_active(prediction_id: u64): bool acquires MarketState {
        let market_state = borrow_global<MarketState>(@prediction_marketplace);
        assert!(simple_map::contains_key(&market_state.predictions, &prediction_id), E_PREDICTION_NOT_FOUND);
        let prediction = simple_map::borrow(&market_state.predictions, &prediction_id);
        prediction.state.value == STATE_ACTIVE
    }

    #[view]
    public fun get_prediction_result(prediction_id: u64): (bool, u8) acquires MarketState {
        let market_state = borrow_global<MarketState>(@prediction_marketplace);
        assert!(simple_map::contains_key(&market_state.predictions, &prediction_id), E_PREDICTION_NOT_FOUND);
        let prediction = simple_map::borrow(&market_state.predictions, &prediction_id);
        (prediction.state.value == STATE_RESOLVED, prediction.result)
    }

    #[view]
    public fun get_prediction_stats(prediction_id: u64): (u64, u64, u64, u64, u64, u64) acquires MarketState {
        let market_state = borrow_global<MarketState>(@prediction_marketplace);
        assert!(simple_map::contains_key(&market_state.predictions, &prediction_id), E_PREDICTION_NOT_FOUND);
        let prediction = simple_map::borrow(&market_state.predictions, &prediction_id);
        (
            prediction.total_votes,
            prediction.yes_votes,
            prediction.no_votes,
            prediction.yes_price,
            prediction.no_price,
            prediction.total_bet,
        )
    }

    #[view]
    public fun get_total_predictions(): u64 acquires MarketState {
        let market_state = borrow_global<MarketState>(@prediction_marketplace);
        simple_map::length(&market_state.predictions)
    }

    #[view]
    public fun get_admin(): address acquires MarketState {
        let market_state = borrow_global<MarketState>(@prediction_marketplace);
        market_state.admin
    }
}