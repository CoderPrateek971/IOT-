import { AlertTriangle } from 'lucide-react';
import { faultClassForSoiling } from '../mlModel';

// Member B starts here: fault interpretation and model-triggered diagnostics.
export default function MemberBDiagnosticsDashboard({ isUnderperforming, powerLoss, actualPower, expectedPower, performanceRatio, culprits, onEvaluate, actionHistory, soiling }) {
  return <>
    <section className="rounded-lg bg-slate-900 border border-slate-800 p-4 flex items-center justify-between gap-4">
      <div><h2 className="text-sm font-semibold text-white">Soiling and Fault Input</h2><p className="text-xs text-slate-400 mt-1">Potentiometer mapped to the model's categorical fault classes</p></div>
      <div className="text-right"><strong className={`font-mono ${soiling > 25 ? 'text-amber-400' : 'text-white'}`}>{soiling}%</strong><div className="text-[11px] text-slate-500">Fault class {faultClassForSoiling(soiling)}</div></div>
    </section>
    {isUnderperforming && <section className="p-4 rounded-lg bg-slate-900 border-l-4 border-amber-500 border-y border-r border-slate-800">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div className="space-y-1">
        <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /><span className="font-semibold text-white text-sm">Performance Deficit Detected (-{powerLoss} W)</span></div>
        <p className="text-xs text-slate-300">Current array output is <strong className="text-white">{actualPower} W</strong> vs expected <strong className="text-white">{expectedPower} W</strong> (PR: {performanceRatio}%). Degradation factors detected from telemetry:</p>
        <div className="flex flex-wrap gap-2 pt-1.5">{culprits.map((culprit) => <span key={culprit.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-slate-800 border border-slate-700"><span className="text-slate-400">{culprit.label}:</span><strong className="text-amber-300">{culprit.value}</strong><span className="text-slate-400">(ref: {culprit.target})</span></span>)}</div>
      </div><button onClick={onEvaluate} className="px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold whitespace-nowrap transition">Evaluate Corrective Actions</button></div>
    </section>}
    {actionHistory.length > 0 && <section className="rounded-lg bg-slate-900 border border-slate-800 p-4">
      <h2 className="text-sm font-semibold text-white mb-3">Recent action verification</h2><div className="space-y-2">{actionHistory.slice(0, 5).map((item, index) => <div key={`${item.time}-${index}`} className="flex flex-wrap justify-between gap-2 text-xs text-slate-300 border-t border-slate-800 pt-2"><span>{new Date(item.time).toLocaleString()} · {item.actionName}</span><span>Predicted {item.predictedGain} W · simulated {item.actualGain} W · error {item.predictionError} W</span></div>)}</div>
    </section>}
  </>;
}
