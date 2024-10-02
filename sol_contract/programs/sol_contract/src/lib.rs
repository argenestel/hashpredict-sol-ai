use anchor_lang::prelude::*;

declare_id!("6JyW3ZzjMpm7eHwL1y3ZWYgXLkf7Q6DP9BYfDsswryhT");

#[program]
pub mod prediction_marketplace {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let market_state = &mut ctx.accounts.market_state;
        market_state.admin = ctx.accounts.admin.key();
        market_state.next_prediction_id = 0;
        Ok(())
    }

    pub fn create_prediction(
        ctx: Context<CreatePrediction>,
        description: String,
        duration: i64,
        tags: Vec<String>,
        prediction_type: u8,
        options_count: u8,
    ) -> Result<()> {
        let market_state = &mut ctx.accounts.market_state;
        let prediction = &mut ctx.accounts.prediction;

        require!(ctx.accounts.admin.key() == market_state.admin, PredictionError::NotAuthorized);
        require!(duration > 0, PredictionError::InvalidDuration);

        let prediction_id = market_state.next_prediction_id;
        market_state.next_prediction_id = market_state.next_prediction_id.checked_add(1).ok_or(PredictionError::Overflow)?;

        prediction.id = prediction_id;
        prediction.state = PredictionState::Active;
        prediction.description = description;
        prediction.start_time = Clock::get()?.unix_timestamp;
        prediction.end_time = prediction.start_time.checked_add(duration).ok_or(PredictionError::Overflow)?;
        prediction.total_votes = 0;
        prediction.yes_votes = 0;
        prediction.no_votes = 0;
        prediction.yes_amount = 0;
        prediction.no_amount = 0;
        prediction.result = PredictionResult::Undefined;
        prediction.total_amount = 0;
        prediction.prediction_type = prediction_type;
        prediction.options_count = options_count;
        prediction.tags = tags;

        emit!(PredictionCreatedEvent {
            prediction_id,
            creator: ctx.accounts.admin.key(),
            description: prediction.description.clone(),
        });

        Ok(())
    }

    pub fn predict(
        ctx: Context<Predict>,
        verdict: bool,
        amount: u64,
    ) -> Result<()> {
        let prediction = &mut ctx.accounts.prediction;
        let user = &ctx.accounts.user;
        let user_prediction = &mut ctx.accounts.user_prediction;

        require!(prediction.state == PredictionState::Active, PredictionError::PredictionNotActive);
        require!(Clock::get()?.unix_timestamp < prediction.end_time, PredictionError::PredictionEnded);
        require!(amount > 0, PredictionError::InvalidAmount);

        // Transfer SOL from user to market account
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: user.to_account_info(),
                to: ctx.accounts.market_state.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, amount)?;

        prediction.total_votes = prediction.total_votes.checked_add(1).ok_or(PredictionError::Overflow)?;
        if verdict {
            prediction.yes_votes = prediction.yes_votes.checked_add(1).ok_or(PredictionError::Overflow)?;
            prediction.yes_amount = prediction.yes_amount.checked_add(amount).ok_or(PredictionError::Overflow)?;
        } else {
            prediction.no_votes = prediction.no_votes.checked_add(1).ok_or(PredictionError::Overflow)?;
            prediction.no_amount = prediction.no_amount.checked_add(amount).ok_or(PredictionError::Overflow)?;
        }

        prediction.total_amount = prediction.total_amount.checked_add(amount).ok_or(PredictionError::Overflow)?;

        user_prediction.user = user.key();
        user_prediction.prediction_id = prediction.id;
        user_prediction.amount = amount;
        user_prediction.verdict = verdict;

        emit!(PredictionMadeEvent {
            prediction_id: prediction.id,
            user: user.key(),
            verdict,
            amount,
        });

        Ok(())
    }
    
    pub fn resolve_prediction(ctx: Context<ResolvePrediction>, result: PredictionResult) -> Result<()> {
        let market_state = &ctx.accounts.market_state;
        let prediction = &mut ctx.accounts.prediction;

        require!(ctx.accounts.admin.key() == market_state.admin, PredictionError::NotAuthorized);
        require!(prediction.state != PredictionState::Resolved, PredictionError::PredictionAlreadyResolved);
        require!(result != PredictionResult::Undefined, PredictionError::InvalidResult);

        prediction.result = result;
        prediction.state = PredictionState::Resolved;

        emit!(PredictionResolvedEvent {
            prediction_id: prediction.id,
            result,
        });

        Ok(())
    }

    pub fn register_user(ctx: Context<RegisterUser>, alias: String) -> Result<()> {
        require!(alias.len() <= MAX_ALIAS_LENGTH, PredictionError::AliasTooLong);

        let user_account = &mut ctx.accounts.user_account;
        user_account.alias = alias;
        user_account.reputation = INITIAL_REPUTATION;
        user_account.rank = 0;
        user_account.total_predictions = 0;
        user_account.correct_predictions = 0;

        emit!(RegisterEvent {
            user_address: ctx.accounts.user.key(),
            alias: user_account.alias.clone(),
        });

        Ok(())
    }

    pub fn submit_claim(ctx: Context<SubmitClaim>) -> Result<()> {
        let prediction = &ctx.accounts.prediction;
        let claim = &mut ctx.accounts.claim;
        let user_prediction = &ctx.accounts.user_prediction;

        require!(prediction.state == PredictionState::Resolved, PredictionError::PredictionNotResolved);

        let is_winner = match prediction.result {
            PredictionResult::True => user_prediction.verdict,
            PredictionResult::False => !user_prediction.verdict,
            PredictionResult::Undefined => return Err(PredictionError::InvalidResult.into()),
        };

        require!(is_winner, PredictionError::UserNotWinner);

        claim.user = ctx.accounts.user.key();
        claim.prediction_id = prediction.id;
        claim.amount = user_prediction.amount;
        claim.state = ClaimState::Pending;

        emit!(ClaimSubmittedEvent {
            prediction_id: prediction.id,
            user: ctx.accounts.user.key(),
            amount: user_prediction.amount,
        });

        Ok(())
    }

    pub fn approve_claim(ctx: Context<ApproveClaim>) -> Result<()> {
        let market_state = &ctx.accounts.market_state;
        let prediction = &ctx.accounts.prediction;
        let claim = &mut ctx.accounts.claim;

        require!(ctx.accounts.admin.key() == market_state.admin, PredictionError::NotAuthorized);
        require!(claim.state == ClaimState::Pending, PredictionError::ClaimNotPending);

        let total_amount = prediction.total_amount;
        let fee_percentage = 5; // 5% fee
        let fee_amount = (total_amount * fee_percentage as u64) / 100;
        let reward_pool = total_amount - fee_amount;

        let winning_amount = match prediction.result {
            PredictionResult::True => prediction.yes_amount,
            PredictionResult::False => prediction.no_amount,
            PredictionResult::Undefined => return Err(PredictionError::InvalidResult.into()),
        };

        // Calculate reward
        let reward_per_lamport = (reward_pool * 1_000_000) / winning_amount; // Multiply by 1,000,000 for precision
        let reward_amount = (claim.amount * reward_per_lamport) / 1_000_000;

        // Transfer reward to the user
        let reward_transfer_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.market_state.to_account_info(),
                to: ctx.accounts.user.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(reward_transfer_ctx, reward_amount)?;

        claim.state = ClaimState::Approved;

        emit!(ClaimApprovedEvent {
            prediction_id: prediction.id,
            user: ctx.accounts.user.key(),
            amount: reward_amount,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 8)]
    pub market_state: Account<'info, MarketState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(description: String, duration: i64, tags: Vec<String>, prediction_type: u8, options_count: u8)]
pub struct CreatePrediction<'info> {
    #[account(mut)]
    pub market_state: Account<'info, MarketState>,
    #[account(
        init,
        payer = admin,
        space = 8 + 8 + 1 + 4 + description.len() + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 8 + 1 + 1 + 4 + tags.len() * 32
    )]
    pub prediction: Account<'info, Prediction>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(verdict: bool, amount: u64)]
pub struct Predict<'info> {
    #[account(mut)]
    pub market_state: Account<'info, MarketState>,
    #[account(mut)]
    pub prediction: Account<'info, Prediction>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 8 + 8 + 1,
        seeds = [b"user_prediction", prediction.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_prediction: Account<'info, UserPrediction>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct ResolvePrediction<'info> {
    pub market_state: Account<'info, MarketState>,
    #[account(mut)]
    pub prediction: Account<'info, Prediction>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterUser<'info> {
    #[account(init, payer = user, space = 8 + 4 + MAX_ALIAS_LENGTH + 8 + 8 + 8 + 8)]
    pub user_account: Account<'info, UserAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitClaim<'info> {
    #[account(mut)]
    pub prediction: Account<'info, Prediction>,
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 8 + 8 + 1,
        seeds = [b"claim", prediction.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub claim: Account<'info, Claim>,
    pub user_prediction: Account<'info, UserPrediction>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveClaim<'info> {
    #[account(mut)]
    pub market_state: Account<'info, MarketState>,
    pub prediction: Account<'info, Prediction>,
    #[account(mut)]
    pub claim: Account<'info, Claim>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: This account is not read in the contract, only written to
    #[account(mut)]
    pub user: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct MarketState {
    pub admin: Pubkey,
    pub next_prediction_id: u64,
}

#[account]
pub struct Prediction {
    pub id: u64,
    pub state: PredictionState,
    pub description: String,
    pub start_time: i64,
    pub end_time: i64,
    pub total_votes: u64,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub yes_amount: u64,
    pub no_amount: u64,
    pub result: PredictionResult,
    pub total_amount: u64,
    pub prediction_type: u8,
    pub options_count: u8,
    pub tags: Vec<String>,
}

#[account]
pub struct UserAccount {
    pub alias: String,
    pub rank: u64,
    pub reputation: u64,
    pub total_predictions: u64,
    pub correct_predictions: u64,
}

#[account]
pub struct UserPrediction {
    pub user: Pubkey,
    pub prediction_id: u64,
    pub amount: u64,
    pub verdict: bool,
}

#[account]
pub struct Claim {
    pub user: Pubkey,
    pub prediction_id: u64,
    pub amount: u64,
    pub state: ClaimState,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PredictionState {
    Active,
    Paused,
    Resolved,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PredictionResult {
    True,
    False,
    Undefined,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ClaimState {
    Pending,
    Approved,
    Rejected,
}

#[error_code]
pub enum PredictionError {
    #[msg("Not authorized to perform this action")]
    NotAuthorized,
    #[msg("Prediction is closed")]
    PredictionClosed,
    #[msg("Prediction is not active")]
    PredictionNotActive,
    #[msg("Prediction has ended")]
    PredictionEnded,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Prediction already resolved")]
    PredictionAlreadyResolved,
    #[msg("Prediction not resolved")]
    PredictionNotResolved,
    #[msg("Invalid result")]
    InvalidResult,
    #[msg("Invalid duration")]
    InvalidDuration,
    #[msg("No tags provided")]
    NoTags,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Alias too long")]
    AliasTooLong,
    #[msg("Claim is not in pending state")]
    ClaimNotPending,
    #[msg("User is not a winner")]
    UserNotWinner,
}

#[event]
pub struct PredictionCreatedEvent {
    pub prediction_id: u64,
    pub creator: Pubkey,
    pub description: String,
}

#[event]
pub struct PredictionMadeEvent {
    pub prediction_id: u64,
    pub user: Pubkey,
    pub verdict: bool,
    pub amount: u64,
}

#[event]
pub struct PredictionResolvedEvent {
    pub prediction_id: u64,
    pub result: PredictionResult,
}

#[event]
pub struct RegisterEvent {
    pub user_address: Pubkey,
    pub alias: String,
}

#[event]
pub struct ClaimSubmittedEvent {
    pub prediction_id: u64,
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ClaimApprovedEvent {
    pub prediction_id: u64,
    pub user: Pubkey,
    pub amount: u64,
}

// Constants
pub const INITIAL_REPUTATION: u64 = 100;
pub const MAX_ALIAS_LENGTH: usize = 20;