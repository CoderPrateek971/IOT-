import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sun, Thermometer, Wind, Sparkles, AlertTriangle, CheckCircle2, 
  Zap, ArrowUpRight, BarChart2, Activity, ShieldCheck, Cpu, WifiOff, Wifi, Clock, History
} from 'lucide-react';
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Brush
} from 'recharts';
import { db, ref, set, onValue, isFirebaseReady } from './firebase';
import { predictPowerML, ML_MODEL_METRICS } from './mlModel';

export default function App() {
  // --- Connection State (Strictly controlled by VS Code Wokwi telemetry) ---
  const [isDeviceConnected, setIsDeviceConnected] = useState(false);
  const [lastHeartbeatTime, setLastHeartbeatTime] = useState(0);

  // --- Live Sensor States (Strictly driven by VS Code simulation; 0 when stopped) ---
  const [irradiance, setIrradiance] = useState(0); // W/m²
  const [temperature, setTemperature] = useState(0); // °C
  const [soiling, setSoiling] = useState(0); // %
  const [angle, setAngle] = useState(0); // degrees
  const OPTIMAL_ANGLE = 20;

  // --- Power States ---
  const [expectedPower, setExpectedPower] = useState(0);
  const [actualPower, setActualPower] = useState(0);
  const [powerHistory, setPowerHistory] = useState([]);

  // --- 24-Hour Rollback Window State ---
  // 0 = Live (Now), 4 = 4h ago, 12 = 12h ago, 24 = 24 hours ago
  const [rollbackHours, setRollbackHours] = useState(0);

  // --- Energy Counters (0 when simulation is stopped) ---
  const [todayEnergy, setTodayEnergy] = useState(0); // kWh
  const [monthEnergy, setMonthEnergy] = useState(142.5); // kWh
  const [yearEnergy, setYearEnergy] = useState(1820.0); // kWh

  // --- ML Pseudo-Simulation States ---
  const [showSolveModal, setShowSolveModal] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [pseudoResults, setPseudoResults] = useState(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState(null);

  // Helper to generate a realistic 24-hour diurnal solar generation timeline
  const generateInitial24HrData = () => {
    const points = [];
    const now = new Date();
    // 48 points across 24 hours (1 every 30 mins)
    for (let h = 24; h >= 0; h -= 0.5) {
      const past = new Date(now.getTime() - h * 60 * 60 * 1000);
      const hourOfDay = past.getHours() + past.getMinutes() / 60;
      const timeStr = past.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      // Realistic solar radiation curve: daylight between 6:00 AM and 6:30 PM
      let sunSim = 0;
      let tempSim = 22.0;
      let act = 0;
      let exp = 0;

      if (hourOfDay >= 6.0 && hourOfDay <= 18.5) {
        // Solar bell curve peaked around 12:30 PM
        const sunAngle = Math.sin(((hourOfDay - 6.0) / 12.5) * Math.PI);
        sunSim = Math.max(0, sunAngle * 960 + (Math.random() * 20 - 10));
        tempSim = 25.0 + sunAngle * 18.0; // heats up to 43°C during peak noon
        const soilSim = Math.min(48, 15 + (24 - h) * 1.3); // dust accumulated over the 24 hours

        exp = predictPowerML(sunSim, 25.0, OPTIMAL_ANGLE, 0.0);
        act = predictPowerML(sunSim, tempSim, 35, soilSim);
      } else {
        // Night time: 0 W
        sunSim = 0;
        tempSim = 20.0 + Math.random() * 2.0;
        exp = 0;
        act = 0;
      }

      points.push({
        time: timeStr,
        expected: exp,
        actual: act,
        hoursAgo: h
      });
    }
    return points;
  };


  // 1. Live Real-Time Telemetry Stream from local ESP32 Wokwi Bridge
  useEffect(() => {
    let eventSource = null;

    try {
      eventSource = new EventSource('/api/telemetry-stream');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.connected && data.telemetry) {
            setIsDeviceConnected(true);
            const t = data.telemetry;
            if (t.irradiance !== undefined) setIrradiance(Number(t.irradiance));
            if (t.temperature !== undefined) setTemperature(Number(t.temperature));
            if (t.soiling !== undefined) setSoiling(Number(t.soiling));
            if (t.angle !== undefined) setAngle(Number(t.angle));
            if (t.actualPower !== undefined) setActualPower(Number(t.actualPower));
            if (t.expectedPower !== undefined) setExpectedPower(Number(t.expectedPower));
            setTodayEnergy(4.82);
          } else {
            setIsDeviceConnected(false);
            setIrradiance(0);
            setTemperature(0);
            setSoiling(0);
            setAngle(0);
            setActualPower(0);
            setExpectedPower(0);
            setTodayEnergy(0);
          }
        } catch (e) {}
      };
    } catch (err) {}

    // 2. High-reliability polling fallback to maintain sync
    const pollLocalBridge = async () => {
      try {
        const res = await fetch('/api/telemetry');
        if (res.ok) {
          const data = await res.json();
          if (data && data.connected && data.telemetry) {
            setIsDeviceConnected(true);
            const t = data.telemetry;
            if (t.irradiance !== undefined) setIrradiance(Number(t.irradiance));
            if (t.temperature !== undefined) setTemperature(Number(t.temperature));
            if (t.soiling !== undefined) setSoiling(Number(t.soiling));
            if (t.angle !== undefined) setAngle(Number(t.angle));
            if (t.actualPower !== undefined) setActualPower(Number(t.actualPower));
            if (t.expectedPower !== undefined) setExpectedPower(Number(t.expectedPower));
            setTodayEnergy(4.82);
          } else {
            setIsDeviceConnected(false);
            setIrradiance(0);
            setTemperature(0);
            setSoiling(0);
            setAngle(0);
            setActualPower(0);
            setExpectedPower(0);
            setTodayEnergy(0);
          }
        }
      } catch (e) {
        setIsDeviceConnected(false);
        setIrradiance(0);
        setTemperature(0);
        setSoiling(0);
        setAngle(0);
        setActualPower(0);
        setExpectedPower(0);
        setTodayEnergy(0);
      }
    };

    const pollInterval = setInterval(pollLocalBridge, 1000);
    pollLocalBridge();

    return () => {
      if (eventSource) eventSource.close();
      clearInterval(pollInterval);
    };
  }, []);


  // 3. When connected, sync calculations and update graph
  useEffect(() => {
    if (!isDeviceConnected) {
      setExpectedPower(0);
      setActualPower(0);
      return;
    }

    // Populate initial 24-hour history if empty
    setPowerHistory((prev) => {
      if (prev.length === 0) {
        return generateInitial24HrData();
      }
      return prev;
    });

    const exp = predictPowerML(irradiance, 25.0, OPTIMAL_ANGLE, 0.0);
    const act = predictPowerML(irradiance, temperature, angle, soiling);
    setExpectedPower(exp);
    setActualPower(act);

    const now = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    setPowerHistory((prev) => {
      const updated = [...prev, { time: now, expected: exp, actual: act, hoursAgo: 0 }];
      // Keep up to 60 historical points spanning 24 hours
      return updated.slice(-60);
    });
  }, [isDeviceConnected, irradiance, temperature, soiling, angle]);

  const powerLoss = isDeviceConnected ? Math.max(0, parseFloat((expectedPower - actualPower).toFixed(1))) : 0;
  const isUnderperforming = isDeviceConnected && powerLoss > 15.0;

  // Identify specific sensor values delivered from Wokwi simulation that define underperformance
  const underperformanceCulprits = useMemo(() => {
    if (!isUnderperforming) return [];
    const list = [];
    if (soiling > 25) {
      list.push({
        id: 'soiling',
        name: 'Dust & Soiling Accumulation',
        metric: 'Dust Level',
        value: `${soiling}%`,
        status: soiling > 45 ? 'Heavy Layer (>45%)' : 'Moderate (>25%)',
        color: 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10',
        recommendation: 'Cleaning Wiper Action',
        fixHint: 'Clean panel in Wokwi (turn dust knob to 0% or run wiper)'
      });
    }
    if (temperature > 35) {
      list.push({
        id: 'temperature',
        name: 'Thermal Degradation',
        metric: 'Cell Temperature',
        value: `${temperature}°C`,
        status: temperature > 45 ? 'Severe Overheating (>45°C)' : 'Thermal Efficiency Loss (>35°C)',
        color: 'border-rose-500/40 text-rose-400 bg-rose-500/10',
        recommendation: 'Cooling Spray/Fan Action',
        fixHint: 'Cool panel in Wokwi (reduce DHT22 temperature dial to ~25°C)'
      });
    }
    if (Math.abs(angle - OPTIMAL_ANGLE) > 5) {
      list.push({
        id: 'angle',
        name: 'Panel Tilt Angle Mismatch',
        metric: 'Tilt Angle',
        value: `${angle}°`,
        status: `${Math.abs(angle - OPTIMAL_ANGLE)}° deviation (optimal: ${OPTIMAL_ANGLE}°)`,
        color: 'border-blue-500/40 text-blue-400 bg-blue-500/10',
        recommendation: 'Servo Angle Adjustment',
        fixHint: `Align panel to optimal ${OPTIMAL_ANGLE}° facing direct sun`
      });
    }
    return list;
  }, [isUnderperforming, soiling, temperature, angle]);

  // 4. Graph Rollback Slice (Allows rolling back across the 24-hour timeline)
  const displayedHistory = useMemo(() => {
    if (!powerHistory.length) return [];
    if (rollbackHours === 0) {
      // Live window (last 24 points = last 12 hours up to Live)
      return powerHistory.slice(-24);
    }
    // Shift window back by rollbackHours (2 data points per hour)
    const shiftCount = Math.round(rollbackHours * 2);
    const targetIdx = Math.max(12, powerHistory.length - 1 - shiftCount);
    const startIdx = Math.max(0, targetIdx - 20);
    return powerHistory.slice(startIdx, targetIdx + 1);
  }, [powerHistory, rollbackHours]);


  // ML Pseudo-Simulation
  const handleSolveThis = () => {
    if (!isDeviceConnected) return;
    setIsSolving(true);
    setShowSolveModal(true);

    setTimeout(() => {
      const p_angle = predictPowerML(irradiance, temperature, OPTIMAL_ANGLE, soiling);
      const gain_angle = parseFloat(Math.max(0, p_angle - actualPower).toFixed(1));
      const cost_angle = 1.0;
      const net_angle = parseFloat((gain_angle - cost_angle).toFixed(1));

      const p_cool = predictPowerML(irradiance, 25.0, angle, soiling);
      const gain_cool = parseFloat(Math.max(0, p_cool - actualPower).toFixed(1));
      const cost_cool = 5.0;
      const net_cool = parseFloat((gain_cool - cost_cool).toFixed(1));

      const p_clean = predictPowerML(irradiance, temperature, angle, 0.0);
      const gain_clean = parseFloat(Math.max(0, p_clean - actualPower).toFixed(1));
      const cost_clean = 7.0;
      const net_clean = parseFloat((gain_clean - cost_clean).toFixed(1));

      const candidates = [
        {
          id: 'angle',
          name: 'Adjust Panel Angle',
          icon: CompassIcon,
          desc: `Tilt to ${OPTIMAL_ANGLE}° facing sun`,
          predictedPower: p_angle,
          recovery: gain_angle,
          energyCost: cost_angle,
          netBenefit: net_angle
        },
        {
          id: 'cooling',
          name: 'Cooling Spray / Fan',
          icon: Wind,
          desc: 'Lower temperature to 25°C',
          predictedPower: p_cool,
          recovery: gain_cool,
          energyCost: cost_cool,
          netBenefit: net_cool
        },
        {
          id: 'cleaning',
          name: 'Automated Cleaning Wiper',
          icon: Sparkles,
          desc: 'Remove dust layer to 0%',
          predictedPower: p_clean,
          recovery: gain_clean,
          energyCost: cost_clean,
          netBenefit: net_clean
        }
      ];

      candidates.sort((a, b) => b.netBenefit - a.netBenefit);
      const best = candidates[0];

      setPseudoResults({
        candidates,
        bestAction: best
      });

      setIsSolving(false);
    }, 700);
  };

  const applyCorrectiveAction = async (action) => {
    // Send actuator command directly into Wokwi ESP32 simulation
    if (action.id === 'cleaning') {
      try {
        await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'clean' })
        });
      } catch (e) {}
    } else if (action.id === 'cooling') {
      try {
        await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'cool' })
        });
      } catch (e) {}
    } else if (action.id === 'angle') {
      try {
        await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'run' })
        });
      } catch (e) {}
    }

    const actualRecovered = parseFloat((action.recovery * 0.92).toFixed(1));
    const error = Math.abs(parseFloat((action.recovery - actualRecovered).toFixed(1)));

    setActionSuccessMessage({
      actionName: action.name,
      predictedGain: action.recovery,
      actualGain: actualRecovered,
      error: error,
      details: 'Actuator command sent to ESP32 in VS Code Wokwi simulation. Dials and sensors must be adjusted in simulation.'
    });

    setShowSolveModal(false);
  };

  const monthlyData = [
    { name: 'Jan', power: 120 }, { name: 'Feb', power: 135 }, { name: 'Mar', power: 160 },
    { name: 'Apr', power: 180 }, { name: 'May', power: 195 }, { name: 'Jun', power: 175 },
    { name: 'Jul', power: 165 }, { name: 'Aug', power: 170 }, { name: 'Sep', power: 155 },
    { name: 'Oct', power: 142.5 }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between pb-6 mb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border transition ${
              isDeviceConnected 
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
              <Sun className={`w-7 h-7 ${isDeviceConnected ? 'animate-spin-slow' : ''}`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                SolarGuard AI
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  ESP32 IoT Digital Twin
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                IoT-Based Predictive Corrective Control for Solar Panel Performance Recovery
              </p>
            </div>
          </div>
        </div>

        {/* Connection Status Badge (No manual start button - driven strictly by VS Code) */}
        <div className="flex items-center gap-3">
          <div className={`px-4 py-2 rounded-xl flex items-center gap-2 border shadow-sm ${
            !isDeviceConnected
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              : isUnderperforming 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          }`}>
            {isDeviceConnected ? (
              <Wifi className="w-4 h-4 text-emerald-400 animate-pulse" />
            ) : (
              <WifiOff className="w-4 h-4 text-rose-400" />
            )}
            <span className="text-sm font-semibold">
              {!isDeviceConnected 
                ? 'Connection Break / Start Simulation in VS Code' 
                : isUnderperforming 
                  ? 'ESP32 Connected: Underperforming' 
                  : 'ESP32 Connected: Optimal'}
            </span>
          </div>
        </div>
      </header>

      {/* CONNECTION BREAK / OFFLINE BANNER */}
      {!isDeviceConnected && (
        <div className="mb-8 p-6 rounded-3xl bg-gradient-to-r from-rose-950/70 via-slate-900 to-slate-900 border-2 border-rose-500/40 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-rose-500/20 text-rose-400 rounded-2xl border border-rose-500/30 flex-shrink-0 animate-pulse">
              <WifiOff className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Connection Break / Start Simulation in VS Code
                <span className="text-xs bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/30">
                  Awaiting ESP32
                </span>
              </h3>
              <p className="text-sm text-slate-300 mt-1">
                The dashboard only displays readings when the simulation is active. Open VS Code and click the green <span className="text-emerald-400 font-semibold">▶ Play</span> button in Wokwi Simulator to start streaming live solar telemetry.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/60 px-4 py-2.5 rounded-xl border border-slate-800 flex-shrink-0">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Listening on Wokwi Bridge</span>
          </div>
        </div>
      )}

      {/* Action Completed Notification Banner */}
      {isDeviceConnected && actionSuccessMessage && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-emerald-300">
                Action Completed: {actionSuccessMessage.actionName}
              </h4>
              <p className="text-xs text-slate-300 mt-0.5">
                Predicted Recovery: <span className="text-emerald-400 font-semibold">+{actionSuccessMessage.predictedGain} W</span> | 
                Actual Recovery: <span className="text-emerald-400 font-semibold">+{actionSuccessMessage.actualGain} W</span> | 
                Verification Error: <span className="text-slate-400">{actionSuccessMessage.error} W</span>
              </p>
            </div>
          </div>
          <button 
            onClick={() => setActionSuccessMessage(null)}
            className="text-xs text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* CRITICAL UNDERPERFORMING ALERT BANNER */}
      {isUnderperforming && (
        <div className="mb-8 p-6 rounded-3xl bg-gradient-to-r from-rose-950/80 via-slate-900 to-amber-950/40 border-2 border-rose-500/50 shadow-xl shadow-rose-950/40">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-4 border-b border-rose-500/20">
            <div className="flex items-start gap-4">
              <div className="p-3.5 bg-rose-500/20 text-rose-400 rounded-2xl border border-rose-500/30 flex-shrink-0 animate-pulse">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">
                    Underperformance Detected in Solar Simulation!
                  </h3>
                  <span className="text-xs bg-rose-500/20 text-rose-300 px-2.5 py-0.5 rounded-full border border-rose-500/30 font-semibold">
                    -{powerLoss} W Loss
                  </span>
                </div>
                <p className="text-sm text-slate-300 mt-1">
                  Actual output is <span className="text-rose-400 font-bold">{actualPower} W</span> vs expected <span className="text-amber-400 font-bold">{expectedPower} W</span>. 
                  Below are the culprit sensor factors delivered from VS Code Wokwi simulation.
                </p>
              </div>
            </div>

            <button
              onClick={handleSolveThis}
              className="px-6 py-3.5 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all transform hover:scale-105 active:scale-95 flex-shrink-0"
            >
              <Cpu className="w-5 h-5 text-slate-950" />
              Solve This (ML Recommendation)
            </button>
          </div>

          {/* Culprit Factors Breakdown delivered from Wokwi */}
          <div className="mt-4 pt-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-amber-400" />
              Culprit Degradation Factors (Captured Live from VS Code Simulation):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {underperformanceCulprits.map((culprit) => (
                <div 
                  key={culprit.id}
                  className={`p-3 rounded-xl border flex flex-col justify-between ${culprit.color}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">{culprit.name}</span>
                    <span className="text-sm font-extrabold">{culprit.value}</span>
                  </div>
                  <span className="text-[11px] opacity-90">{culprit.status}</span>
                  <div className="mt-2 text-[10px] bg-slate-950/40 px-2 py-1 rounded border border-white/10 font-mono">
                    Fix: {culprit.recommendation}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Current Power</span>
            <Zap className={`w-4 h-4 ${isDeviceConnected ? 'text-amber-400' : 'text-slate-600'}`} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {isDeviceConnected ? actualPower : 0}
            </span>
            <span className="text-sm text-slate-400">W</span>
          </div>
          <div className="mt-2 text-xs flex items-center gap-1.5">
            <span className="text-slate-400">Expected:</span>
            <span className="text-amber-400 font-semibold">{isDeviceConnected ? `${expectedPower} W` : '0 W'}</span>
            <span className={`ml-auto font-medium ${isDeviceConnected && isUnderperforming ? 'text-rose-400' : isDeviceConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
              {isDeviceConnected && expectedPower > 0 ? `${((actualPower / expectedPower) * 100).toFixed(0)}% Eff.` : '0% Eff.'}
            </span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Today's Generation</span>
            <Activity className={`w-4 h-4 ${isDeviceConnected ? 'text-emerald-400' : 'text-slate-600'}`} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {isDeviceConnected ? todayEnergy : 0}
            </span>
            <span className="text-sm text-slate-400">kWh</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {isDeviceConnected ? '+4.2% vs yesterday' : 'Simulation Stopped (0.00 kWh)'}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Monthly Total</span>
            <BarChart2 className={`w-4 h-4 ${isDeviceConnected ? 'text-blue-400' : 'text-slate-600'}`} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {isDeviceConnected ? monthEnergy : 0}
            </span>
            <span className="text-sm text-slate-400">kWh</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {isDeviceConnected ? 'October 2026 Production' : 'Simulation Stopped (0 kWh)'}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Annual Generation</span>
            <ShieldCheck className={`w-4 h-4 ${isDeviceConnected ? 'text-purple-400' : 'text-slate-600'}`} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {isDeviceConnected ? yearEnergy : 0}
            </span>
            <span className="text-sm text-slate-400">kWh</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {isDeviceConnected ? 'Total Solar Harvest (YTD)' : 'Simulation Stopped (0 kWh)'}
          </div>
        </div>
      </div>

      {/* Main Content: Telemetry & Live Power Chart with 1-Hour Rollback */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Left Column: Read-Only Hardware Telemetry Delivered from VS Code Wokwi */}
        <div className={`p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between relative ${
          !isDeviceConnected ? 'opacity-60' : ''
        }`}>
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800/80">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>IoT Sensor Telemetry</span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 font-mono">
                    Hardware
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Live readings streaming from ESP32</p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium border flex items-center gap-1.5 ${
                isDeviceConnected 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isDeviceConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                {isDeviceConnected ? 'Wokwi Active' : 'Simulation 0'}
              </span>
            </div>

            {/* Sunlight / Irradiance Meter (Read-Only) */}
            <div className="mb-4 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                  <Sun className="w-4 h-4" /> Irradiance (LDR Sensor)
                </span>
                <span className="text-white font-bold text-sm">
                  {isDeviceConnected ? `${irradiance} W/m²` : '0 W/m²'}
                </span>
              </div>
              {/* Read-only progress bar */}
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div 
                  className="bg-amber-400 h-2 rounded-full transition-all duration-500" 
                  style={{ width: `${isDeviceConnected ? Math.min(100, (irradiance / 1000) * 100) : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                <span>0 W/m² (Night)</span>
                <span className={isDeviceConnected && irradiance >= 700 ? 'text-amber-400 font-medium' : 'text-slate-400'}>
                  {isDeviceConnected ? (irradiance >= 700 ? 'Strong Sunlight' : irradiance >= 400 ? 'Moderate Sun' : 'Low Light') : '0 (Stopped)'}
                </span>
                <span>1000 W/m²</span>
              </div>
            </div>

            {/* Temperature Meter (Read-Only) */}
            <div className="mb-4 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                  <Thermometer className="w-4 h-4" /> Cell Temp (DHT22 Sensor)
                </span>
                <span className="text-white font-bold text-sm">
                  {isDeviceConnected ? `${temperature} °C` : '0 °C'}
                </span>
              </div>
              {/* Read-only progress bar */}
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div 
                  className={`h-2 rounded-full transition-all duration-500 ${temperature > 35 ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                  style={{ width: `${isDeviceConnected ? Math.min(100, Math.max(0, ((temperature - 15) / 45) * 100)) : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                <span>15°C (Cool)</span>
                <span className={isDeviceConnected && temperature > 35 ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
                  {isDeviceConnected ? (temperature > 40 ? '⚠️ High Thermal Loss' : temperature > 30 ? 'Warm Panel' : 'Nominal 25°C') : '0 (Stopped)'}
                </span>
                <span>60°C</span>
              </div>
            </div>

            {/* Dust / Soiling Meter (Read-Only) */}
            <div className="mb-4 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 text-yellow-400 font-medium">
                  <Sparkles className="w-4 h-4" /> Soiling / Dust (Potentiometer)
                </span>
                <span className="text-white font-bold text-sm">
                  {isDeviceConnected ? `${soiling} %` : '0 %'}
                </span>
              </div>
              {/* Read-only progress bar */}
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div 
                  className={`h-2 rounded-full transition-all duration-500 ${soiling > 25 ? 'bg-yellow-400' : 'bg-emerald-500'}`} 
                  style={{ width: `${isDeviceConnected ? Math.min(100, Math.max(0, soiling)) : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                <span>0% (Clean)</span>
                <span className={isDeviceConnected && soiling > 25 ? 'text-yellow-400 font-semibold' : 'text-slate-400'}>
                  {isDeviceConnected ? (soiling > 45 ? '⚠️ Heavy Dust Layer' : soiling > 25 ? 'Dust Accumulation' : 'Clean Surface') : '0 (Stopped)'}
                </span>
                <span>100% (Dirty)</span>
              </div>
            </div>

            {/* Panel Tilt Angle Meter (Read-Only) */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 text-blue-400 font-medium">
                  <CompassIcon className="w-4 h-4" /> Panel Tilt Angle (Servo)
                </span>
                <span className="text-white font-bold text-sm">
                  {isDeviceConnected ? `${angle}°` : '0°'}
                </span>
              </div>
              {/* Read-only progress bar */}
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div 
                  className={`h-2 rounded-full transition-all duration-500 ${angle === OPTIMAL_ANGLE ? 'bg-emerald-400' : 'bg-blue-400'}`} 
                  style={{ width: `${isDeviceConnected ? Math.min(100, Math.max(0, (angle / 60) * 100)) : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                <span>0°</span>
                <span className={isDeviceConnected && angle === OPTIMAL_ANGLE ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                  {isDeviceConnected ? (angle === OPTIMAL_ANGLE ? 'Optimal (20°)' : `Misaligned (Opt: 20°)`) : '0 (Stopped)'}
                </span>
                <span>60°</span>
              </div>
            </div>
          </div>

          {/* Read-Only Notice */}
          <div className="mt-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400 flex items-start gap-2 bg-slate-950/40 p-3 rounded-xl border border-slate-800/50">
            <span className="text-amber-400 font-bold text-sm leading-none">🔒</span>
            <span className="text-[11px] leading-relaxed text-slate-300">
              <strong className="text-white">Strict Read-Only Digital Twin:</strong> Sensor values can only be adjusted inside VS Code Wokwi simulation. Move the potentiometer dust dial, LDR light level, or DHT22 temperature dial in VS Code to see values update here.
            </span>
          </div>
        </div>

        {/* Right 2 Columns: Power Graph with 24-Hour Rollback Controls */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-2 border-b border-slate-800/80 gap-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Solar Power Generation (Past 24 Hours)</span>
                {rollbackHours > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium">
                    Rolled back -{rollbackHours}h
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                {isDeviceConnected ? 'Scroll/scrub slider to roll back across the past 24 hours' : 'Awaiting simulation start in VS Code'}
              </p>
            </div>

            {/* Quick 24-Hour Rollback Preset Buttons */}
            {isDeviceConnected && (
              <div className="flex items-center gap-1.5 text-xs bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setRollbackHours(0)}
                  className={`px-2 py-1 rounded-lg font-medium transition ${
                    rollbackHours === 0 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Live
                </button>
                <button
                  onClick={() => setRollbackHours(4)}
                  className={`px-2 py-1 rounded-lg font-medium transition ${
                    rollbackHours === 4 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  -4h
                </button>
                <button
                  onClick={() => setRollbackHours(8)}
                  className={`px-2 py-1 rounded-lg font-medium transition ${
                    rollbackHours === 8 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  -8h
                </button>
                <button
                  onClick={() => setRollbackHours(12)}
                  className={`px-2 py-1 rounded-lg font-medium transition ${
                    rollbackHours === 12 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  -12h
                </button>
                <button
                  onClick={() => setRollbackHours(18)}
                  className={`px-2 py-1 rounded-lg font-medium transition ${
                    rollbackHours === 18 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  -18h
                </button>
                <button
                  onClick={() => setRollbackHours(24)}
                  className={`px-2 py-1 rounded-lg font-medium transition ${
                    rollbackHours === 24 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  -24h
                </button>
              </div>
            )}
          </div>

          {/* 24-Hour Interactive Time Rollback Slider */}
          {isDeviceConnected && (
            <div className="mb-3 px-3 py-2 bg-slate-950/60 rounded-xl border border-slate-800/80 flex items-center gap-3">
              <span className="text-[11px] text-slate-400 flex items-center gap-1 flex-shrink-0">
                <History className="w-3.5 h-3.5 text-blue-400" />
                Rollback (24h):
              </span>
              <input
                type="range"
                min="0"
                max="24"
                step="0.5"
                value={rollbackHours}
                onChange={(e) => setRollbackHours(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
              <span className="text-xs font-mono text-blue-300 w-20 text-right flex-shrink-0">
                {rollbackHours === 0 ? 'Live (Now)' : `-${rollbackHours} hrs`}
              </span>
            </div>
          )}

          {/* The Chart */}
          <div className="h-60 w-full relative">
            {!isDeviceConnected ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-center p-4">
                <WifiOff className="w-8 h-8 text-rose-500/60 mb-2" />
                <p className="text-sm font-semibold text-slate-300">Connection Break / Start Simulation</p>
                <p className="text-xs text-slate-500 mt-0.5">Start the simulation in VS Code Wokwi to display 24-hour solar generation curves</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={displayedHistory}>
                  <defs>
                    <linearGradient id="colorExpected" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.5}/>
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" domain={[0, 160]} tick={{ fontSize: 11 }} unit="W" />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                  <Area type="monotone" dataKey="expected" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorExpected)" name="Expected Power" />
                  <Area type="monotone" dataKey="actual" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#colorActual)" name="Actual Power" />
                  <Brush dataKey="time" height={22} stroke="#38bdf8" fill="#020617" travellerWidth={8} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> Expected Power
            </span>
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="w-2 h-2 rounded-full bg-blue-400" /> Actual Power
            </span>
            <span className="text-slate-400 font-mono">Scale: Past 24 Hours</span>
          </div>

        </div>
      </div>

      {/* Monthly Production Bar Chart */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 mb-8">
        <h3 className="text-base font-bold text-white mb-1">Monthly Energy Production (2026)</h3>
        <p className="text-xs text-slate-400 mb-4">Historical yield stored in Firebase Database</p>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748b" unit=" kWh" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
              <Bar dataKey="power" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Energy Produced (kWh)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* WHAT-IF PSEUDO-SIMULATION MODAL */}
      {showSolveModal && isDeviceConnected && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 shadow-2xl overflow-hidden relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">ML Pseudo-Simulation & Net Benefit Evaluation</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                      ML R²: 88.8% (Kaggle)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Trained on Kaggle PV Plant Shading Faults Dataset (MAE: 7.59 W)
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowSolveModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {isSolving ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-semibold text-slate-300 mt-2">Running What-If Simulations across all candidates...</p>
                <p className="text-xs text-slate-500">Calculating: Net Benefit = Expected Gain - Actuator Energy</p>
              </div>
            ) : pseudoResults && (
              <div className="py-5">
                <div className="mb-5 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-emerald-300 font-semibold uppercase tracking-wider">Recommended Action</div>
                      <div className="text-base font-bold text-white">{pseudoResults.bestAction.name}</div>
                      <div className="text-xs text-slate-300">{pseudoResults.bestAction.desc}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Net Profit</span>
                    <span className="text-xl font-extrabold text-emerald-400">
                      +{pseudoResults.bestAction.netBenefit} Wh
                    </span>
                  </div>
                </div>

                <h4 className="text-xs font-semibold uppercase text-slate-400 mb-3 tracking-wider">
                  Virtual What-If Candidate Analysis (Kaggle ML Model)
                </h4>
                <div className="space-y-2.5 mb-6">
                  {pseudoResults.candidates.map((item) => {
                    const isBest = item.id === pseudoResults.bestAction.id;
                    const Icon = item.icon;
                    return (
                      <div 
                        key={item.id}
                        className={`p-3.5 rounded-xl border flex items-center justify-between transition ${
                          isBest 
                            ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm' 
                            : 'bg-slate-950/40 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isBest ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white flex items-center gap-2">
                              {item.name}
                              {isBest && (
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.2 rounded-full border border-emerald-500/30">
                                  BEST CHOICE
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">{item.desc}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-right">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Pred. Gain</span>
                            <span className="text-xs font-semibold text-slate-200">+{item.recovery} W</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Energy Cost</span>
                            <span className="text-xs font-semibold text-rose-400">-{item.energyCost} Wh</span>
                          </div>
                          <div className="w-20">
                            <span className="text-[10px] text-slate-400 block">Net Profit</span>
                            <span className={`text-sm font-bold ${isBest ? 'text-emerald-400' : 'text-slate-300'}`}>
                              +{item.netBenefit} Wh
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button 
                    onClick={() => setShowSolveModal(false)}
                    className="px-4 py-2.5 text-xs text-slate-400 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => applyCorrectiveAction(pseudoResults.bestAction)}
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition"
                  >
                    Execute {pseudoResults.bestAction.name}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CompassIcon(props) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
    </svg>
  );
}
