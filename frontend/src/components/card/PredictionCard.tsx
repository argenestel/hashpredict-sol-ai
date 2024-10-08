import React, { useState, useEffect, useCallback } from 'react';
import { clusterApiUrl, Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { AnimatePresence, motion } from 'framer-motion';
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
    pendingClaims: { user: PublicKey; amount: BN; shares: number }[];
  };
}

interface PendingClaim {
  user: PublicKey;
  amount: BN;
  shares: number; // Add this field
}

interface PredictionCardProps {
  prediction: PredictionData;
  onPredict: (predictionPublicKey: PublicKey, verdict: boolean, amount: number) => void;
  isAdmin: boolean;
  program: any;
  wallet: any;
}

const PYTH_SOL_PRICE_FEED_ID = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';


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
  const [pendingClaims, setPendingClaims] = useState<{ user: PublicKey; amount: BN }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MARKET_STATE_PUBKEY = new PublicKey("CySirkQdQbfQzBj3Wgk1Qt7BRU25hV6DiSWxhi7xs9JL");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<any>(null);
  const [isExecutingFinalization, setIsExecutingFinalization] = useState(false);

  const [isClaimsInitialized, setIsClaimsInitialized] = useState(false);
  const [rewardsDistributed, setRewardsDistributed] = useState(false);

  const [allPredictions, setAllPredictions] = useState<any[]>([]);

  // useEffect(() => {
  //   if (program) {
  //     fetchAllPredictions();
  //   }
  // }, [program]);

  // const fetchAllPredictions = async () => {
  //   try {
  //     const predictions = await program.account.prediction.all();
  //     setAllPredictions(predictions);
  //     console.log("All predictions:", predictions);
  //   } catch (error) {
  //     console.error("Error fetching all predictions:", error);
  //   }
  // };

  useEffect(() => {
    if (prediction.account.pendingClaims) {
      setPendingClaims(prediction.account.pendingClaims);
    }
  }, [prediction.account.pendingClaims]);

  const fetchWithRetry = async (fetchFunction, maxRetries = 5) => {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        return await fetchFunction();
      } catch (error) {
        if (error.message.includes('429') && retries < maxRetries - 1) {
          const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000;
          console.log(`Retrying after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
        } else {
          throw error;
        }
      }
    }
  };

  const fetchData = useCallback(async () => {
    if (!program || !prediction) return;

    setIsLoading(true);
    try {
      const updatedPrediction = await fetchWithRetry(() => 
        program.account.prediction.fetch(prediction.publicKey)
      );

      // Update the prediction data
      onPredict(prediction.publicKey, updatedPrediction.result, 0); // Assuming onPredict can handle updates

      setPendingClaims(updatedPrediction.pendingClaims || []);
      setIsPredictionEnded(Date.now() / 1000 > Number(updatedPrediction.endTime));
      // checkRewardsDistributed(updatedPrediction);
      // checkClaimEligibility(updatedPrediction);
    } catch (error) {
      console.error("Error fetching prediction data:", error);
      setError('Failed to fetch updated prediction data');
    } finally {
      setIsLoading(false);
    }
  }, [program, prediction, onPredict]);
  useEffect(() => {
    const currentTime = Math.floor(Date.now() / 1000);
    const endTime = Number(prediction.account.endTime); // Convert BN to number
    const isPredictionEnded = currentTime > endTime;
    console.log('Current time:', currentTime);
    console.log('End time:', endTime);
    console.log('Is prediction ended:', isPredictionEnded);
    setIsPredictionEnded(isPredictionEnded);
  }, [prediction.account.endTime]);
  // useEffect(() => {
  //   fetchData();
  //   const intervalId = setInterval(fetchData, 30000); // Fetch every 30 seconds

  //   return () => clearInterval(intervalId);
  // }, [fetchData]);

  const checkRewardsDistributed = useCallback((predictionData) => {
    setRewardsDistributed(predictionData.rewardsDistributed);
  }, []);

  // const checkClaimEligibility = useCallback(async (predictionData) => {
  //   if (wallet.publicKey && 'resolved' in predictionData.state) {
  //     try {
  //       const [userPredictionPDA] = await PublicKey.findProgramAddress(
  //         [
  //           Buffer.from("user_prediction"),
  //           prediction.publicKey.toBuffer(),
  //           wallet.publicKey.toBuffer(),
  //         ],
  //         program.programId
  //       );

  //       const userPredictionAccount = await program.account.userPrediction.fetch(userPredictionPDA);

  //       const predictionResult = 'true' in predictionData.result ? true : 
  //                                'false' in predictionData.result ? false : 
  //                                null;

  //       const isWinner = predictionResult !== null && userPredictionAccount.verdict === predictionResult;
        
  //       setCanClaim(isWinner && !userPredictionAccount.rewardClaimed && predictionData.rewardsDistributed);
  //     } catch (error) {
  //       console.error('Error checking claim eligibility:', error);
  //       setCanClaim(false);
  //     }
  //   } else {
  //     setCanClaim(false);
  //   }
  // }, [wallet.publicKey, prediction, program]);




  const handleFinalize = async (useAI = false) => {
    if (!wallet.publicKey) return;
    try {
      setIsAIFinalizing(true);
      if (useAI) {
        const response = await axios.post(`${process.env.NEXT_PUBLIC_SERVER_URL}/finalize-prediction/${prediction.account.id}`);
        setModalData(response.data);
      } else {
        setModalData({ adminFinalize: true });
      }
      setIsModalOpen(true);
    } catch (error) {
      console.error('Error preparing finalization data:', error);
      toast.error('Failed to prepare finalization data: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsAIFinalizing(false);
    }
  };
  const findCorrectPrediction = (id: string) => {
    return allPredictions.find(p => p.account.id.toString() === id);
  };

  const executeFinalization = async (finalOutcome: boolean) => {
    if (!wallet.publicKey) return;
    setIsExecutingFinalization(true);
    try {
      // Use the actual public key of the prediction account
      const predictionPublicKey = prediction.publicKey;

      console.log('Finalizing prediction:', predictionPublicKey.toBase58());
      console.log('Market State:', MARKET_STATE_PUBKEY.toBase58());
      console.log('Admin:', wallet.publicKey.toBase58());

      const tx = await program.methods
        .resolvePrediction({ [finalOutcome ? 'true' : 'false']: {} })
        .accounts({
          marketState: MARKET_STATE_PUBKEY,
          prediction: predictionPublicKey,
          admin: wallet.publicKey,
        })
        .rpc();

      await program.provider.connection.confirmTransaction(tx, "confirmed");
      console.log(`Prediction finalized with transaction signature:`, tx);
      toast.success('Prediction finalized successfully');
      setIsModalOpen(false);
      // You might want to refresh the prediction data here or trigger a callback
    } catch (error) {
      console.error('Error finalizing prediction:', error);
      if (error instanceof Error) {
        toast.error(`Failed to finalize prediction: ${error.message}`);
      } else {
        toast.error('An unknown error occurred while finalizing the prediction');
      }
    } finally {
      setIsExecutingFinalization(false);
    }
  };
  const FinalizeModal = () => (
    <AnimatePresence>
      {isModalOpen && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-white dark:bg-navy-800 rounded-lg p-6 w-full dark:text-white max-w-md"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
          >
            <h2 className="text-2xl font-bold mb-4">Finalize Prediction</h2>
            <p className="mb-4">{prediction.account.description}</p>
            {modalData && modalData.aiOutcome && (
              <div className="mb-4">
                <p className="font-semibold">AI Recommendation:</p>
                <p>{modalData.aiOutcome.outcome ? 'Yes' : 'No'} (Confidence: {modalData.aiOutcome.confidence})</p>
                <p className="text-sm mt-2">{modalData.aiOutcome.explanation}</p>
              </div>
            )}
            <div className="flex justify-between mb-4">
              <button
                onClick={() => executeFinalization(true)}
                className="bg-green-500 text-white px-4 py-2 rounded"
                disabled={isExecutingFinalization}
              >
                Finalize as Yes
              </button>
              <button
                onClick={() => executeFinalization(false)}
                className="bg-red-500 text-white px-4 py-2 rounded"
                disabled={isExecutingFinalization}
              >
                Finalize as No
              </button>
            </div>
            <button
              onClick={() => setIsModalOpen(false)}
              className="w-full bg-gray-300 text-gray-800 px-4 py-2 rounded"
              disabled={isExecutingFinalization}
            >
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );









  const [predictionPublicKey, setPredictionPublicKey] = useState<PublicKey | null>(null);

  useEffect(() => {
    if (prediction && prediction.publicKey) {
      setPredictionPublicKey(prediction.publicKey);
    }
  }, [prediction]);

  const handleRequestClaim = async () => {
    if (!wallet.publicKey) {
      toast.error('Wallet not connected');
      return;
    }
  
    setIsLoading(true);
    setError(null);
    try {
      console.log('Requesting claim for prediction:', prediction.publicKey.toBase58());
      const [userPredictionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_prediction"),
          prediction.publicKey.toBuffer(),
          wallet.publicKey.toBuffer(),
        ],
        program.programId
      );
  
      console.log('User Prediction PDA:', userPredictionPDA.toBase58());
  
      const tx = await program.methods
        .requestClaim()
        .accounts({
          prediction: prediction.publicKey,
          userPrediction: userPredictionPDA,
          user: wallet.publicKey,
        })
        .rpc();
  
      await program.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Claim requested:", tx);
      toast.success('Claim request submitted successfully');
      
      // Refresh prediction data
      const updatedPrediction = await program.account.prediction.fetch(prediction.publicKey);
      console.log('Updated prediction:', updatedPrediction);
      
      // Correctly check the result
      const result = 'true' in updatedPrediction.result ? true :
                     'false' in updatedPrediction.result ? false :
                     null;
      
      // Update the prediction using the onPredict prop
      onPredict(prediction.publicKey, result, 0);
  
      // Update pending claims
      setPendingClaims(updatedPrediction.pendingClaims || []);
  
    } catch (error) {
      console.error('Detailed error:', error);
      if (error instanceof Error) {
        setError(`Failed to request claim: ${error.message}`);
        toast.error(`Failed to request claim: ${error.message}`);
      } else {
        setError('An unknown error occurred while requesting the claim');
        toast.error('An unknown error occurred while requesting the claim');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // For admin
  const handleApproveClaim = async (user: PublicKey, amount: BN, shares: BN) => {
    if (!wallet.publicKey) {
      toast.error('Wallet not connected');
      return;
    }
  
    if (!isAdmin) {
      toast.error('Not authorized to approve claims');
      return;
    }
  
    setIsLoading(true);
    setError(null);
  
    try {
      console.log('Admin wallet:', wallet.publicKey.toBase58());
      console.log('User wallet:', user.toBase58());
      console.log('Amount to transfer:', amount.toString());
  
      const connection = new Connection(clusterApiUrl("devnet"), 'confirmed');
  
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: user,
          lamports: Number(amount),
        })
      );

      const tx = await program.methods
      .approveClaim(user, new BN(amount.toString()), new BN(shares.toString()))
      .accounts({
        prediction: prediction.publicKey,
        admin: wallet.publicKey,
        user: user,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.provider.connection.confirmTransaction(tx, "confirmed");

    
  
      const signature = await wallet.sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');
  
      console.log('Transfer successful:', signature);
      toast.success('Claim approved and paid out successfully');
  
      // Remove the approved claim from pendingClaims
      setPendingClaims(prevClaims => prevClaims.filter(claim => !claim.user.equals(user)));
  
      // You might want to update the prediction data here
      // This depends on how you want to handle the state after a manual transfer
      // For example:
      // await fetchData();
  
    } catch (error) {
      console.error('Error approving claim:', error);
      if (error instanceof Error) {
        setError(`Failed to approve claim: ${error.message}`);
        toast.error(`Failed to approve claim: ${error.message}`);
      } else {
        setError('An unknown error occurred while approving the claim');
        toast.error('An unknown error occurred while approving the claim');
      }
    } finally {
      setIsLoading(false);
    }
  };
  const handleClaim = async () => {
    if (!wallet.publicKey) {
      toast.error('Wallet not connected');
      return;
    }
  
    setIsLoading(true);
    setError(null);
    try {
      console.log('Market State PublicKey:', MARKET_STATE_PUBKEY.toBase58());
      console.log('Prediction ID:', prediction.account.id);
      console.log('User PublicKey:', wallet.publicKey.toBase58());
      console.log('Program ID:', program.programId.toBase58());
  
      const [predictionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("prediction"),
          MARKET_STATE_PUBKEY.toBuffer(),
          new BN(prediction.account.id).toArrayLike(Buffer, 'le', 8)
        ],
        program.programId
      );
  
      console.log('Derived Prediction PDA:', predictionPDA.toBase58());
  
      const [userPredictionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_prediction"),
          predictionPDA.toBuffer(),
          wallet.publicKey.toBuffer(),
        ],
        program.programId
      );
  
      console.log('Derived User Prediction PDA:', userPredictionPDA.toBase58());
  
      // Log the accounts being passed to the instruction
      console.log('Accounts being passed to claimReward:');
      console.log('- marketState:', MARKET_STATE_PUBKEY.toBase58());
      console.log('- prediction:', predictionPDA.toBase58());
      console.log('- userPrediction:', userPredictionPDA.toBase58());
      console.log('- user:', wallet.publicKey.toBase58());
      console.log('- systemProgram:', SystemProgram.programId.toBase58());
  
      const tx = await program.methods
        .claimReward()
        .accounts({
          marketState: MARKET_STATE_PUBKEY,
          prediction: predictionPDA,
          userPrediction: userPredictionPDA,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
  
      // ... rest of the function
    } catch (error) {
      console.error('Detailed error:', error);
      if (error instanceof Error) {
        setError(`Failed to claim reward: ${error.message}`);
      } else {
        setError('An unknown error occurred while claiming the reward');
      }
    } finally {
      setIsLoading(false);
    }
  };


  const checkClaimsInitialized = async () => {
    if (!wallet.publicKey) return;
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

  const handleDistributeRewards = async () => {
    if (!wallet.publicKey || !isAdmin) return;
    try {
      const [claims] = await PublicKey.findProgramAddressSync(
        [Buffer.from("claims"), prediction.publicKey.toBuffer()],
        program.programId
      );

      const tx = await program.methods
        .distributeRewards()
        .accounts({
          prediction: prediction.publicKey,
          marketState: new PublicKey("CySirkQdQbfQzBj3Wgk1Qt7BRU25hV6DiSWxhi7xs9JL"),
          claims,
          admin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Rewards distributed:", tx);
      toast.success('Rewards distributed successfully');
      setRewardsDistributed(true);
    } catch (error) {
      console.error('Error distributing rewards:', error);
      toast.error('Failed to distribute rewards');
    }
  };


  const fetchSolPrice = async () => {
    try {
      const response = await axios.get(`https://hermes.pyth.network/api/latest_price_feeds?ids[]=${PYTH_SOL_PRICE_FEED_ID}`);
      
      if (response.data && response.data.length > 0) {
        const priceData = response.data[0].price;
        if (priceData) {
          const price = Number(priceData.price) * Math.pow(10, priceData.expo);
          console.log('SOL price from Pyth:', price);
          setSolPrice(price);
        } else {
          throw new Error('Invalid price data from Pyth');
        }
      } else {
        throw new Error('No data received from Pyth');
      }
    } catch (error) {
      console.error('Error fetching SOL price from Pyth:', error);
      // Fallback to CoinGecko API
      try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        setSolPrice(response.data.solana.usd);
        console.log('SOL price from CoinGecko fallback:', response.data.solana.usd);
      } catch (fallbackError) {
        console.error('Error fetching SOL price from fallback:', fallbackError);
        // If both fail, we could set a default price or show an error to the user
        setSolPrice(0);
      }
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
      const amount = new BN(shareAmount * LAMPORTS_PER_SOL/10);
  
      const [userPredictionPDA] = PublicKey.findProgramAddressSync(
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
          marketState: MARKET_STATE_PUBKEY,
          prediction: prediction.publicKey,
          user: wallet.publicKey,
          userPrediction: userPredictionPDA,
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

  const getPredictionDetails = async (predictionId: string) => {
    try {
      console.log(`Fetching details for prediction ID: ${predictionId}`);
      console.log(`Using MARKET_STATE_PUBKEY: ${MARKET_STATE_PUBKEY.toBase58()}`);
      console.log(`Using PROGRAM_ID: ${program.programId.toBase58()}`);

      const [predictionPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("prediction"),
          MARKET_STATE_PUBKEY.toBuffer(),
          new BN(predictionId).toArrayLike(Buffer, 'le', 8)
        ],
        program.programId
      );

      console.log("Derived Prediction PDA:", predictionPDA.toBase58());

      // Fetch the prediction account data
      const predictionAccount = await program.account.prediction.fetch(predictionPDA);
      
      console.log("Prediction Details:", JSON.stringify(predictionAccount, null, 2));
      return { publicKey: predictionPDA, account: predictionAccount };
    } catch (error) {
      console.error("Error in getPredictionDetails:", error);
      throw new Error(`Failed to get prediction details: ${error instanceof Error ? error.message : 'Unknown error'}`);
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




      {isAdmin && isResolved && isClaimsInitialized && !rewardsDistributed && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDistributeRewards}
            className="w-full bg-green-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center"
          >
            <IoCash className="mr-2" /> Distribute Rewards
          </motion.button>
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
{/*  {isResolved && rewardsDistributed && canClaim && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleClaim}
            className="w-full bg-green-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center"
          >
            <IoCash className="mr-2" /> Claim Reward
          </motion.button>
        </div>
      )} */}

{isResolved && !isAdmin && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 border-t border-gray-200 dark:border-navy-700">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRequestClaim}
            className="w-full bg-green-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center"
          >
            <IoCash className="mr-2" /> Request Claim
          </motion.button>
        </div>
      )}

{isAdmin  && pendingClaims.length > 0 && (
        <div className="p-6 bg-gray-50 dark:bg-navy-900 dark:text-white border-t border-gray-200 dark:border-navy-700">
          <h3 className="text-lg font-semibold mb-4">Pending Claims</h3>
          {pendingClaims.map((claim, index) => (
            <div key={index} className="flex justify-between items-center mb-2">
              <span>{claim.user.toString().slice(0, 8)}...</span>
              <span>{claim.shares} SOL</span>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleApproveClaim(claim.user, claim.shares * 1e9, claim.shares)}
                className="bg-blue-500 text-white rounded-lg py-1 px-3 text-sm font-medium"
              >
                Approve
              </motion.button>
            </div>
          ))}
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
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleFinalize(false)}
          className="w-full bg-blue-500 text-white rounded-lg py-2 px-4 text-sm font-medium flex items-center justify-center"
        >
          <IoCheckmark className="mr-2" /> Admin Finalize
        </motion.button>
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
              Preparing AI Finalization...
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

{/* {isAdmin && isResolved && (
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
      )} */}

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
        <FinalizeModal />

    </motion.div>
  );
};

export default PredictionCard;