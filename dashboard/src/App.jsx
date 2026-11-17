import React, { useState, useEffect, useMemo } from 'react';
import { Sun, CheckCircle2 } from 'lucide-react';
import MemberAPowerDashboard from './members/MemberAPowerDashboard';
import MemberASensorDashboard from './members/MemberASensorDashboard';
import MemberBDiagnosticsDashboard from './members/MemberBDiagnosticsDashboard';
import MemberCTiltDashboard from './members/MemberCTiltDashboard';
import MemberCCorrectiveActions from './members/MemberCCorrectiveActions';
import MemberDHistoryDashboard from './members/MemberDHistoryDashboard';
import { faultClassForSoiling, predictOperatingPower, PANEL_RATING_W } from './mlModel';
import { ensureFirebaseUser, isFirebaseConfigured, saveActionResult, saveTelemetry, subscribeToActionHistory } from './firebase';

const OPTIMAL_ANGLE = 20;
const CHART_SAMPLE_INTERVAL_MS = 30 * 1000;

function mergeActionHistory(existing, incoming) {
  const items = new Map();
  [...existing, ...incoming].forEach((item) => {
    const createdAt = Number(item.createdAt) || Date.parse(item.time) || 0;
    items.set(`${createdAt}-${item.actionName}`, { ...item, createdAt, time: item.time || new Date(createdAt).toISOString() });
  });
  return [...items.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
}

function describeFirebaseError(error) {
  if (error?.code === 'auth/configuration-not-found') {
    return 'Firebase Authentication is not initialized for this project, or the API key belongs to a different project. In the same Firebase project as this Web app, open Authentication, click Get started if shown, and enable Anonymous sign-in. Confirm the Web API key and project ID come from that same project.';
  }
  if (error?.code === 'auth/operation-not-allowed') {
    return 'Anonymous sign-in is disabled. Enable the Anonymous provider in Firebase Console → Authentication → Sign-in method.';
  }
  if (error?.code === 'PERMISSION_DENIED' || error?.code === 'database/permission-denied') {
    return 'Database access was denied. Publish firebase-database.rules.json and confirm the user is signed in.';
  }
  return error?.message?.replace(/^Firebase:\s*/i, '') || 'Firebase request failed.';
}

export default function App() {
  // --- Connection State ---
  const [isDeviceConnected, setIsDeviceConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [firebaseStatus, setFirebaseStatus] = useState(isFirebaseConfigured ? 'Connecting' : 'Not configured');
  const firebaseUid = React.useRef(null);
  const lastFirebaseTelemetry = React.useRef(0);

  // --- Live Sensor States (Maintains previous values; updates when new telemetry arrives) ---
  // Member 4 owns the DHT22 temperature telemetry field; Member 1 owns irradiance.
  const [irradiance, setIrradiance] = useState(0); // W/m²
  const [temperature, setTemperature] = useState(0); // °C
  const [soiling, setSoiling] = useState(0); // simulated %
  const [angle, setAngle] = useState(35); // degrees
  const [angleDraft, setAngleDraft] = useState(null);

  // --- Power States ---
  const [expectedPower, setExpectedPower] = useState(0);
  const [actualPower, setActualPower] = useState(0);
  const [actionSequence, setActionSequence] = useState(0);
  const [powerHistory, setPowerHistory] = useState([]);

  // --- Energy Counters ---
  const [sessionEnergy, setSessionEnergy] = useState(0);
  const lastEnergySample = React.useRef(null);
  const lastTelemetrySignature = React.useRef('');

  // --- ML Analysis States ---
  const [showSolveModal, setShowSolveModal] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [pseudoResults, setPseudoResults] = useState(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState(null);
  const [isApplying, setIsApplying] = useState(false);
  const [actionHistory, setActionHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('solarActionHistory') || '[]'); } catch { return []; }
  });

  // 1. Live Real-Time Telemetry Stream from local ESP32 Wokwi Bridge
  useEffect(() => {
    let eventSource = null;

    try {
      eventSource = new EventSource('/api/telemetry-stream');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.readingAt) setLastUpdated(new Date(data.readingAt));
          if (Array.isArray(data?.history)) setPowerHistory(data.history);
          if (data?.telemetry) {
            receiveTelemetry(data.telemetry);
          }
        } catch (e) {}
      };
    } catch (err) {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  // Keep REST polling as a small safety net for browsers that pause or delay SSE delivery.
  useEffect(() => {
    let active = true;
    const refreshTelemetry = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch('/api/telemetry', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        if (data?.readingAt) setLastUpdated(new Date(data.readingAt));
        if (Array.isArray(data?.history)) setPowerHistory(data.history);
        if (data?.telemetry) receiveTelemetry(data.telemetry);
      } catch {
        // The SSE stream and retained readings remain available during temporary fetch errors.
      }
    };
    const refreshChartHistory = async () => {
      try {
        const response = await fetch('/api/chart-history', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (active && Array.isArray(data.history)) setPowerHistory(data.history);
      } catch {
        // The SSE stream will deliver the next chart sample when available.
      }
    };
    const refreshOnReturn = () => {
      if (!document.hidden) {
        refreshTelemetry();
        refreshChartHistory();
      }
    };
    refreshTelemetry();
    refreshChartHistory();
    const timer = setInterval(refreshTelemetry, 2000);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, []);

  useEffect(() => {
    const refreshTelemetryStatus = () => {
      setIsDeviceConnected(Boolean(lastUpdated && Date.now() - lastUpdated.getTime() < 3 * 60 * 1000));
    };
    refreshTelemetryStatus();
    const timer = setInterval(refreshTelemetryStatus, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    let active = true;
    let unsubscribe = () => {};
    ensureFirebaseUser().then((user) => {
      if (!active) return;
      firebaseUid.current = user.uid;
      setFirebaseStatus('Connected');
      unsubscribe = subscribeToActionHistory(user.uid, (cloudHistory) => {
        const normalized = cloudHistory.map((item) => ({
          ...item,
          time: item.time || new Date(Number(item.createdAt) || Date.now()).toISOString()
        }));
        setActionHistory((current) => mergeActionHistory(current, normalized));
      }, (error) => setFirebaseStatus(`Error: ${describeFirebaseError(error)}`));
    }).catch((error) => {
      if (active) setFirebaseStatus(`Error: ${describeFirebaseError(error)}`);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const receiveTelemetry = (t) => {
    const signature = JSON.stringify(t);
    if (signature === lastTelemetrySignature.current) return;
    lastTelemetrySignature.current = signature;
    if (t.irradiance != null) setIrradiance(Number(t.irradiance));
    // Member 4: consume the DHT22 temperature value from the shared telemetry stream.
    if (t.temperature != null) setTemperature(Number(t.temperature));
    if (t.soiling != null) setSoiling(Number(t.soiling));
    if (t.angle != null) setAngle(Number(t.angle));
    const actual = Number(t.actualPower);
    const expected = Number(t.expectedPower);
    const hasValidPower = Number.isFinite(actual) && Number.isFinite(expected);
    if (Number.isFinite(actual)) setActualPower(actual);
    if (Number.isFinite(expected)) setExpectedPower(expected);
    if (t.actionSequence != null) setActionSequence(Number(t.actionSequence));
    const now = Date.now();
    if (firebaseUid.current && now - lastFirebaseTelemetry.current >= 60000) {
      lastFirebaseTelemetry.current = now;
      saveTelemetry(firebaseUid.current, t)
        .then(() => setFirebaseStatus('Connected'))
        .catch((error) => setFirebaseStatus(`Write error: ${describeFirebaseError(error)}`));
    }
    const previous = lastEnergySample.current;
    if (hasValidPower && previous && now > previous.time && now - previous.time <= 30000) {
      setSessionEnergy((energy) => energy + ((previous.power + actual) / 2) * (now - previous.time) / 3600000000);
    }
    if (hasValidPower) {
      lastEnergySample.current = { time: now, power: actual };
    }
  };

  const powerLoss = Math.max(0, parseFloat((expectedPower - actualPower).toFixed(1)));
  const underperformanceThreshold = Math.max(8, expectedPower * 0.1);
  const isUnderperforming = isDeviceConnected && expectedPower > 0 && powerLoss > underperformanceThreshold;
  const performanceRatio = expectedPower > 0 ? Math.round((actualPower / expectedPower) * 100) : 0;
  const angleTarget = angleDraft == null ? angle : angleDraft;

  // Identify specific sensor culprits
  const culprits = useMemo(() => {
    const list = [];
    if (soiling > 25) {
      list.push({
        id: 'soiling',
        label: 'Panel Soiling',
        value: `${soiling}%`,
        target: '< 25%',
        severity: soiling > 45 ? 'High' : 'Moderate',
        actionName: 'Cleaning Wiper',
        command: 'clean'
      });
    }
    if (temperature > 35) {
      list.push({
        id: 'temperature',
        label: 'Cell Temperature',
        value: `${temperature}°C`,
        target: '25°C',
        severity: temperature > 45 ? 'Critical' : 'Elevated',
        actionName: 'Cooling System',
        command: 'cool'
      });
    }
    if (Math.abs(angle - OPTIMAL_ANGLE) > 5) {
      list.push({
        id: 'angle',
        label: 'Tilt Alignment',
        value: `${angle}°`,
        target: `${OPTIMAL_ANGLE}°`,
        severity: 'Moderate',
        actionName: 'Servo Alignment',
        command: 'angle'
      });
    }
    return list;
  }, [soiling, temperature, angle]);

  const displayedHistory = powerHistory;
  const chartStart = displayedHistory[0]?.timestamp;
  const chartEnd = displayedHistory[displayedHistory.length - 1]?.timestamp;
  const chartDomainEnd = chartStart == null ? null : Math.max(chartEnd ?? chartStart, chartStart + CHART_SAMPLE_INTERVAL_MS);
  const chartTicks = chartStart == null || chartDomainEnd == null
    ? []
    : Array.from(
      { length: Math.floor((chartDomainEnd - chartStart) / CHART_SAMPLE_INTERVAL_MS) + 1 },
      (_, index) => chartStart + index * CHART_SAMPLE_INTERVAL_MS
    );

  // Optimization calculation
  const handleSolveThis = () => {
    setIsSolving(true);
    setShowSolveModal(true);
    const fault = faultClassForSoiling(soiling);
    const predictions = [
      { id: 'angle', name: 'Adjust Servo Tilt', target: `Set angle to ${OPTIMAL_ANGLE}°`, predictedPower: predictOperatingPower(irradiance, temperature, fault, OPTIMAL_ANGLE), energyCost: 1 },
      { id: 'cooling', name: 'Activate Cooling Fan', target: 'Cool cell to 29°C (simulation)', predictedPower: predictOperatingPower(irradiance, Math.min(temperature, 29), fault, angle), energyCost: 5 },
      { id: 'cleaning', name: 'Cycle Cleaning Wiper', target: 'Set simulated soiling to 0%', predictedPower: predictOperatingPower(irradiance, temperature, 0, angle), energyCost: 7 }
    ];
    const candidates = predictions.map((item) => {
      const recovery = Number((item.predictedPower - actualPower).toFixed(1));
      const netBenefit = Number((recovery - item.energyCost).toFixed(1)); // one-hour recovery minus actuator Wh
      return { ...item, recovery, netBenefit };
    });
    candidates.push({ id: 'none', name: 'No action', target: 'Keep current state', predictedPower: actualPower, recovery: 0, energyCost: 0, netBenefit: 0 });
    candidates.sort((a, b) => b.netBenefit - a.netBenefit);
    setPseudoResults({ candidates, bestAction: candidates[0] });
    setIsSolving(false);
  };

  const applyManualAngle = async () => {
    const target = Math.min(180, Math.max(0, Math.round(Number(angleTarget))));
    setIsApplying(true);
    setActionSuccessMessage(null);
    const commandStartedAt = Date.now();
    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `angle:${target}` })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Wokwi is not connected');

      let confirmed = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const telemetryResponse = await fetch('/api/telemetry', { cache: 'no-store' });
        if (!telemetryResponse.ok) continue;
        const payload = await telemetryResponse.json();
        const reportedAngle = Number(payload.telemetry?.angle);
        if (payload.connected && Number(payload.readingAt) > commandStartedAt && Number.isFinite(reportedAngle) && Math.abs(reportedAngle - target) <= 1) {
          receiveTelemetry(payload.telemetry);
          confirmed = true;
          break;
        }
      }
      if (!confirmed) throw new Error('Wokwi did not confirm the requested servo angle within 20 seconds.');
      setAngleDraft(null);
      setActionSuccessMessage({ message: `Servo angle set to ${target}°.` });
    } catch (error) {
      setActionSuccessMessage({ failure: error.message });
    } finally {
      setIsApplying(false);
    }
  };

  const applyCorrectiveAction = async (action) => {
    setIsApplying(true);
    setActionSuccessMessage(null);
    const before = actualPower;
    const sequenceBefore = actionSequence;
    const commandStartedAt = Date.now();
    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: action.id === 'cleaning' ? 'clean' : action.id === 'cooling' ? 'cool' : 'angle' })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Wokwi is not connected');

      let after = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const telemetryResponse = await fetch('/api/telemetry');
        if (!telemetryResponse.ok) continue;
        const payload = await telemetryResponse.json();
        if (payload.connected && payload.telemetry) {
          const reportedSequence = Number(payload.telemetry.actionSequence);
          const isNewReading = Number(payload.readingAt) > commandStartedAt;
          const sequenceAdvanced = Number.isFinite(reportedSequence) && reportedSequence > sequenceBefore;
          const actionStateChanged = (
            (action.id === 'cleaning' && soiling > 5 && Number(payload.telemetry.soiling) <= Math.max(0, soiling - 5)) ||
            (action.id === 'cooling' && (Number(payload.telemetry.temperature) <= temperature - 3 || (temperature > 29 && Number(payload.telemetry.temperature) <= 29))) ||
            (action.id === 'angle' && Math.abs(Number(payload.telemetry.angle) - OPTIMAL_ANGLE) <= 1 && Math.abs(angle - OPTIMAL_ANGLE) > 1)
          );
          if ((isNewReading && sequenceAdvanced) || actionStateChanged) {
            const measuredPower = Number(payload.telemetry.actualPower);
            if (!Number.isFinite(measuredPower)) continue;
            after = measuredPower;
            receiveTelemetry(payload.telemetry);
            break;
          }
        }
      }
      if (after === null) throw new Error('No post-action measurement confirmed the change within 20 seconds. Check that the Wokwi simulation is running the latest firmware and that the actuator state changed.');

      const actualGain = Number((after - before).toFixed(1));
      const error = Number(Math.abs(action.recovery - actualGain).toFixed(1));
      const createdAt = Date.now();
      const resultMessage = { actionName: action.name, predictedGain: action.recovery, actualGain, predictionError: error, createdAt, time: new Date(createdAt).toISOString() };
      setActionSuccessMessage(resultMessage);
      let saved = [];
      try { saved = JSON.parse(localStorage.getItem('solarActionHistory') || '[]'); } catch {}
      const nextHistory = [resultMessage, ...saved].slice(0, 100);
      try { localStorage.setItem('solarActionHistory', JSON.stringify(nextHistory)); } catch {}
      setActionHistory(nextHistory);
      if (firebaseUid.current) {
        saveActionResult(firebaseUid.current, resultMessage)
          .catch((firebaseError) => setFirebaseStatus(`Write error: ${describeFirebaseError(firebaseError)}`));
      }
      setShowSolveModal(false);
    } catch (error) {
      setActionSuccessMessage({ failure: error.message });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Application Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sun className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold tracking-tight text-white">
                  Solar Monitoring System
                </span>

              </div>
              <p className="text-xs text-slate-400">
                ESP32 Hardware Simulation (Wokwi Bridge)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800/80 border border-slate-700/60">
              <span className={`w-2 h-2 rounded-full ${isDeviceConnected ? 'bg-emerald-400' : 'bg-slate-400'}`} />
              <span className="text-slate-200 font-medium">
                {!lastUpdated ? 'Waiting for first reading' : isDeviceConnected ? 'Telemetry live' : 'Telemetry stale'}
              </span>
            </div>
            <span className="text-slate-400 hidden sm:inline">
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'No readings yet'}
            </span>
            <span title={`Firebase status: ${firebaseStatus}`} className={`max-w-[360px] truncate text-xs ${firebaseStatus === 'Connected' ? 'text-emerald-400' : firebaseStatus === 'Not configured' ? 'text-slate-500' : 'text-amber-300'}`}>
              Firebase: {firebaseStatus}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Notification Toast */}
        {actionSuccessMessage && (
          <div className={`p-3.5 rounded-lg border flex items-center justify-between gap-3 text-sm ${actionSuccessMessage.failure ? 'bg-rose-950/40 border-rose-500/30' : 'bg-emerald-950/40 border-emerald-500/30'}`}>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${actionSuccessMessage.failure ? 'text-rose-400' : 'text-emerald-400'}`} />
              {actionSuccessMessage.failure ? <span className="text-rose-200">{actionSuccessMessage.failure}</span> : actionSuccessMessage.message ? (
                <span className="text-slate-200">{actionSuccessMessage.message}</span>
              ) : (
                <span className="text-slate-200"><strong className="text-white">{actionSuccessMessage.actionName}</strong> completed. Predicted recovery: {actionSuccessMessage.predictedGain} W; simulated post-action recovery: {actionSuccessMessage.actualGain} W; absolute error: {actionSuccessMessage.predictionError} W.</span>
              )}
            </div>
            <button
              onClick={() => setActionSuccessMessage(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1"
            >
              Dismiss
            </button>
          </div>
        )}

        {lastUpdated && !isDeviceConnected && (
          <div className="p-4 rounded-lg bg-rose-950/30 border border-rose-500/40 text-sm text-rose-200">
            Telemetry error: no new reading received for 3 minutes. Showing the last received values from {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.
          </div>
        )}

        {/* Member B: model and fault diagnostics */}
        <MemberBDiagnosticsDashboard
          isUnderperforming={isUnderperforming}
          powerLoss={powerLoss}
          actualPower={actualPower}
          expectedPower={expectedPower}
          performanceRatio={performanceRatio}
          culprits={culprits}
          onEvaluate={handleSolveThis}
          actionHistory={actionHistory}
          soiling={soiling}
        />

        {/* Member A: live power and system summary */}
        <MemberAPowerDashboard
          actualPower={actualPower}
          expectedPower={expectedPower}
          sessionEnergy={sessionEnergy}
          panelRating={PANEL_RATING_W}
          performanceRatio={performanceRatio}
          isUnderperforming={isUnderperforming}
          lastUpdated={lastUpdated}
          isDeviceConnected={isDeviceConnected}
          powerLoss={powerLoss}
        />

        {/* Member dashboards: environmental inputs, tilt control, and live history */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <MemberASensorDashboard irradiance={irradiance} temperature={temperature} />
            <MemberCTiltDashboard
              angle={angle}
              angleTarget={angleTarget}
              optimalAngle={OPTIMAL_ANGLE}
              onAngleDraft={setAngleDraft}
              onApplyAngle={applyManualAngle}
              isApplying={isApplying}
            />
            <p className="text-[11px] text-slate-500">The soiling potentiometer maps to Kaggle fault classes; it is not a dust sensor. Moving the tilt potentiometer returns control from the dashboard angle setting.</p>
          </div>
          <div className="lg:col-span-2">
            <MemberDHistoryDashboard
              history={displayedHistory}
              chartStart={chartStart}
              chartDomainEnd={chartDomainEnd}
              chartTicks={chartTicks}
            />
          </div>
        </div>

      </main>

      {/* Member C: actuator decision matrix and action verification */}
      <MemberCCorrectiveActions
        isOpen={showSolveModal}
        onClose={() => setShowSolveModal(false)}
        actionSuccessMessage={actionSuccessMessage}
        isSolving={isSolving}
        pseudoResults={pseudoResults}
        onApply={applyCorrectiveAction}
        isApplying={isApplying}
      />
    </div>
  );
}
