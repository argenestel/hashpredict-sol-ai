import React, { useState, useEffect } from 'react';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { motion } from 'framer-motion';
import { IoTimeOutline, IoWalletOutline, IoTrendingUp, IoTrendingDown, IoSwapHorizontal, IoAdd, IoRemove, IoCheckmark, IoClose, IoCash, IoBulb, IoRefresh } from 'react-icons/io5';
import axios from 'axios';
import toast from 'react-hot-toast';

interface PredictionData {
  publicKey: PublicKey;
  account: {
    id: string;
    state: { active: {} } | { paused: {} } | { resolved: {} };
    description: string;
    startTime: string;
    endTime: string;
    totalVotes: string;
    yesVotes: string;
    noVotes: string;
    yesAmount: string;
    noAmount: string;
    result: { undefined: {} } | { true: {} } | { false: {} };
    totalAmount: string;
    predictionType: number;
    optionsCount: number;
    tags: string[];
  };
}

interface PredictionCardProps {
  prediction: PredictionData;
  onPredict: (predictionPublicKey: PublicKey, verdict: boolean, amount: number) => void;
  isAdmin: boolean;
  program: any;
  wallet: any;
}

const PredictionCard: React.FC<PredictionCardProps> = ({ prediction, onPredict, isAdmin, program, wallet }) => {
  const [shareAmount, setShareAmount] = useState(1);
  const [isYesSelected, setIsYesSelected] = useState(true);
  const [isPredictionEnded, setIsPredictionEnded] = useState(false);
  const [showUSD, setShowUSD] = useState(true);
  const [solPrice, setSolPrice] = useState(0);
  const [outcome, setOutcome] = useState<number>(0);
  const [isAIFinalizing, setIsAIFinalizing] = useState(false);
  const [canClaim, setCanClaim] = useState(false);
  const [claimsPending, setClaimsPending] = useState(false);
  const [claimsToApprove, setClaimsToApprove] = useState<any[]>([]);

  useEffect(() => {
    if (prediction) {
      setIsPredictionEnded(Date.now() / 1000 > Number(prediction.account.endTime));
    }
    fetchSolPrice();
    checkClaimEligibility();
  }, [prediction, wallet.publicKey]);

  const checkClaimEligibility = async () => {
    if (wallet.publicKey && 'resolved' in prediction.account.state) {
      try {
        const [userPrediction] = await PublicKey.findProgramAddress(
          [
            Buffer.from("user_prediction"),
            prediction.publicKey.toBuffer(),
            wallet.publicKey.toBuffer(),
          ],
          program.programId
        );
        const userPredictionAccount = await program.account.userPrediction.fetch(userPrediction);
        const isWinner = 
          (userPredictionAccount.verdict && 'true' in prediction.account.result) ||
          (!userPredictionAccount.verdict && 'false' in prediction.account.result);
        setCanClaim(isWinner);
      } catch (error) {
        console.error('Error checking claim eligibility:', error);
      }
    }
  };
  const [isClaimsInitialized, setIsClaimsInitialized] = useState(false);
  const checkClaimsInitialized = async () => {
    try {
      const [claims] = await PublicKey.findProgramAddressSync(
        [Buffer.from("claims"), prediction.publicKey.toBuffer()],
        program.programId
      );
      const claimsAccount = await program.provider.connection.getAccountInfo(claims);
      setIsClaimsInitialized(claimsAccount !== null);
    } catch (error) {
      console.error('Error checking if claims are initialized:', error);
    }
  };
  

  const initializeClaims = async () => {
    if (!wallet.publicKey || !isAdmin) {
      toast.error('Only admin can initialize claims');
      return;
    }

    try {
      const [claims] = await PublicKey.findProgramAddressSync(
        [Buffer.from("claims"), prediction.publicKey.toBuffer()],
        program.programId
      );

      const tx = await program.methods
        .initializeClaims()
        .accounts({
          prediction: prediction.publicKey,
          claims,
          admin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Claims initialized:", tx);
      toast.success('Claims initialized successfully');
      setIsClaimsInitialized(true);
    } catch (error) {
      console.error('Error initializing claims:', error);
      toast.error('Failed to initialize claims');
    }
  };


  const handleSubmitClaim = async () => {
    if (!wallet.publicKey) {
      toast.error('Wallet not connected');
      return;
    }

    if (!isClaimsInitialized) {
      toast.error('Claims not initialized. Please wait for admin to initialize.');
      return;
    }

    try {
      const [claims] = await PublicKey.findProgramAddressSync(
        [Buffer.from("claims"), prediction.publicKey.toBuffer()],
        program.programId
      );

      const [userPrediction] = await PublicKey.findProgramAddressSync(
        [Buffer.from("user_prediction"), prediction.publicKey.toBuffer(), wallet.publicKey.toBuffer()],
        program.programId
      );

      const tx = await program.methods
        .submitClaim()
        .accounts({
          prediction: prediction.publicKey,
          claims,
          userPrediction,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Claim submitted:", tx);
      toast.success('Claim submitted successfully');
      setCanClaim(false);
    } catch (error) {
      console.error('Error submitting claim:', error);
      if (error instanceof Error) {
        if (error.message.includes('PredictionNotResolved')) {
          toast.error('Failed to submit claim: Prediction not resolved yet');
        } else if (error.message.includes('UserNotWinner')) {
          toast.error('Failed to submit claim: You did not win this prediction');
        } else {
          toast.error(`Failed to submit claim: ${error.message}`);
        }
      } else {
        toast.error('An unknown error occurred while submitting the claim');
      }
    }
  };

  const handleApproveClaims = async (claimIndices: number[]) => {
    if (!wallet.publicKey) return;
    try {
      const [claims] = await PublicKey.findProgramAddressSync(
        [Buffer.from("claims"), prediction.publicKey.toBuffer()],
        program.programId
      );

      const tx = await program.methods
        .approveClaims(claimIndices)
        .accounts({
          marketState: new PublicKey("Gsmt7fBHxJcdzSy9M3tACdTBf66ku5iLrxgnjtUxt2An"),
          prediction: prediction.publicKey,
          claims,
          admin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Claims approved:", tx);
      toast.success('Claims approved successfully');
      fetchPendingClaims();
    } catch (error) {
      console.error('Error approving claims:', error);
      toast.error('Failed to approve claims');
    }
  };

  const fetchPendingClaims = async () => {
    try {
      const [claims] = await PublicKey.findProgramAddressSync(
        [Buffer.from("claims"), prediction.publicKey.toBuffer()],
        program.programId
      );
      const claimsAccount = await program.account.claims.fetch(claims);
      setClaimsToApprove(claimsAccount.pendingClaims);
    } catch (error) {
      console.error('Error fetching pending claims:', error);
    }
  };


  const fetchSolPrice = async () => {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      setSolPrice(response.data.solana.usd);
    } catch (error) {
      console.error('Error fetching SOL price:', error);
    }
  };

  const formatPrice = (amount: string) => {
    const solAmount = Number(amount) / LAMPORTS_PER_SOL;
    if (showUSD) {
      const usdAmount = solAmount * solPrice;
      return `$${usdAmount.toFixed(2)}`;
    } else {
      return `${solAmount.toFixed(2)} SOL`;
    }
  };

  const formatSol = (lamports: string | number) => {
    const solAmount = (Number(lamports) / LAMPORTS_PER_SOL).toFixed(2);
    return showUSD ? `$${(Number(solAmount) * solPrice).toFixed(2)}` : `${solAmount} SOL`;
  };

  const calculatePotentialPayout = () => {
    const betAmount = new BN(shareAmount * LAMPORTS_PER_SOL);
    const totalPool = new BN(prediction.account.totalAmount);
    const selectedPool = isYesSelected ? new BN(prediction.account.yesAmount) : new BN(prediction.account.noAmount);
    
    if (totalPool.eqn(0) || selectedPool.eqn(0)) return '0';

    try {
      const payoutRatio = totalPool.mul(new BN(95)).div(selectedPool).toNumber() / 100;
      const potentialPayout = betAmount.mul(new BN(payoutRatio)).div(new BN(LAMPORTS_PER_SOL));
      return formatSol(potentialPayout.toString());
    } catch (error) {
      console.error('Error calculating potential payout:', error);
      return '0';
    }
  };



  const handlePredict = async () => {
    if (!wallet.publicKey) {
      toast.error('Wallet not connected');
      return;
    }

    try {
      const amount = new BN(shareAmount * LAMPORTS_PER_SOL);

      const [userPrediction] = await PublicKey.findProgramAddress(
        [
          Buffer.from("user_prediction"),
          prediction.publicKey.toBuffer(),
          wallet.publicKey.toBuffer(),
        ],
        program.programId
      );

      const tx = await program.methods
        .predict(isYesSelected, amount)
        .accounts({
          marketState: new PublicKey("Gsmt7fBHxJcdzSy9M3tACdTBf66ku5iLrxgnjtUxt2An"),
          prediction: prediction.publicKey,
          user: wallet.publicKey,
          userPrediction: userPrediction,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Prediction transaction confirmed:", tx);
      toast.success('Prediction made successfully');
      onPredict(prediction.publicKey, isYesSelected, shareAmount * LAMPORTS_PER_SOL);
    } catch (error) {
      console.error('Error making prediction:', error);
      if (error instanceof Error) {
        if (error.message.includes('0x1')) {
          toast.error('Prediction failed: Invalid prediction state or parameters');
        } else if (error.message.includes('0x2')) {
          toast.error('Prediction failed: Insufficient funds');
        } else {
          toast.error(`Prediction failed: ${error.message}`);
        }
      } else {
        toast.error('An unknown error occurred while making the prediction');
      }
    }
  };

  const handleFinalize = async (useAI = false) => {
    if (!wallet.publicKey) return;
    try {
      let finalOutcome;
      if (useAI) {
        setIsAIFinalizing(true);
        try {
          const response = await axios.post(`${process.env.NEXT_PUBLIC_SERVER_URL}/finalize-prediction/${prediction.account.id}`);
          finalOutcome = response.data.outcome;
        } catch (error) {
          console.error('Error finalizing with AI:', error);
          setIsAIFinalizing(false);
          return;
        }
      } else {
        finalOutcome = outcome;
      }

      const tx = await program.methods
        .resolvePrediction({ [finalOutcome ? 'true' : 'false']: {} })
        .accounts({
          marketState: new PublicKey("Gsmt7fBHxJcdzSy9M3tACdTBf66ku5iLrxgnjtUxt2An"),
          prediction: prediction.publicKey,
          admin: wallet.publicKey,
        })
        .rpc();

      await program.provider.connection.confirmTransaction(tx, "confirmed");
      console.log(`Prediction finalized ${useAI ? 'with AI' : 'by admin'}`);
      toast.success('Prediction finalized successfully');
    } catch (error) {
      console.error('Error finalizing prediction:', error);
      toast.error('Failed to finalize prediction');
    } finally {
      setIsAIFinalizing(false);
    }
  };

  const handleClaim = async () => {
    if (!wallet.publicKey) {
      toast.error('Wallet not connected');
      return;
    }
  
    try {
      const [claims] = await PublicKey.findProgramAddressSync(
        [Buffer.from("claims"), prediction.publicKey.toBuffer()],
        program.programId
      );
  
      const [userPrediction] = await PublicKey.findProgramAddressSync(
        [Buffer.from("user_prediction"), prediction.publicKey.toBuffer(), wallet.publicKey.toBuffer()],
        program.programId
      );
  
      const tx = await program.methods
        .claimReward()
        .accounts({
          prediction: prediction.publicKey,
          userPrediction: userPrediction,
          user: wallet.publicKey,
          claims: claims,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
  
      await program.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Reward claimed:", tx);
      toast.success('Reward claimed successfully');
      setCanClaim(false);
    } catch (error) {
      console.error('Error claiming reward:', error);
      if (error instanceof Error) {
        if (error.message.includes('PredictionNotResolved')) {
          toast.error('Failed to claim reward: Prediction not resolved yet');
        } else if (error.message.includes('UserNotWinner')) {
          toast.error('Failed to claim reward: You did not win this prediction');
        } else if (error.message.includes('RewardsNotDistributed')) {
          toast.error('Failed to claim reward: Rewards have not been distributed yet');
        } else if (error.message.includes('AlreadyClaimed')) {
          toast.error('Failed to claim reward: You have already claimed your reward');
        } else {
          toast.error(`Failed to claim reward: ${error.message}`);
        }
      } else {
        toast.error('An unknown error occurred while claiming the reward');
      }
    }
  };
  
  const handleDistributeRewards = async () => {
    if (!wallet.publicKey) return;
    try {
      const [claims] = await PublicKey.findProgramAddressSync(
        [Buffer.from("claims"), prediction.publicKey.toBuffer()],
        program.programId
      );

      // Check if the claims account exists
      const claimsAccount = await program.provider.connection.getAccountInfo(claims);

      if (!claimsAccount) {
        // If the claims account doesn't exist, we need to initialize it
        console.log("Claims account doesn't exist. Initializing...");
        const initTx = await program.methods
          .initializeClaims()
          .accounts({
            prediction: prediction.publicKey,
            claims,
            admin: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        await program.provider.connection.confirmTransaction(initTx, "confirmed");
        console.log("Claims account initialized:", initTx);
      }

      const tx = await program.methods
        .distributeRewards()
        .accounts({
          prediction: prediction.publicKey,
          marketState: new PublicKey("Gsmt7fBHxJcdzSy9M3tACdTBf66ku5iLrxgnjtUxt2An"),
          claims,
          admin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Rewards distributed:", tx);
      toast.success('Rewards distributed successfully');
      setClaimsPending(true);
      fetchPendingClaims();
    } catch (error) {
      console.error('Error distributing rewards:', error);
      toast.error('Failed to distribute rewards');
    }
  };



  const handleCancel = async () => {
    if (!wallet.publicKey) return;
    try {
      // Implement cancel functionality
      toast.error('Cancel functionality not implemented');
    } catch (error) {
      console.error('Error cancelling prediction:', error);
      toast.error('Failed to cancel prediction');
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  const calculatePercentage = (votes: string, total: string) => {
    const votesNum = Number(votes);
    const totalNum = Number(total);
    return totalNum > 0 ? (votesNum / totalNum) * 100 : 50;
  };

  const { description, endTime, state, yesVotes, noVotes, totalVotes, totalAmount, tags } = prediction.account;

  const yesPercentage = calculatePercentage(yesVotes, totalVotes);
  const noPercentage = calculatePercentage(noVotes, totalVotes);

  const isActive = 'active' in state;
  const isResolved = 'resolved' in state;

  return (
    <motion.div 
      className="bg-white dark:bg-navy-800 rounded-xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-2xl border border-gray-200 dark:border-navy-700 flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="p-6 flex-grow">
        <h2 className="text-xl font-bold text-navy-700 dark:text-white mb-3 line-clamp-4">
          {description}
        </h2>
        <div className="flex flex-wrap items-center justify-between mb-6 text-sm text-gray-600 dark:text-gray-400 gap-2">
          <div className="flex items-center bg-gray-100 dark:bg-navy-700 rounded-full px-3 py-1">
            <IoTimeOutline className="mr-2 text-brand-500" />
            <span>Ends: {formatTime(endTime)}</span>
          </div>
          <div className="flex items-center bg-brand-100 dark:bg-brand-900 rounded-full px-3 py-1">
            <IoWalletOutline className="mr-2 text-brand-500" />
            <span className="font-semibold text-brand-700 dark:text-brand-300">
              Pool: {formatPrice(totalAmount)}
            </span>
            <button 
              onClick={() => setShowUSD(!showUSD)} 
              className="ml-2 text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300"
            >
              <IoSwapHorizontal />
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {tags.map((tag, index) => (
            <span key={index} className="bg-gray-200 dark:bg-navy-600 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full text-xs">
              {tag}
            </span>
          ))}
        </div>
        
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <motion.span 
              className="text-sm font-medium text-green-500 dark:text-green-400 flex items-center"
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <IoTrendingUp className="mr-1" />
              Yes: {yesPercentage.toFixed(1)}%
            </motion.span>
            <motion.span 
              className="text-sm font-medium text-red-500 dark:text-red-400 flex items-center"
              initial={{ x: 10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <IoTrendingDown className="mr-1" />
              No: {noPercentage.toFixed(1)}%
            </motion.span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-navy-700 rounded-full h-3 overflow-hidden relative">
            <motion.div 
              className="absolute left-0 h-full rounded-full bg-gradient-to-r from-green-400 to-brand-500 dark:from-green-500 dark:to-brand-400"
              initial={{ width: 0 }}
              animate={{ width: `${yesPercentage}%` }}
              transition={{ duration: 0.5, delay: 0.2 }}
            />
            <motion.div 
              className="absolute right-0 h-full rounded-full bg-gradient-to-l from-red-400 to-brand-400 dark:from-red-500 dark:to-brand-300"
              initial={{ width: 0 }}
              animate={{ width: `${noPercentage}%` }}
              transition={{ duration: 0.5, delay: 0.2 }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 dark:text-gray-400 mb-6">
          <div className="bg-gray-50 dark:bg-navy-900 rounded-lg p-3">
            <p className="font-semibold mb-1">Yes Votes: {Number(yesVotes).toLocaleString()}</p>
            <p>Yes Amount: {formatPrice(prediction.account.yesAmount)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-navy-900 rounded-lg p-3">
            <p className="font-semibold mb-1">No Votes: {Number(noVotes).toLocaleString()}</p>
            <p>No Amount: {formatPrice(prediction.account.noAmount)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-navy-700 dark:text-white flex items-center text-sm font-medium">
            Status: 
            <span className={`ml-2 px-2 py-1 rounded-full ${
              isActive ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
              isResolved ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100' :
              'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
            }`}>
              {isActive ? 'Active' : isResolved ? 'Resolved' : 'Cancelled'}
            </span>
          </div>
          {isActive && (
            <div className="text-navy-700 dark:text-white flex items-center text-sm font-medium">
              Potential Payout: 
              <span className="ml-2 px-2 py-1 rounded-full bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100">
                {calculatePotentialPayout()}
              </span>
            </div>
          )}
        </div>
        {isResolved && (
          <p className="text-navy-700 dark:text-white mt-4 text-sm font-medium">
            Result: 
            <span className={`ml-2 px-2 py-1 rounded-full ${
              'true' in prediction.account.result ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
              'false' in prediction.account.result ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100' :
              'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
            }`}>
              {'true' in prediction.account.result ? 'Yes' : 'false' in prediction.account.result ? 'No' : 'Undefined'}
            </span>
          </p>
        )}
      </div>



      {isResolved && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          {isAdmin && !isClaimsInitialized && (
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={initializeClaims}
              className="w-full bg-blue-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center mb-4"
            >
              <IoAdd className="mr-2" /> Initialize Claims
            </motion.button>
          )}
          {canClaim && (
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSubmitClaim}
              disabled={!isClaimsInitialized}
              className={`w-full ${isClaimsInitialized ? 'bg-green-500' : 'bg-gray-400'} text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center`}
            >
              <IoCash className="mr-2" /> Submit Claim
            </motion.button>
          )}
        </div>
      )}

      {isAdmin && isResolved && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <button 
            onClick={fetchPendingClaims}
            className="w-full bg-blue-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center mb-4"
          >
            <IoRefresh className="mr-2" /> Refresh Pending Claims
          </button>
          {claimsToApprove.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Pending Claims</h3>
              {claimsToApprove.map((claim, index) => (
                <div key={index} className="flex justify-between items-center mb-2">
                  <span>{claim.user.toString().slice(0, 8)}...</span>
                  <span>{formatSol(claim.amount)} SOL</span>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleApproveClaims([index])}
                    className="bg-green-500 text-white rounded-lg py-1 px-3 text-sm font-medium"
                  >
                    Approve
                  </motion.button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {isActive && !isPredictionEnded && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2 flex-grow">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsYesSelected(true)}
                className={`py-2 px-4 rounded-lg transition-colors duration-200 text-sm font-medium flex-1 ${
                  isYesSelected 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-200 dark:bg-navy-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Yes
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsYesSelected(false)}
                className={`py-2 px-4 rounded-lg transition-colors duration-200 text-sm font-medium flex-1 ${
                  !isYesSelected 
                    ? 'bg-red-500 text-white' 
                    : 'bg-gray-200 dark:bg-navy-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                No
              </motion.button>
            </div>
          </div>
          <div className="flex items-center space-x-2 mb-4">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setShareAmount(prev => Math.max(1, prev - 1))}
              className="bg-gray-200 dark:bg-navy-700 text-gray-700 dark:text-gray-300 rounded-full p-2"
            >
              <IoRemove size={16} />
            </motion.button>
            <input 
              type="number" 
              value={shareAmount}
              onChange={(e) => setShareAmount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 text-center border dark:border-navy-600 rounded-lg py-2 bg-white dark:bg-navy-900 text-gray-700 dark:text-gray-300 text-sm"
            />
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setShareAmount(prev => prev + 1)}
              className="bg-gray-200 dark:bg-navy-700 text-gray-700 dark:text-gray-300 rounded-full p-2"
            >
              <IoAdd size={16} />
            </motion.button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              ({formatPrice((shareAmount * LAMPORTS_PER_SOL).toString())})
            </span>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePredict}
            className="w-full bg-gradient-to-r from-brand-400 to-brand-500 dark:from-brand-500 dark:to-brand-400 text-white rounded-lg py-3 px-4 transition-all duration-200 text-sm font-medium"
          >
            Predict
          </motion.button>
        </div>
      )}



      {/* {isAdmin && isResolved && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <button 
            onClick={fetchPendingClaims}
            className="w-full bg-blue-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center mb-4"
          >
            <IoRefresh className="mr-2" /> Refresh Pending Claims
          </button>
          {claimsToApprove.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Pending Claims</h3>
              {claimsToApprove.map((claim, index) => (
                <div key={index} className="flex justify-between items-center mb-2">
                  <span>{claim.user.toString().slice(0, 8)}...</span>
                  <span>{formatSol(claim.amount)} SOL</span>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleApproveClaims([index])}
                    className="bg-green-500 text-white rounded-lg py-1 px-3 text-sm font-medium"
                  >
                    Approve
                  </motion.button>
                </div>
              ))}
            </div>
          )}
        </div>
      )} */}

      {isAdmin && isActive && isPredictionEnded && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <div className="flex flex-col space-y-3">
            <div className="flex items-center space-x-2">
              <select 
                value={outcome}
                onChange={(e) => setOutcome(parseInt(e.target.value))}
                className="flex-grow p-2 border rounded dark:bg-navy-700 dark:border-navy-600 text-sm"
              >
                <option value={0}>Yes</option>
                <option value={1}>No</option>
              </select>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleFinalize(false)}
                className="bg-blue-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center"
              >
                <IoCheckmark className="mr-1" /> Admin Finalize
              </motion.button>
            </div>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleFinalize(true)}
              disabled={isAIFinalizing}
              className="w-full bg-purple-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center"
            >
              {isAIFinalizing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Finalizing with AI...
                </>
              ) : (
                <>
                  <IoBulb className="mr-2" /> Finalize with AI
                </>
              )}
            </motion.button>
          </div>
        </div>
      )}

      {isAdmin && isActive && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCancel}
            className="w-full bg-red-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center"
          >
            <IoClose className="mr-2" /> Cancel Prediction
          </motion.button>
        </div>
      )}

{isAdmin && isResolved && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDistributeRewards}
            className="w-full bg-green-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center mb-4"
          >
            <IoCash className="mr-2" /> Distribute Rewards
          </motion.button>
          {claimsPending && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Pending Claims</h3>
              {claimsToApprove.map((claim, index) => (
                <div key={index} className="flex justify-between items-center mb-2">
                  <span>{claim.user.toString().slice(0, 8)}...</span>
                  <span>{formatSol(claim.amount)} SOL</span>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleApproveClaims([index])}
                    className="bg-blue-500 text-white rounded-lg py-1 px-3 text-sm font-medium"
                  >
                    Approve
                  </motion.button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isActive && isPredictionEnded && !isAdmin && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <div className="text-center text-sm font-medium text-gray-600 dark:text-gray-400">
            <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100 px-2 py-1 rounded-full">
              This prediction has ended and is awaiting finalization
            </span>
          </div>
        </div>
      )}

      {(isResolved || 'paused' in state) && !isAdmin && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <div className="text-center text-sm font-medium text-gray-600 dark:text-gray-400">
            {isResolved ? (
              <span className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100 px-2 py-1 rounded-full">
                This prediction has been resolved
              </span>
            ) : (
              <span className="bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100 px-2 py-1 rounded-full">
                This prediction has been paused
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default PredictionCard;