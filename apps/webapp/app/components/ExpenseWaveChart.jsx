'use client';

import { useMemo } from 'react';

export default function ExpenseWaveChart({ dailyMap = {}, selectedYear, selectedMonth, monthlyExpenses = 0, botLogs = [] }) {
  // Days in selected month
  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth, 0).getDate();
  }, [selectedYear, selectedMonth]);

  // Daily values array
  const { dailyData, peakDay, peakAmount, activeDays, dailyAvg } = useMemo(() => {
    const list = [];
    let maxAmt = 0;
    let maxD = 1;
    let countActive = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayObj = dailyMap[dStr];
      const amt = dayObj ? dayObj.total : 0;
      if (amt > 0) countActive++;
      if (amt > maxAmt) {
        maxAmt = amt;
        maxD = d;
      }
      list.push({ day: d, dateStr: dStr, amount: amt });
    }

    const avg = countActive > 0 ? Math.round(monthlyExpenses / countActive) : 0;
    return {
      dailyData: list,
      peakDay: maxD,
      peakAmount: maxAmt,
      activeDays: countActive,
      dailyAvg: avg,
    };
  }, [dailyMap, selectedYear, selectedMonth, daysInMonth, monthlyExpenses]);

  // SVG dimensions
  const svgWidth = 520;
  const svgHeight = 130;
  const paddingX = 24;
  const paddingTop = 32;
  const paddingBottom = 22;

  // Compute curve points
  const points = useMemo(() => {
    const plotW = svgWidth - paddingX * 2;
    const plotH = svgHeight - paddingTop - paddingBottom;
    const maxVal = Math.max(peakAmount * 1.15, 100);

    return dailyData.map((pt, idx) => {
      const x = paddingX + (idx / (daysInMonth - 1)) * plotW;
      const y = paddingTop + plotH - (pt.amount / maxVal) * plotH;
      return { x, y, ...pt };
    });
  }, [dailyData, peakAmount, daysInMonth]);

  // Generate smooth SVG bezier path
  const { pathD, areaD, peakPoint } = useMemo(() => {
    if (points.length === 0) return { pathD: '', areaD: '', peakPoint: null };

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX = (p0.x + p1.x) / 2;
      d += ` C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const last = points[points.length - 1];
    const first = points[0];
    const baselineY = svgHeight - paddingBottom;
    const area = `${d} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;

    const peak = points.find((p) => p.day === peakDay) || points[0];

    return { pathD: d, areaD: area, peakPoint: peak };
  }, [points, peakDay, svgHeight, paddingBottom]);

  const formatBaht = (num) => {
    return new Intl.NumberFormat('th-TH').format(Math.round(num || 0));
  };

  return (
    <div className="quant-hero-radar-grid">
      {/* 1. LEFT CARD: EXPENSE VELOCITY AREA WAVE (STYLE FROM REFERENCE TOP-LEFT) */}
      <div className="quant-card">
        <div className="quant-card-header">
          <div className="quant-card-title">
            <span className="quant-dot green" />
            <span>CASHFLOW VELOCITY & EXPENSE WAVE</span>
          </div>
          <div className="quant-card-tag">
            <span>DAILY DENSITY / {String(selectedMonth).padStart(2, '0')}.{selectedYear}</span>
          </div>
        </div>

        <div className="quant-radar-body">
          {/* Quick Metrics Column on Left */}
          <div className="quant-radar-metrics">
            <div className="quant-metric-item">
              <span className="quant-metric-lbl">TOTAL OUTFLOW</span>
              <span className="quant-metric-val cyan">฿{formatBaht(monthlyExpenses)}</span>
            </div>
            <div className="quant-metric-item">
              <span className="quant-metric-lbl">DAILY AVERAGE</span>
              <span className="quant-metric-val">฿{formatBaht(dailyAvg)}</span>
            </div>
            <div className="quant-metric-item">
              <span className="quant-metric-lbl">MAX PEAK BURST</span>
              <span className="quant-metric-val rose">฿{formatBaht(peakAmount)}</span>
            </div>
            <div className="quant-metric-item">
              <span className="quant-metric-lbl">ACTIVE SPENDING</span>
              <span className="quant-metric-val">{activeDays} / {daysInMonth} วัน</span>
            </div>
          </div>

          {/* Smooth Area Wave SVG on Right */}
          <div className="quant-radar-chart">
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="quant-wave-svg">
              <defs>
                <linearGradient id="quantWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
                  <stop offset="60%" stopColor="#0ea5e9" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="quantLineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="65%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
              </defs>

              {/* Grid Baseline */}
              <line
                x1={paddingX}
                y1={svgHeight - paddingBottom}
                x2={svgWidth - paddingX}
                y2={svgHeight - paddingBottom}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="1"
              />

              {/* Area Fill */}
              {areaD && <path d={areaD} fill="url(#quantWaveGrad)" />}

              {/* Wave Line */}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke="url(#quantLineGrad)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              )}

              {/* Peak Marker Dot & Callout Badge (Exact 0.0150 style from reference) */}
              {peakPoint && peakAmount > 0 && (
                <g>
                  {/* Vertical dashed hairline to baseline */}
                  <line
                    x1={peakPoint.x}
                    y1={peakPoint.y}
                    x2={peakPoint.x}
                    y2={svgHeight - paddingBottom}
                    stroke="rgba(244, 63, 94, 0.45)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />

                  {/* Outer pulse circle */}
                  <circle
                    cx={peakPoint.x}
                    cy={peakPoint.y}
                    r="6"
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="1.2"
                    opacity="0.8"
                  />
                  {/* Solid inner dot */}
                  <circle cx={peakPoint.x} cy={peakPoint.y} r="3" fill="#f43f5e" />

                  {/* Callout Badge Box */}
                  <g transform={`translate(${Math.min(Math.max(peakPoint.x - 45, 6), svgWidth - 96)}, ${Math.max(peakPoint.y - 24, 6)})`}>
                    <rect
                      x="0"
                      y="0"
                      width="90"
                      height="18"
                      rx="4"
                      fill="#111827"
                      stroke="#f43f5e"
                      strokeWidth="1"
                    />
                    <text
                      x="45"
                      y="12"
                      fill="#f43f5e"
                      fontSize="9"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      ฿{formatBaht(peakAmount)} PEAK
                    </text>
                  </g>
                </g>
              )}

              {/* Timeline Axis Labels */}
              <text x={paddingX} y={svgHeight - 6} fill="#64748b" fontSize="8" fontFamily="JetBrains Mono, monospace">
                01
              </text>
              <text x={svgWidth / 3} y={svgHeight - 6} fill="#64748b" fontSize="8" fontFamily="JetBrains Mono, monospace" textAnchor="middle">
                10
              </text>
              <text x={(svgWidth * 2) / 3} y={svgHeight - 6} fill="#64748b" fontSize="8" fontFamily="JetBrains Mono, monospace" textAnchor="middle">
                20
              </text>
              <text x={svgWidth - paddingX} y={svgHeight - 6} fill="#64748b" fontSize="8" fontFamily="JetBrains Mono, monospace" textAnchor="end">
                {daysInMonth}
              </text>
            </svg>
          </div>
        </div>
      </div>

      {/* 2. RIGHT CARD: REALTIME TERMINAL BREADCRUMBS FEED (STYLE FROM REFERENCE TOP-RIGHT) */}
      <div className="quant-card">
        <div className="quant-card-header">
          <div className="quant-card-title">
            <span className="quant-dot cyan" />
            <span>REALTIME EXECUTION & BOT LOGS</span>
          </div>
          <div className="quant-card-tag">
            <span>LIVE AUDIT STREAM</span>
          </div>
        </div>

        <div className="quant-terminal-log-feed">
          <div className="quant-log-line highlight">
            <span className="quant-log-time">18:43</span>
            <span className="quant-log-pill purple">GATE</span>
            <span className="quant-log-msg">
              <strong>DAILY CASHFLOW RADAR ACTIVE</strong> — Invalidation monitored
            </span>
          </div>

          {botLogs.length === 0 ? (
            <div className="quant-log-empty">
              <span>ไม่มีรายการ Log ในช่วงนี้ — บอท Telegram พร้อมทำงาน</span>
            </div>
          ) : (
            botLogs.slice(0, 5).map((log, idx) => {
              const timeStr = log.created_at
                ? new Date(log.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                : 'NOW';
              return (
                <div key={log.id || idx} className="quant-log-line">
                  <span className="quant-log-time">{timeStr}</span>
                  <span className="quant-log-pill teal">BOT</span>
                  <span className="quant-log-msg" title={log.message || log.raw_message}>
                    {log.message || log.raw_message}
                  </span>
                </div>
              );
            })
          )}

          <div className="quant-log-line footer-line">
            <span className="quant-log-time">SYNC</span>
            <span className="quant-log-pill green">GGD</span>
            <span className="quant-log-msg">Google Sheets Webhook Connected & Auto-Backed Up</span>
          </div>
        </div>
      </div>
    </div>
  );
}
