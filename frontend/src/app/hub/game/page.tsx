'use client'
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

const RouletteGame = () => {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [betAmount, setBetAmount] = useState(1);
  const [betType, setBetType] = useState('red');
  const [balance, setBalance] = useState(100);

  const numbers = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
  ];

  const spinWheel = () => {
    if (spinning) return;
    if (betAmount > balance) {
      toast.error("Insufficient balance");
      return;
    }

    setSpinning(true);
    setBalance(balance - betAmount);

    const randomNumber = Math.floor(Math.random() * 37);
    const rotations = 8;
    const degreePerNumber = 360 / 37;
    const spinDegree = rotations * 360 + randomNumber * degreePerNumber;

    setTimeout(() => {
      setSpinning(false);
      setResult(numbers[randomNumber]);
      checkWin(numbers[randomNumber]);
    }, 5000);
  };

  const checkWin = (resultNumber) => {
    let won = false;
    if (betType === 'red' && [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(resultNumber)) {
      won = true;
    } else if (betType === 'black' && [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35].includes(resultNumber)) {
      won = true;
    } else if (betType === 'green' && resultNumber === 0) {
      won = true;
    }

    if (won) {
      const winAmount = betType === 'green' ? betAmount * 35 : betAmount * 2;
      setBalance(balance + winAmount);
      toast.success(`You won ${winAmount}!`);
    } else {
      toast.error('Better luck next time!');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-800 p-4">
      <h1 className="text-3xl font-bold mb-8 text-gray-800 dark:text-white">Roulette Game</h1>
      
      <div className="relative w-64 h-64 md:w-96 md:h-96 mb-8">
        <motion.div
          className="w-full h-full rounded-full border-4 border-gray-300 dark:border-gray-600 overflow-hidden"
          style={{
            backgroundImage: "url('https://upload.wikimedia.org/wikipedia/commons/8/88/Basic_roulette_wheel.svg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          animate={spinning ? { rotate: 360 * 8 + Math.floor(Math.random() * 360) } : {}}
          transition={{ duration: 5, ease: "easeOut" }}
        />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full" />
      </div>

      <div className="flex flex-col md:flex-row items-center mb-4 space-y-4 md:space-y-0 md:space-x-4">
        <input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(Math.max(1, parseInt(e.target.value)))}
          className="w-full md:w-32 px-3 py-2 border rounded-md"
        />
        <select
          value={betType}
          onChange={(e) => setBetType(e.target.value)}
          className="w-full md:w-32 px-3 py-2 border rounded-md"
        >
          <option value="red">Red</option>
          <option value="black">Black</option>
          <option value="green">Green (0)</option>
        </select>
        <button
          onClick={spinWheel}
          disabled={spinning}
          className="w-full md:w-auto px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          {spinning ? 'Spinning...' : 'Spin'}
        </button>
      </div>

      <div className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
        Balance: {balance}
      </div>

      {result !== null && (
        <div className="text-2xl font-bold text-gray-800 dark:text-white">
          Result: {result}
        </div>
      )}
    </div>
  );
};

export default RouletteGame;