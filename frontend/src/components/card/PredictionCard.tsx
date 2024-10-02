import React, { useState, useEffect } from 'react';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { motion } from 'framer-motion';
import { IoTimeOutline, IoWalletOutline, IoTrendingUp, IoTrendingDown, IoSwapHorizontal } from 'react-icons/io5';
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

  useEffect(() => {
    if (prediction) {
      setIsPredictionEnded(Date.now() / 1000 > Number(prediction.account.endTime));
    }
    fetchSolPrice();
  }, [prediction]);

  const fetchSolPrice = async () => {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      setSolPrice(response.data.solana.usd);
    } catch (error) {
      console.error('Error fetching SOL price:', error);
    }
  };

  const formatPrice = (amount: string) => {
    const solAmount = Number(amount) / 1e9;
    if (showUSD) {
      const usdAmount = solAmount * solPrice;
      return `$${usdAmount.toFixed(2)}`;
    } else {
      return `${solAmount.toFixed(2)} SOL`;
    }
  };

  const calculatePotentialPayout = () => {
    const betAmount = new BN(shareAmount * 1e9);
    const totalPool = new BN(prediction.account.totalAmount);
    const selectedPool = isYesSelected ? new BN(prediction.account.yesAmount) : new BN(prediction.account.noAmount);
    
    if (totalPool.eqn(0) || selectedPool.eqn(0)) return 0;

    try {
      const payoutRatio = totalPool.mul(new BN(95)).div(selectedPool).toNumber() / 100;
      return (betAmount.mul(new BN(payoutRatio)).div(new BN(1e9)).toNumber() / 1e9).toFixed(2);
    } catch (error) {
      console.error('Error calculating potential payout:', error);
      return 0;
    }
  };

  const handlePredict = async () => {
    if (!wallet.publicKey) {
      toast.error('Wallet not connected');
      return;
    }

    try {
      const amount = new BN(shareAmount * LAMPORTS_PER_SOL);

      // Derive PDA for user prediction
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
          marketState: new PublicKey("Gsmt7fBHxJcdzSy9M3tACdTBf66ku5iLrxgnjtUxt2An"), // Use your actual market state PDA
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
      className="bg-white dark:bg-navy-800 rounded-lg shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg border border-gray-200 dark:border-navy-700"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="p-4">
        <h2 className="text-lg font-semibold text-navy-700 dark:text-white mb-2 line-clamp-2">
          {description}
        </h2>
        <div className="flex justify-between items-center mb-3 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center">
            <IoTimeOutline className="mr-1" />
            <span>{formatTime(endTime)}</span>
          </div>
          <div className="flex items-center">
            <IoWalletOutline className="mr-1" />
            <span>{formatPrice(totalAmount)}</span>
            <button 
              onClick={() => setShowUSD(!showUSD)} 
              className="ml-1 text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300"
            >
              <IoSwapHorizontal />
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-1">
          {tags.map((tag, index) => (
            <span key={index} className="bg-gray-100 dark:bg-navy-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs">
              {tag}
            </span>
          ))}
        </div>
        
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-green-500 dark:text-green-400">Yes: {yesPercentage.toFixed(1)}%</span>
            <span className="text-red-500 dark:text-red-400">No: {noPercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-navy-700 rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-green-500 dark:bg-green-400"
              style={{ width: `${yesPercentage}%` }}
            />
          </div>
        </div>

        {isActive && !isPredictionEnded && (
          <div className="space-y-2">
            <div className="flex justify-between gap-2">
              <button
                onClick={() => setIsYesSelected(true)}
                className={`flex-1 py-1 px-2 rounded ${isYesSelected ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-navy-700 text-gray-700 dark:text-gray-300'}`}
              >
                Yes
              </button>
              <button
                onClick={() => setIsYesSelected(false)}
                className={`flex-1 py-1 px-2 rounded ${!isYesSelected ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-navy-700 text-gray-700 dark:text-gray-300'}`}
              >
                No
              </button>
            </div>
            <div className="flex items-center justify-between">
              <input 
                type="number" 
                value={shareAmount}
                onChange={(e) => setShareAmount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 p-1 text-center border dark:border-navy-600 rounded bg-white dark:bg-navy-900 text-gray-700 dark:text-gray-300 text-sm"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Potential: {calculatePotentialPayout()} SOL
              </span>
            </div>
            <button 
              onClick={handlePredict}
              className="w-full bg-brand-500 text-white rounded py-2 px-4 text-sm font-medium hover:bg-brand-600 transition-colors"
            >
              Predict
            </button>
          </div>
        )}

        {(isResolved || isPredictionEnded) && (
          <div className="text-center text-sm font-medium text-gray-600 dark:text-gray-400">
            {isResolved ? (
              <span className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100 px-2 py-1 rounded-full">
                Prediction Resolved
              </span>
            ) : (
              <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100 px-2 py-1 rounded-full">
                Awaiting Resolution
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default PredictionCard;