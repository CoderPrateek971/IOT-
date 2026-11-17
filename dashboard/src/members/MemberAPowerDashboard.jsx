import { Activity, ShieldCheck, Zap } from 'lucide-react';

// Member A starts here: power output, energy, model scale, and operating status.
export default function MemberAPowerDashboard({ actualPower, expectedPower, sessionEnergy, performanceRatio, isUnderperforming, lastUpdated, isDeviceConnected, powerLoss }) {
  const cards = [
    { title: 'Simulated Output', icon: <Zap className="w-4 h-4 text-amber-400" />, value: actualPower, unit: 'W', foot: `Expected: ${expectedPower} W`, badge: `${performanceRatio}% PR`, badgeClass: isUnderperforming ? 'text-amber-400' : 'text-emerald-400' },
    { title: 'Session Energy', icon: <Activity className="w-4 h-4 text-emerald-400" />, value: sessionEnergy.toFixed(3), unit: 'kWh', foot: 'Integrated since page load' },
  ];

  return <section className="grid grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Power and system summary">
    {cards.map((card) => <div key={card.title} className="p-4 rounded-lg bg-slate-900 border border-slate-800">
      <div className="flex items-center justify-between text-slate-400 mb-1"><span className="text-xs uppercase tracking-wider font-medium">{card.title}</span>{card.icon}</div>
      <div className="flex items-baseline gap-2"><span className="text-2xl font-bold tracking-tight text-white">{card.value}</span><span className="text-xs text-slate-400">{card.unit}</span></div>
      <div className="mt-1 text-xs text-slate-400 flex items-center justify-between"><span>{card.foot}</span>{card.badge && <span className={`${card.badgeClass} font-medium`}>{card.badge}</span>}</div>
    </div>)}
    <div className="p-4 rounded-lg bg-slate-900 border border-slate-800">
      <div className="flex items-center justify-between text-slate-400 mb-1"><span className="text-xs uppercase tracking-wider font-medium">System Status</span><ShieldCheck className="w-4 h-4" /></div>
      <div className="text-base font-semibold"><span className={!lastUpdated ? 'text-slate-300' : !isDeviceConnected ? 'text-rose-400' : isUnderperforming ? 'text-amber-400' : 'text-emerald-400'}>{!lastUpdated ? 'Waiting for data' : !isDeviceConnected ? 'Telemetry error' : isUnderperforming ? 'Underperforming' : 'Nominal'}</span></div>
      <div className="mt-1 text-xs text-slate-400">{!lastUpdated ? 'Waiting for the first Wokwi reading' : !isDeviceConnected ? 'No new reading received for 3 minutes' : isUnderperforming ? `${powerLoss} W loss` : 'No modeled deficit'}</div>
    </div>
  </section>;
}
