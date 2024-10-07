use anchor_lang::prelude::*;

declare_id!("J4bMC3qvhsjSDJojvVGUt1tzvm6xzk6R2hhUnwDSzH7s");

#[program]
pub mod prediction_marketplace {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let market_state = &mut ctx.accounts.market_state;
        market_state.admin = ctx.accounts.admin.key();
        market_state.next_prediction_id = 0;
        Ok(())
    }

    pub fn initialize_claims(ctx: Context<InitializeClaims>) -> Result<()> {
        let claims = &mut ctx.accounts.claims;
        claims.prediction = ctx.accounts.prediction.key();
        claims.reward_per_lamport = 0;
        claims.total_reward_pool = 0;
        claims.pending_claims = Vec::new();
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

        require!(
            ctx.accounts.admin.key() == market_state.admin,
            PredictionError::NotAuthorized
        );
        require!(duration > 0, PredictionError::InvalidDuration);

        let prediction_id = market_state.next_prediction_id;
        market_state.next_prediction_id = market_state
            .next_prediction_id
            .checked_add(1)
            .ok_or(PredictionError::Overflow)?;

        prediction.id = prediction_id;
        prediction.state = PredictionState::Active;
        prediction.description = description;
        prediction.start_time = Clock::get()?.unix_timestamp;
        prediction.end_time = prediction
            .start_time
            .checked_add(duration)
            .ok_or(PredictionError::Overflow)?;
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

    pub fn predict(ctx: Context<Predict>, verdict: bool, amount: u64) -> Result<()> {
        let prediction = &mut ctx.accounts.prediction;
        let user = &ctx.accounts.user;
        let user_prediction = &mut ctx.accounts.user_prediction;

        require!(
            prediction.state == PredictionState::Active,
            PredictionError::PredictionNotActive
        );
        require!(
            Clock::get()?.unix_timestamp < prediction.end_time,
            PredictionError::PredictionEnded
        );
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

        prediction.total_votes = prediction
            .total_votes
            .checked_add(1)
            .ok_or(PredictionError::Overflow)?;
        if verdict {
            prediction.yes_votes = prediction
                .yes_votes
                .checked_add(1)
                .ok_or(PredictionError::Overflow)?;
            prediction.yes_amount = prediction
                .yes_amount
                .checked_add(amount)
                .ok_or(PredictionError::Overflow)?;
        } else {
            prediction.no_votes = prediction
                .no_votes
                .checked_add(1)
                .ok_or(PredictionError::Overflow)?;
            prediction.no_amount = prediction
                .no_amount
                .checked_add(amount)
                .ok_or(PredictionError::Overflow)?;
        }

        prediction.total_amount = prediction
            .total_amount
            .checked_add(amount)
            .ok_or(PredictionError::Overflow)?;

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

    pub fn resolve_prediction(
        ctx: Context<ResolvePrediction>,
        result: PredictionResult,
    ) -> Result<()> {
        let market_state = &ctx.accounts.market_state;
        let prediction = &mut ctx.accounts.prediction;

        require!(
            ctx.accounts.admin.key() == market_state.admin,
            PredictionError::NotAuthorized
        );
        require!(
            prediction.state != PredictionState::Resolved,
            PredictionError::PredictionAlreadyResolved
        );
        require!(
            result != PredictionResult::Undefined,
            PredictionError::InvalidResult
        );

        prediction.result = result;
        prediction.state = PredictionState::Resolved;

        emit!(PredictionResolvedEvent {
            prediction_id: prediction.id,
            result,
        });

        Ok(())
    }

    pub fn submit_claim(ctx: Context<SubmitClaim>) -> Result<()> {
        let prediction = &ctx.accounts.prediction;
        let claims = &mut ctx.accounts.claims;
        let user_prediction = &ctx.accounts.user_prediction;

        require!(
            prediction.state == PredictionState::Resolved,
            PredictionError::PredictionNotResolved
        );

        let is_winner = match prediction.result {
            PredictionResult::True => user_prediction.verdict,
            PredictionResult::False => !user_prediction.verdict,
            PredictionResult::Undefined => return Err(PredictionError::InvalidResult.into()),
        };

        require!(is_winner, PredictionError::UserNotWinner);

        let reward_amount = (user_prediction.amount * claims.reward_per_lamport) / 1_000_000;

        claims.pending_claims.push(Claim {
            user: ctx.accounts.user.key(),
            amount: reward_amount,
            state: ClaimState::Pending,
        });

        emit!(ClaimSubmittedEvent {
            prediction_id: prediction.id,
            user: ctx.accounts.user.key(),
            amount: reward_amount,
        });

        Ok(())
    }

    pub fn distribute_rewards(ctx: Context<DistributeRewards>) -> Result<()> {
        let prediction = &mut ctx.accounts.prediction;
        let market_state = &ctx.accounts.market_state;

        // Ensure the prediction is resolved
        require!(
            prediction.state == PredictionState::Resolved,
            PredictionError::PredictionNotResolved
        );

        // Ensure rewards haven't been distributed yet
        require!(
            !prediction.rewards_distributed,
            PredictionError::RewardsAlreadyDistributed
        );

        let total_pool = prediction.total_amount;
        let admin_fee = (total_pool * 5) / 100; // 5% admin fee
        let reward_pool = total_pool - admin_fee;

        // Transfer admin fee
        let admin_transfer_instruction = anchor_lang::system_program::Transfer {
            from: prediction.to_account_info(),
            to: market_state.to_account_info(),
        };
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                admin_transfer_instruction,
                &[&[
                    b"prediction",
                    market_state.key().as_ref(),
                    prediction.id.to_le_bytes().as_ref(),
                    &[ctx.bumps.prediction],
                ]],
            ),
            admin_fee,
        )?;

        // Calculate winning amount
        let winning_amount = if prediction.result == PredictionResult::True {
            prediction.yes_amount
        } else {
            prediction.no_amount
        };

        // Calculate reward per lamport
        let reward_per_lamport = (reward_pool * 1_000_000) / winning_amount;

        prediction.reward_per_lamport = reward_per_lamport;
        prediction.rewards_distributed = true;

        emit!(RewardsDistributedEvent {
            prediction_id: prediction.id,
            total_pool,
            admin_fee,
            reward_pool,
            reward_per_lamport,
        });

        Ok(())
    }

    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        let prediction = &ctx.accounts.prediction;
        let user_prediction = &mut ctx.accounts.user_prediction;
        let user = &ctx.accounts.user;

        // Ensure the prediction is resolved and rewards are distributed
        require!(
            prediction.state == PredictionState::Resolved,
            PredictionError::PredictionNotResolved
        );
        require!(
            prediction.rewards_distributed,
            PredictionError::RewardsNotDistributed
        );

        // Ensure the user hasn't claimed their reward yet
        require!(
            !user_prediction.reward_claimed,
            PredictionError::RewardAlreadyClaimed
        );

        // Check if the user is a winner
        let is_winner = match prediction.result {
            PredictionResult::True => user_prediction.verdict,
            PredictionResult::False => !user_prediction.verdict,
            PredictionResult::Undefined => return Err(PredictionError::InvalidResult.into()),
        };
        require!(is_winner, PredictionError::UserNotWinner);

        // Calculate the reward
        let reward = (user_prediction.amount * prediction.reward_per_lamport) / 1_000_000;

        // Transfer the reward
        let transfer_instruction = anchor_lang::system_program::Transfer {
            from: prediction.to_account_info(),
            to: user.to_account_info(),
        };
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                transfer_instruction,
                &[&[
                    b"prediction",
                    ctx.accounts.market_state.key().as_ref(),
                    prediction.id.to_le_bytes().as_ref(),
                    &[ctx.bumps.prediction],
                ]],
            ),
            reward,
        )?;

        // Mark the reward as claimed
        user_prediction.reward_claimed = true;

        emit!(RewardClaimedEvent {
            prediction_id: prediction.id,
            user: user.key(),
            amount: reward,
        });

        Ok(())
    }

    pub fn approve_claims(ctx: Context<ApproveClaims>, claim_indices: Vec<u64>) -> Result<()> {
        let market_state = &ctx.accounts.market_state;
        let prediction = &ctx.accounts.prediction;
        let claims = &mut ctx.accounts.claims;

        require!(
            ctx.accounts.admin.key() == market_state.admin,
            PredictionError::NotAuthorized
        );

        let mut total_approved_amount = 0;

        for &index in claim_indices.iter() {
            require!(
                (index as usize) < claims.pending_claims.len(),
                PredictionError::InvalidClaimIndex
            );
            let claim = &mut claims.pending_claims[index as usize];
            require!(
                claim.state == ClaimState::Pending,
                PredictionError::ClaimNotPending
            );

            claim.state = ClaimState::Approved;
            total_approved_amount += claim.amount;

            emit!(ClaimApprovedEvent {
                prediction_id: prediction.id,
                user: claim.user,
                amount: claim.amount,
            });
        }

        // Transfer total approved amount to the claims account
        let transfer_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.market_state.to_account_info(),
                to: ctx.accounts.claims.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(transfer_ctx, total_approved_amount)?;

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
        space = 8 + 32 + 8 + 8 + 1 + 1, // Adjust this if needed
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
pub struct DistributeRewards<'info> {
    #[account(
        mut,
        seeds = [b"prediction", market_state.key().as_ref(), prediction.id.to_le_bytes().as_ref()],
        bump
    )]
    pub prediction: Account<'info, Prediction>,
    #[account(mut)]
    pub market_state: Account<'info, MarketState>,
    #[account(mut, constraint = admin.key() == market_state.admin @ PredictionError::NotAuthorized)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(mut)]
    pub market_state: Account<'info, MarketState>,
    #[account(
        mut,
        seeds = [b"prediction", market_state.key().as_ref(), prediction.id.to_le_bytes().as_ref()],
        bump
    )]
    pub prediction: Account<'info, Prediction>,
    #[account(
        mut,
        seeds = [b"user_prediction", prediction.key().as_ref(), user.key().as_ref()],
        bump,
        constraint = user_prediction.user == user.key() @ PredictionError::NotAuthorized,
        constraint = user_prediction.prediction_id == prediction.id @ PredictionError::InvalidPrediction,
    )]
    pub user_prediction: Account<'info, UserPrediction>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitClaim<'info> {
    #[account(mut)]
    pub prediction: Account<'info, Prediction>,
    #[account(mut)]
    pub claims: Account<'info, Claims>,
    pub user_prediction: Account<'info, UserPrediction>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveClaims<'info> {
    #[account(mut)]
    pub market_state: Account<'info, MarketState>,
    pub prediction: Account<'info, Prediction>,
    #[account(mut)]
    pub claims: Account<'info, Claims>,
    #[account(mut)]
    pub admin: Signer<'info>,
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
    pub reward_info: Option<RewardInfo>,
    pub reward_per_lamport: u64,
    pub rewards_distributed: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct RewardInfo {
    pub reward_per_lamport: u64,
    pub total_reward_pool: u64,
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
#[derive(Default)]
pub struct UserPrediction {
    pub user: Pubkey,
    pub prediction_id: u64,
    pub amount: u64,
    pub verdict: bool,
    pub reward_claimed: bool,
}

#[account]
pub struct Claims {
    pub prediction: Pubkey,
    pub reward_per_lamport: u64,
    pub total_reward_pool: u64,
    pub pending_claims: Vec<Claim>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Claim {
    pub user: Pubkey,
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
    Claimed,
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
    #[msg("Invalid claim index")]
    InvalidClaimIndex,
    #[msg("No approved claim found for the user")]
    NoApprovedClaim,
    #[msg("Reward already claimed")]
    AlreadyClaimed,
    #[msg("Claim Not winner")]
    NotWinner,
    #[msg("Rewards have already been distributed")]
    RewardsAlreadyDistributed,
    #[msg("Rewards have not been distributed yet")]
    RewardsNotDistributed,
    #[msg("Reward already claimed")]
    RewardAlreadyClaimed,
    #[msg("Invalid Prediction")]
    InvalidPrediction,
}

#[event]
pub struct RewardsDistributedEvent {
    pub prediction_id: u64,
    pub total_pool: u64,
    pub admin_fee: u64,
    pub reward_pool: u64,
    pub reward_per_lamport: u64,
}

#[event]
pub struct RewardClaimedEvent {
    pub prediction_id: u64,
    pub user: Pubkey,
    pub amount: u64,
}

#[derive(Accounts)]
pub struct InitializeClaims<'info> {
    #[account(mut)]
    pub prediction: Account<'info, Prediction>,
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 8 + 8 + 4 + (32 + 8 + 1) * 5000, // Increased from 1000 to 5000
        seeds = [b"claims", prediction.key().as_ref()],
        bump
    )]
    pub claims: Account<'info, Claims>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
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
