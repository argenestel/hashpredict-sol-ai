
module prediction_marketplace::chip_token{
   use aptos_framework::fungible_asset::{Self, MintRef, TransferRef, BurnRef, Metadata, FungibleAsset};
    use aptos_framework::object::{Self, Object};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::table::{Self, Table};
    use std::error;
    use std::signer;
    use std::string::utf8;
    use std::option;



    /// Only fungible asset metadata owner can make changes.
    const ENOT_OWNER: u64 = 1;
    const EINSUFFICIENT_BALANCE: u64 = 2;
    const EEXCHANGE_REQUEST_NOT_FOUND: u64 = 3;
    const ENOT_ADMIN: u64 = 4;

    const ASSET_SYMBOL: vector<u8> = b"CHIP";
    const EXCHANGE_RATE: u64 = 100; // 1000 CHIP = 1 APT

    struct ExchangeRequest has store, drop {
        chip_amount: u64,
        apt_amount: u64,
    }

    struct ExchangeRequests has key {
        requests: Table<address, ExchangeRequest>,
    }


    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    /// Hold refs to control the minting, transfer and burning of fungible assets.
    struct ManagedFungibleAsset has key {
        mint_ref: MintRef,
        transfer_ref: TransferRef,
        burn_ref: BurnRef,
    }

    /// Initialize metadata object and store the refs.
    // :!:>initialize
    fun init_module(admin: &signer) {
        let constructor_ref = &object::create_named_object(admin, ASSET_SYMBOL);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            constructor_ref,
            option::none(),
            utf8(b"HashPredict Chips"), /* name */
            utf8(ASSET_SYMBOL), /* symbol */
            8, /* decimals */
            utf8(b"https://ipfs.io/ipfs/QmXsAkjzhLXxvq6pYVWtNi96oFiBorR1JzLBjW8jTvhgyp"), /* icon */
            utf8(b"http://hashpredict.fun"), /* project */
        );

        // Create mint/burn/transfer refs to allow creator to manage the fungible asset.
        let mint_ref = fungible_asset::generate_mint_ref(constructor_ref);
        let burn_ref = fungible_asset::generate_burn_ref(constructor_ref);
        let transfer_ref = fungible_asset::generate_transfer_ref(constructor_ref);
        let metadata_object_signer = object::generate_signer(constructor_ref);
        move_to(
            &metadata_object_signer,
            ManagedFungibleAsset { mint_ref, transfer_ref, burn_ref }
        );

        move_to(admin, ExchangeRequests {
            requests: table::new(),
        });
    }

    public entry fun mint(admin: &signer, to: address, amount: u64) acquires ManagedFungibleAsset {
        let asset = get_metadata();
        let managed_fungible_asset = authorized_borrow_refs(admin, asset);
        let to_wallet = primary_fungible_store::ensure_primary_store_exists(to, asset);
        let fa = fungible_asset::mint(&managed_fungible_asset.mint_ref, amount);
        fungible_asset::deposit_with_ref(&managed_fungible_asset.transfer_ref, to_wallet, fa);
    }// <:!:mint

    /// Transfer as the owner of metadata object ignoring `frozen` field.
    public entry fun transfer(admin: &signer, from: address, to: address, amount: u64) acquires ManagedFungibleAsset {
        let asset = get_metadata();
        let transfer_ref = &authorized_borrow_refs(admin, asset).transfer_ref;
        let from_wallet = primary_fungible_store::primary_store(from, asset);
        let to_wallet = primary_fungible_store::ensure_primary_store_exists(to, asset);
        fungible_asset::transfer_with_ref(transfer_ref, from_wallet, to_wallet, amount);
    }

    /// Burn fungible assets as the owner of metadata object.
    public entry fun burn(admin: &signer, from: address, amount: u64) acquires ManagedFungibleAsset {
        let asset = get_metadata();
        let burn_ref = &authorized_borrow_refs(admin, asset).burn_ref;
        let from_wallet = primary_fungible_store::primary_store(from, asset);
        fungible_asset::burn_from(burn_ref, from_wallet, amount);
    }

public entry fun transfer_chips(
    from: &signer,
    to: address,
    amount: u64
) {
    let asset = get_metadata();
    let from_wallet = primary_fungible_store::primary_store(signer::address_of(from), asset);
    let to_wallet = primary_fungible_store::ensure_primary_store_exists(to, asset);

    // Create a FungibleAsset to transfer
    let fa = fungible_asset::withdraw(from, from_wallet, amount);

    // Deposit the FungibleAsset to the recipient's wallet
    fungible_asset::deposit(to_wallet, fa);
}

   /// Freeze an account so it cannot transfer or receive fungible assets.
    public entry fun freeze_account(admin: &signer, account: address) acquires ManagedFungibleAsset {
        let asset = get_metadata();
        let transfer_ref = &authorized_borrow_refs(admin, asset).transfer_ref;
        let wallet = primary_fungible_store::ensure_primary_store_exists(account, asset);
        fungible_asset::set_frozen_flag(transfer_ref, wallet, true);
    }

    /// Unfreeze an account so it can transfer or receive fungible assets.
    public entry fun unfreeze_account(admin: &signer, account: address) acquires ManagedFungibleAsset {
        let asset = get_metadata();
        let transfer_ref = &authorized_borrow_refs(admin, asset).transfer_ref;
        let wallet = primary_fungible_store::ensure_primary_store_exists(account, asset);
        fungible_asset::set_frozen_flag(transfer_ref, wallet, false);
    }

    /// Withdraw as the owner of metadata object ignoring `frozen` field.
    public fun withdraw(admin: &signer, amount: u64, from: address): FungibleAsset acquires ManagedFungibleAsset {
        let asset = get_metadata();
        let transfer_ref = &authorized_borrow_refs(admin, asset).transfer_ref;
        let from_wallet = primary_fungible_store::primary_store(from, asset);
        fungible_asset::withdraw_with_ref(transfer_ref, from_wallet, amount)
    }

    /// Deposit as the owner of metadata object ignoring `frozen` field.
    public fun deposit(admin: &signer, to: address, fa: FungibleAsset) acquires ManagedFungibleAsset {
        let asset = get_metadata();
        let transfer_ref = &authorized_borrow_refs(admin, asset).transfer_ref;
        let to_wallet = primary_fungible_store::ensure_primary_store_exists(to, asset);
        fungible_asset::deposit_with_ref(transfer_ref, to_wallet, fa);
    }

   public entry fun mint_with_apt(
        user: &signer,
        apt_amount: u64
    ) acquires ManagedFungibleAsset {
        let user_addr = signer::address_of(user);
        let chip_amount = apt_amount * EXCHANGE_RATE;

        // Transfer APT from user to contract
        coin::transfer<AptosCoin>(user, @prediction_marketplace, apt_amount);

        // Mint CHIP tokens
        let asset = get_metadata();
        let managed_fungible_asset = borrow_global<ManagedFungibleAsset>(object::object_address(&asset));
        let to_wallet = primary_fungible_store::ensure_primary_store_exists(user_addr, asset);
        let fa = fungible_asset::mint(&managed_fungible_asset.mint_ref, chip_amount);
        fungible_asset::deposit_with_ref(&managed_fungible_asset.transfer_ref, to_wallet, fa);
    }

public entry fun request_chip_to_apt_exchange(
        user: &signer,
        chip_amount: u64
    ) acquires ManagedFungibleAsset, ExchangeRequests {
        let user_addr = signer::address_of(user);
        assert!(chip_amount % EXCHANGE_RATE == 0, error::invalid_argument(EINSUFFICIENT_BALANCE));
        let apt_amount = chip_amount / EXCHANGE_RATE;

        // Burn CHIP tokens
        let asset = get_metadata();
        let managed_fungible_asset = borrow_global<ManagedFungibleAsset>(object::object_address(&asset));
        let from_wallet = primary_fungible_store::primary_store(user_addr, asset);
        fungible_asset::burn_from(&managed_fungible_asset.burn_ref, from_wallet, chip_amount);

        // Create exchange request
        let exchange_requests = borrow_global_mut<ExchangeRequests>(@prediction_marketplace);
        table::upsert(&mut exchange_requests.requests, user_addr, ExchangeRequest {
            chip_amount,
            apt_amount,
        });
    }

    public entry fun fulfill_exchange_request(
        admin: &signer,
        user_addr: address
    ) acquires ExchangeRequests {
        assert!(signer::address_of(admin) == @prediction_marketplace, error::permission_denied(ENOT_ADMIN));

        let exchange_requests = borrow_global_mut<ExchangeRequests>(@prediction_marketplace);
        assert!(table::contains(&exchange_requests.requests, user_addr), error::not_found(EEXCHANGE_REQUEST_NOT_FOUND));

        let ExchangeRequest { chip_amount: _, apt_amount } = table::remove(&mut exchange_requests.requests, user_addr);

        // Transfer APT from admin to user
        coin::transfer<AptosCoin>(admin, user_addr, apt_amount);
    }
    
#[view]
public fun balance(user_addr: address): u64 {
    let metadata = get_metadata();
    primary_fungible_store::balance(user_addr, metadata)
}

    /// Borrow the immutable reference of the refs of `metadata`.
    /// This validates that the signer is the metadata object's owner.
    inline fun authorized_borrow_refs(
        owner: &signer,
        asset: Object<Metadata>,
    ): &ManagedFungibleAsset acquires ManagedFungibleAsset {
        assert!(object::is_owner(asset, signer::address_of(owner)), error::permission_denied(ENOT_OWNER));
        borrow_global<ManagedFungibleAsset>(object::object_address(&asset))
    }
    #[view]
    /// Return the address of the managed fungible asset that's created when this module is deployed.
    public fun get_metadata(): Object<Metadata> {
        let asset_address = object::create_object_address(&@prediction_marketplace, ASSET_SYMBOL);
        object::address_to_object<Metadata>(asset_address)
    }    
}
