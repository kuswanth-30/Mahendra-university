/**
 * GossipDemo - Interactive Component for Testing P2P Sync
 */

'use client';

import { useState } from 'react';
import { useGossip } from '@/hooks/useGossip';
import { gossipEngine } from '@/lib/services/gossipEngine';

export default function GossipDemo() {
  const {
    nodeId,
    activePeers,
    lastSyncResult,
    isSyncing,
    messagesSent,
    messagesReceived,
    generateSummary,
    simulatePeerConnect,
    simulatePeerDisconnect,
    simulateIncomingData,
  } = useGossip();

  const [targetPeerId, setTargetPeerId] = useState('');
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLog(prev => [`${new Date().toLocaleTimeString()} - ${msg}`, ...prev].slice(0, 20));
  };

  const handleGenerateSummary = async () => {
    addLog('Generating message summary...');
    const summary = await generateSummary();
    addLog(`Summary generated: ${summary.length} messages`);
  };

  const handleSimulatePeer = () => {
    const peerId = `peer-${Date.now().toString(36)}`;
    simulatePeerConnect(peerId);
    addLog(`Simulated peer connection: ${peerId}`);
    setTargetPeerId(peerId);
  };

  const handleSimulateSummary = async () => {
    if (!targetPeerId) {
      addLog('Error: No target peer set');
      return;
    }

    addLog(`Sending summary to ${targetPeerId}...`);
    
    // Create fake peer summary with some messages we might not have
    const fakeSummary = {
      peerId: targetPeerId,
      messages: [
        { id: 'msg-999', timestamp: new Date(), type: 'Alert', hash: 'abc123' },
        { id: 'msg-998', timestamp: new Date(), type: 'News', hash: 'def456' },
      ],
    };

    await simulateIncomingData(targetPeerId, {
      type: 'SUMMARY_REQUEST',
      payload: fakeSummary,
    });
    
    addLog('Summary received and processed');
  };

  const handleDisconnectPeer = () => {
    if (!targetPeerId) {
      addLog('Error: No target peer to disconnect');
      return;
    }
    
    simulatePeerDisconnect(targetPeerId);
    addLog(`Peer ${targetPeerId} disconnected`);
    setTargetPeerId('');
  };

  return (
    <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
      <h2 className="text-lg font-bold text-slate-900 font-mono mb-4">
        Gossip Engine Demo
      </h2>

      {/* Status Panel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
        <div>
          <p className="text-xs text-slate-500 font-mono">NODE ID</p>
          <p className="text-sm font-bold text-slate-900 font-mono truncate">
            {nodeId.substring(0, 12)}...
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 font-mono">ACTIVE PEERS</p>
          <p className={`text-sm font-bold font-mono ${activePeers > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
            {activePeers}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 font-mono">MSG SENT</p>
          <p className="text-sm font-bold text-slate-900 font-mono">{messagesSent}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 font-mono">MSG RECEIVED</p>
          <p className="text-sm font-bold text-slate-900 font-mono">{messagesReceived}</p>
        </div>
      </div>

      {/* Last Sync Result */}
      {lastSyncResult && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-600 font-mono mb-2">LAST SYNC</p>
          <div className="flex gap-4 text-sm font-mono">
            <span className="text-slate-700">
              Missing: <span className="font-bold text-blue-700">{lastSyncResult.missingLocally.length}</span>
            </span>
            <span className="text-slate-700">
              Extra: <span className="font-bold text-slate-500">{lastSyncResult.missingRemotely.length}</span>
            </span>
            <span className="text-slate-700">
              Conflicts: <span className="font-bold text-red-500">{lastSyncResult.conflicting.length}</span>
            </span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={handleGenerateSummary}
          disabled={isSyncing}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium font-mono transition-colors disabled:opacity-50"
        >
          Generate Summary
        </button>
        
        <button
          onClick={handleSimulatePeer}
          className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-medium font-mono transition-colors"
        >
          Simulate Peer Connect
        </button>
        
        <button
          onClick={handleSimulateSummary}
          disabled={!targetPeerId}
          className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium font-mono transition-colors disabled:opacity-50"
        >
          Send Test Summary
        </button>
        
        <button
          onClick={handleDisconnectPeer}
          disabled={!targetPeerId}
          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-medium font-mono transition-colors disabled:opacity-50"
        >
          Disconnect Peer
        </button>
      </div>

      {/* Log Output */}
      <div className="border border-slate-200 rounded-lg bg-slate-900 p-4">
        <p className="text-xs text-slate-400 font-mono mb-2">EVENT LOG</p>
        <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-xs">
          {log.length === 0 ? (
            <p className="text-slate-600">No events yet...</p>
          ) : (
            log.map((entry, i) => (
              <p key={i} className="text-slate-300">{`> ${entry}`}</p>
            ))
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500 font-mono">
        Console: Check browser console for detailed 404 FOUND gossip logs
      </p>
    </div>
  );
}
