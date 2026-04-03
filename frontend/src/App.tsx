/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-misused-promises, @typescript-eslint/restrict-template-expressions */

import { useCallback, useEffect, useState } from 'react'
import { BrowserProvider, Contract, type TransactionResponse } from 'ethers'
import './App.css'

declare global {
  interface Window {
    ethereum?: any
  }
}

const PICKUP_SCHEDULER_ADDRESS = '0xa0Ac8de1Ddc4b6a8bF79130E8a7B60965515707D'

const PICKUP_SCHEDULER_ABI = [
  'function requestPickup(string pickupLocation, string dropoffLocation, string details, string packageSize, bool fragile, uint8 requiredVehicleType, uint256 scheduledAt) external returns (uint256)',
  'function confirmPickup(uint256 pickupId) external',
  'function setAgentVehicleType(uint8 vehicleType) external',
  'function getAvailablePickupsForAgent() external view returns (uint256[])',
  'function getPendingPickupsByVehicleType(uint8 vehicleType) external view returns (uint256[])',
  'function getPickupSummary(uint256 pickupId) external view returns (address requester, address agent, uint8 status, bool rewardMinted, uint8 agentRating, string pickupLocation, string dropoffLocation, string details, string packageSize, bool fragile, uint8 requiredVehicleType, uint256 scheduledAt)',
  'function markInTransit(uint256 pickupId) external',
  'function completePickup(uint256 pickupId) external',
  'function cancelPickup(uint256 pickupId) external',
  'function rateAgent(uint256 pickupId, uint8 rating) external',
  'function getPickupsByUser(address user) external view returns (uint256[])',
  'function getTotalRewardPoints(address user) external view returns (uint256)',
  'function getTopAgentsByPoints(uint256 limit) external view returns (address[], uint256[])',
  'function getTopRatedAgents(uint256 limit) external view returns (address[], uint256[])',
  'function getAgentRatingStats(address agent) external view returns (uint256 totalRating, uint256 ratingCount, uint256 averageRating)',
  'function getCompletedPickupsByAgent(address agent) external view returns (uint256)',
  'function pickups(uint256) external view returns (uint256 id, address requester, string pickupLocation, string dropoffLocation, string details, uint256 scheduledAt, address agent, uint8 status, bool rewardMinted, uint8 agentRating)',
 ]

function App() {
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [schedulerContract, setSchedulerContract] = useState<Contract | null>(null)
  const [status, setStatus] = useState<string>('')
  const [txLoading, setTxLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'request' | 'agent' | 'leaderboard'>('request')

  // Request Pickup Form
  const [pickupLocation, setPickupLocation] = useState<string>('')
  const [dropoffLocation, setDropoffLocation] = useState<string>('')
  const [details, setDetails] = useState<string>('')
  const [packageSize, setPackageSize] = useState<string>('medium')
  const [fragile, setFragile] = useState<boolean>(false)
  const [requiredVehicleType, setRequiredVehicleType] = useState<string>('1')
  const [scheduledAt, setScheduledAt] = useState<string>('')
  const [createdPickupId, setCreatedPickupId] = useState<string>('')

  const [availablePickups, setAvailablePickups] = useState<string[]>([])
  const [agentVehicleType, setAgentVehicleType] = useState<string>('1')

  // Agent Actions
  const [pickupId, setPickupId] = useState<string>('')
  const [rating, setRating] = useState<string>('5')

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<Array<{agent:string, points:string}>>([])
  const [agentLeaderboard, setAgentLeaderboard] = useState<Array<{agent:string, rating:string}>>([])
  const [points, setPoints] = useState<string>('0')

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setStatus('Please install MetaMask.')
      return
    }
    const web3Provider = new BrowserProvider(window.ethereum)
    await web3Provider.send('eth_requestAccounts', [])
    const signer = await web3Provider.getSigner()
    const address = await signer.getAddress()

    const contract = new Contract(PICKUP_SCHEDULER_ADDRESS, PICKUP_SCHEDULER_ABI, signer)

    setWalletAddress(address)
    setSchedulerContract(contract)
    setStatus('✓ Wallet connected successfully!')
    
    // Load user points
    const userPoints = await contract.getTotalRewardPoints(address)
    setPoints(userPoints.toString())
  }, [])

  useEffect(() => {
    if (!walletAddress && window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
          setWalletAddress(accounts[0])
          setStatus('Account switched')
        } else {
          setWalletAddress('')
          setStatus('Wallet disconnected')
        }
      })
    }
  }, [walletAddress])

  const executeTx = async (fn: () => Promise<TransactionResponse>, successMsg: string) => {
    try {
      if (!schedulerContract) {
        setStatus('❌ Wallet not connected')
        return
      }
      setTxLoading(true)
      setStatus('⏳ Sending transaction...')
      const tx = await fn()
      setStatus('⏳ Waiting for confirmation...')
      await tx.wait()
      setStatus(`✓ ${successMsg}`)
      
      // Reload points
      if (walletAddress) {
        const userPoints = await schedulerContract.getTotalRewardPoints(walletAddress)
        setPoints(userPoints.toString())
      }
    } catch (error: any) {
      const errorMsg = error.reason || error.message || 'Unknown error'
      setStatus(`❌ ${errorMsg}`)
    } finally {
      setTxLoading(false)
    }
  }

  const handleRequestPickup = async () => {
    if (!schedulerContract) {
      setStatus('❌ Wallet not connected')
      return
    }
    if (!pickupLocation || !dropoffLocation || !details || !scheduledAt || !packageSize) {
      setStatus('❌ Fill in all fields')
      return
    }

    const scheduledTime = Math.floor(new Date(scheduledAt).getTime() / 1000)
    const now = Math.floor(Date.now() / 1000)

    if (scheduledTime <= now) {
      setStatus('❌ Pickup time must be in the future')
      return
    }

    try {
      const vehicleTypeNum = Number(requiredVehicleType)
      const predictedId = (await schedulerContract.callStatic.requestPickup(
        pickupLocation,
        dropoffLocation,
        details,
        packageSize,
        fragile,
        vehicleTypeNum,
        scheduledTime
      )).toString()

      await executeTx(
        () => schedulerContract.requestPickup(pickupLocation, dropoffLocation, details, packageSize, fragile, vehicleTypeNum, scheduledTime),
        `Pickup requested successfully! Pickup ID: #${predictedId}`
      )

      setCreatedPickupId(predictedId)
      setPickupLocation('')
      setDropoffLocation('')
      setDetails('')
      setPackageSize('medium')
      setRequiredVehicleType('1')
      setFragile(false)
      setScheduledAt('')
    } catch (error: any) {
      const message = error.reason || error.message || 'Unknown error'
      setStatus(`❌ ${message}`)
    }
  }

  const handleConfirmPickup = async () => {
    if (!pickupId) {
      setStatus('❌ Enter pickup ID')
      return
    }
    await executeTx(
      () => schedulerContract!.confirmPickup(pickupId),
      `Pickup #${pickupId} confirmed! You are now the agent.`
    )
  }

  const handleMarkInTransit = async () => {
    if (!pickupId) {
      setStatus('❌ Enter pickup ID')
      return
    }
    await executeTx(
      () => schedulerContract!.markInTransit(pickupId),
      `Pickup #${pickupId} marked in transit.`
    )
  }

  const handleCompletePickup = async () => {
    if (!pickupId) {
      setStatus('❌ Enter pickup ID')
      return
    }
    await executeTx(
      () => schedulerContract!.completePickup(pickupId),
      `Pickup #${pickupId} completed! You earned reward points and tokens.`
    )
  }

  const handleRateAgent = async () => {
    if (!pickupId) {
      setStatus('❌ Enter pickup ID')
      return
    }
    const value = Number(rating)
    if (value < 1 || value > 5) {
      setStatus('❌ Rating must be 1-5')
      return
    }
    await executeTx(
      () => schedulerContract!.rateAgent(pickupId, value),
      `Agent rated ${value} stars!`
    )
  }

  const loadLeaderboard = async () => {
    try {
      if (!schedulerContract) {
        setStatus('❌ Connect wallet first')
        return
      }
      setStatus('⏳ Loading leaderboard...')
      
      const [agents, points] = await schedulerContract.getTopAgentsByPoints(10)
      const arr1 = agents.map((agent:string, idx:number) => ({ agent, points: points[idx].toString() }))
      setLeaderboard(arr1)

      const [ratedAgents, ratings] = await schedulerContract.getTopRatedAgents(10)
      const arr2 = ratedAgents.map((agent:string, idx:number) => ({ agent, rating: (ratings[idx].toNumber() / 100).toFixed(2) }))
      setAgentLeaderboard(arr2)
      
      setStatus('✓ Leaderboard loaded')
    } catch (error: any) {
      setStatus(`❌ ${error.message}`)
    }
  }

  const setVehicleType = async () => {
    if (!schedulerContract) {
      setStatus('❌ Wallet not connected')
      return
    }

    const typeNum = Number(agentVehicleType)
    if (isNaN(typeNum) || typeNum < 0 || typeNum > 2) {
      setStatus('❌ Invalid vehicle type')
      return
    }

    await executeTx(
      () => schedulerContract.setAgentVehicleType(typeNum),
      `Agent vehicle type set: ${['Bike','Car','Truck'][typeNum]}`
    )
  }

  const loadAvailablePickups = async () => {
    if (!schedulerContract) {
      setStatus('❌ Wallet not connected')
      return
    }
    setStatus('⏳ Loading available pickups...')
    try {
      const ids = await schedulerContract.getAvailablePickupsForAgent()
      setAvailablePickups(ids.map((id: any) => id.toString()))
      setStatus('✓ Available pickups loaded')
    } catch (error: any) {
      setStatus(`❌ ${error.message}`)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '20px' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ background: 'white', padding: '30px', borderRadius: '15px', marginBottom: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h1 style={{ margin: 0, color: '#333' }}>🚚 LogiChain-NG</h1>
            <button
              onClick={connectWallet}
              disabled={!!walletAddress}
              style={{
                padding: '12px 24px',
                background: walletAddress ? '#4CAF50' : '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: walletAddress ? 'default' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              {walletAddress ? `✓ ${walletAddress.slice(0,6)}...${walletAddress.slice(-4)}` : 'Connect Wallet'}
            </button>
          </div>

          {/* Status and Points */}
          <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', marginBottom: '10px' }}>
            <p style={{ margin: '5px 0', color: '#666', fontSize: '14px' }}>{status}</p>
            {walletAddress && <p style={{ margin: '5px 0', color: '#667eea', fontSize: '14px', fontWeight: 'bold' }}>💰 Your Points: {points} LGT</p>}
          </div>
        </div>

        {/* Tabs */}
        {walletAddress && (
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            {(['request', 'agent', 'leaderboard'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '12px 24px',
                  background: activeTab === tab ? 'white' : 'rgba(255,255,255,0.3)',
                  color: activeTab === tab ? '#667eea' : 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  textTransform: 'capitalize'
                }}
              >
                {tab === 'request' && '📝 Request Pickup'}
                {tab === 'agent' && '🤝 Agent Actions'}
                {tab === 'leaderboard' && '🏆 Leaderboard'}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {walletAddress ? (
          <>
            {/* Request Pickup Tab */}
            {activeTab === 'request' && (
              <div style={{ background: 'white', padding: '30px', borderRadius: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
                <h2 style={{ color: '#333', marginTop: 0 }}>Schedule a New Pickup</h2>
                <div style={{ display: 'grid', gap: '15px' }}>
                  <input
                    placeholder="📍 Pickup location (street address)"
                    value={pickupLocation}
                    onChange={(e) => setPickupLocation(e.target.value)}
                    style={inputStyle}
                  />
                  <input
                    placeholder="📍 Dropoff location (street address)"
                    value={dropoffLocation}
                    onChange={(e) => setDropoffLocation(e.target.value)}
                    style={inputStyle}
                  />
                  <input
                    placeholder="📦 Package details (weight, content, notes)"
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    style={inputStyle}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <select
                      value={packageSize}
                      onChange={(e) => setPackageSize(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                      <option value="extra-large">Extra Large</option>
                    </select>
                    <select
                      value={requiredVehicleType}
                      onChange={(e) => setRequiredVehicleType(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="0">Bike</option>
                      <option value="1">Car</option>
                      <option value="2">Truck</option>
                    </select>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#333', fontWeight: 'bold' }}>
                    <input
                      type="checkbox"
                      checked={fragile}
                      onChange={(e) => setFragile(e.target.checked)}
                      style={{ marginRight: '8px' }}
                    />
                    Fragile
                  </label>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>Scheduled Time:</label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      style={inputStyle}
                    />
                    <small style={{ color: '#999' }}>Must be at least 1 hour in the future</small>
                  </div>
                  <button
                    onClick={handleRequestPickup}
                    disabled={txLoading}
                    style={{
                      padding: '12px 24px',
                      background: txLoading ? '#ccc' : '#667eea',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: txLoading ? 'not-allowed' : 'pointer',
                      fontSize: '16px',
                      fontWeight: 'bold'
                    }}
                  >
                    {txLoading ? '⏳ Processing...' : '✓ Request Pickup'}
                  </button>
                  {createdPickupId && (
                    <p style={{ marginTop: '12px', color: '#4CAF50', fontWeight: 'bold' }}>
                      🎫 Pickup ID: #{createdPickupId}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Agent Actions Tab */}
            {activeTab === 'agent' && (
              <div style={{ background: 'white', padding: '30px', borderRadius: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
                <h2 style={{ color: '#333', marginTop: 0 }}>Agent Actions</h2>

                {/* Vehicle Type Settings */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>Vehicle Type:</label>
                  <select value={agentVehicleType} onChange={(e) => setAgentVehicleType(e.target.value)} style={inputStyle}>
                    <option value="0">Bike</option>
                    <option value="1">Car</option>
                    <option value="2">Truck</option>
                  </select>
                  <button
                    onClick={setVehicleType}
                    disabled={txLoading}
                    style={{ marginTop: '10px', padding: '10px 14px', background: '#6c5ce7', color: 'white', border: 'none', borderRadius: '8px', cursor: txLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {txLoading ? '⏳' : 'Set Vehicle'}
                  </button>
                </div>

                {/* Available Pickups */}
                <div style={{ marginBottom: '20px' }}>
                  <button
                    onClick={loadAvailablePickups}
                    disabled={txLoading}
                    style={{ padding: '10px 14px', background: '#00b894', color: 'white', border: 'none', borderRadius: '8px', cursor: txLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {txLoading ? '⏳' : 'Load Available Pickups'}
                  </button>
                  {availablePickups.length > 0 ? (
                    <ul style={{ marginTop: '10px', paddingLeft: '20px' }}>
                      {availablePickups.map((id) => (
                        <li key={id}>Pickup ID: #{id}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ color: '#999', marginTop: '10px' }}>No available pickups for your vehicle type.</p>
                  )}
                </div>

                {/* Pickup ID Input */}
                <div style={{ marginBottom: '20px' }}>
                  <input
                    placeholder="Enter Pickup ID"
                    value={pickupId}
                    onChange={(e) => setPickupId(e.target.value)}
                    type="number"
                    style={inputStyle}
                  />
                </div>

                {/* Status Updates */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                  <button
                    onClick={handleConfirmPickup}
                    disabled={txLoading}
                    style={actionButtonStyle(txLoading, '#4CAF50')}
                  >
                    {txLoading ? '⏳' : '✓'} Confirm
                  </button>
                  <button
                    onClick={handleMarkInTransit}
                    disabled={txLoading}
                    style={actionButtonStyle(txLoading, '#2196F3')}
                  >
                    {txLoading ? '⏳' : '🚗'} In Transit
                  </button>
                  <button
                    onClick={handleCompletePickup}
                    disabled={txLoading}
                    style={actionButtonStyle(txLoading, '#FF9800')}
                  >
                    {txLoading ? '⏳' : '✓'} Complete
                  </button>
                </div>

                {/* Rating Section */}
                <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
                  <h3 style={{ color: '#333' }}>Rate Agent (Requester Only)</h3>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>Rating (1-5 stars):</label>
                      <select
                        value={rating}
                        onChange={(e) => setRating(e.target.value)}
                        style={inputStyle}
                      >
                        <option value="1">⭐ 1 Star - Poor</option>
                        <option value="2">⭐⭐ 2 Stars - Fair</option>
                        <option value="3">⭐⭐⭐ 3 Stars - Good</option>
                        <option value="4">⭐⭐⭐⭐ 4 Stars - Very Good</option>
                        <option value="5">⭐⭐⭐⭐⭐ 5 Stars - Excellent</option>
                      </select>
                    </div>
                    <button
                      onClick={handleRateAgent}
                      disabled={txLoading}
                      style={{
                        padding: '12px 24px',
                        background: txLoading ? '#ccc' : '#FF6B6B',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: txLoading ? 'not-allowed' : 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold'
                      }}
                    >
                      {txLoading ? '⏳ Submitting...' : '✓ Submit Rating'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Leaderboard Tab */}
            {activeTab === 'leaderboard' && (
              <div style={{ background: 'white', padding: '30px', borderRadius: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ color: '#333', margin: 0 }}>🏆 Leaderboards</h2>
                  <button
                    onClick={loadLeaderboard}
                    disabled={txLoading}
                    style={{
                      padding: '10px 20px',
                      background: '#667eea',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    🔄 Refresh
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  {/* Top Agents by Points */}
                  <div>
                    <h3 style={{ color: '#333', marginTop: 0 }}>💰 Top Agents by Points</h3>
                    {leaderboard.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {leaderboard.map((item, idx) => (
                          <div
                            key={item.agent}
                            style={{
                              padding: '12px',
                              background: '#f5f5f5',
                              borderRadius: '8px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 'bold', color: '#667eea' }}>#{idx + 1}</span>
                              <p style={{ margin: '5px 0', fontSize: '12px', color: '#999' }}>{item.agent.slice(0,10)}...{item.agent.slice(-8)}</p>
                            </div>
                            <span style={{ fontWeight: 'bold', color: '#4CAF50' }}>{item.points} pts</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: '#999' }}>No data. Click Refresh to load.</p>
                    )}
                  </div>

                  {/* Top Rated Agents */}
                  <div>
                    <h3 style={{ color: '#333', marginTop: 0 }}>⭐ Top Rated Agents</h3>
                    {agentLeaderboard.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {agentLeaderboard.map((item, idx) => (
                          <div
                            key={item.agent}
                            style={{
                              padding: '12px',
                              background: '#f5f5f5',
                              borderRadius: '8px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 'bold', color: '#667eea' }}>#{idx + 1}</span>
                              <p style={{ margin: '5px 0', fontSize: '12px', color: '#999' }}>{item.agent.slice(0,10)}...{item.agent.slice(-8)}</p>
                            </div>
                            <span style={{ fontWeight: 'bold', color: '#FF9800' }}>{item.rating}★</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: '#999' }}>No data. Click Refresh to load.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ background: 'white', padding: '60px 30px', borderRadius: '15px', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <h2 style={{ color: '#667eea', marginTop: 0 }}>👋 Welcome to LogiChain-NG</h2>
            <p style={{ color: '#666', fontSize: '16px' }}>Connect your wallet to get started with scheduling pickups and earning rewards!</p>
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  border: '1px solid #ddd',
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: 'inherit',
  boxSizing: 'border-box'
}

const actionButtonStyle = (disabled: boolean, color: string): React.CSSProperties => ({
  padding: '12px 20px',
  background: disabled ? '#ccc' : color,
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '14px',
  fontWeight: 'bold',
  transition: 'opacity 0.2s'
})

export default App
