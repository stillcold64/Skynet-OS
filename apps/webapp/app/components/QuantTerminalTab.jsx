'use client';

import { useState, useEffect, useRef } from 'react';

export default function QuantTerminalTab({ botLogs = [], tradeStats = null, transactions = [] }) {
  // Live UTC Clock
  const [utcTime, setUtcTime] = useState('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toTimeString().split(' ')[0] + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Selected Stat Card
  const [selectedStatIdx, setSelectedStatIdx] = useState(2); // BTC $95K - JUN default
  const [ridgeMode, setRidgeMode] = useState('STRIKE'); // 'STRIKE' | 'EXIT'

  // ==========================================
  // 1. GALTON BOARD / PROBABILITY LATTICE SIM
  // ==========================================
  const latticeCanvasRef = useRef(null);
  const [ballsDropped, setBallsDropped] = useState(96);
  const [autoDrop, setAutoDrop] = useState(true);
  const latticeStateRef = useRef({
    balls: [],
    bins: [3, 8, 22, 38, 18, 7], // 6 bins: 2 loss (grey), 4 profit (green)
    pegs: [],
    animId: null,
  });

  useEffect(() => {
    const canvas = latticeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = (canvas.width = canvas.parentElement.clientWidth || 550);
    let height = (canvas.height = 200);

    // Build triangular pegs
    const rows = 7;
    const pegs = [];
    const startY = 35;
    const rowSpacing = 16;
    const pegSpacing = 24;

    for (let r = 0; r < rows; r++) {
      const count = r + 1;
      const startX = width / 2 - ((count - 1) * pegSpacing) / 2;
      for (let c = 0; c < count; c++) {
        pegs.push({ x: startX + c * pegSpacing, y: startY + r * rowSpacing, r: 2.2 });
      }
    }
    latticeStateRef.current.pegs = pegs;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Top Funnel
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 20, 8);
      ctx.lineTo(width / 2 - 5, 22);
      ctx.lineTo(width / 2 - 5, 28);
      ctx.moveTo(width / 2 + 20, 8);
      ctx.lineTo(width / 2 + 5, 22);
      ctx.lineTo(width / 2 + 5, 28);
      ctx.stroke();

      // Middle dividing dashed line (Loss vs Profit)
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#111827';
      ctx.beginPath();
      ctx.moveTo(width / 2 - 12, 28);
      ctx.lineTo(width / 2 - 12, height - 35);
      ctx.stroke();
      ctx.setLineDash([]);

      // Loss / Profit labels
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillStyle = '#6b7280';
      ctx.fillText('LOSS - 20%', width / 2 - 95, 20);
      ctx.fillStyle = '#10b981';
      ctx.fillText('PROFIT - 80%', width / 2 + 45, 20);

      // Draw Pegs
      ctx.fillStyle = '#111827';
      for (const p of pegs) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Update & Draw Balls
      const activeBalls = [];
      const currentBalls = latticeStateRef.current.balls;

      for (const b of currentBalls) {
        b.vy += 0.25; // gravity
        b.x += b.vx;
        b.y += b.vy;

        // Bounce on pegs
        for (const p of pegs) {
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 4.5) {
            // Edge bias to the right (profit side)
            const angle = Math.atan2(dy, dx) + (Math.random() - 0.42) * 0.5;
            const speed = Math.hypot(b.vx, b.vy) * 0.65;
            b.vx = Math.cos(angle) * speed + 0.35; // +0.35 edge tilt
            b.vy = Math.sin(angle) * speed;
            b.x = p.x + Math.cos(angle) * 5;
            b.y = p.y + Math.sin(angle) * 5;
          }
        }

        // Bottom hit -> add to bin
        if (b.y >= height - 38) {
          const binIndex = Math.min(
            5,
            Math.max(0, Math.floor(((b.x - (width / 2 - 110)) / 220) * 6))
          );
          latticeStateRef.current.bins[binIndex] = (latticeStateRef.current.bins[binIndex] || 0) + 1;
        } else {
          activeBalls.push(b);
          // Draw ball
          ctx.beginPath();
          ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = b.x > width / 2 - 12 ? '#10b981' : '#6b7280';
          ctx.fill();
        }
      }
      latticeStateRef.current.balls = activeBalls;

      // Draw Bottom Bins Histogram
      const bins = latticeStateRef.current.bins;
      const binWidth = 28;
      const binGap = 4;
      const totalBinsWidth = bins.length * (binWidth + binGap);
      const binStartX = width / 2 - totalBinsWidth / 2 + 10;
      const maxBinVal = Math.max(...bins, 30);

      bins.forEach((val, idx) => {
        const bx = binStartX + idx * (binWidth + binGap);
        const barH = (val / maxBinVal) * 32;
        const by = height - 6 - barH;

        ctx.fillStyle = idx < 2 ? '#4b5563' : '#10b981';
        ctx.fillRect(bx, by, binWidth, barH);

        // Value text
        ctx.fillStyle = '#111827';
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(val), bx + binWidth / 2, by - 3);
      });
      ctx.textAlign = 'left';

      latticeStateRef.current.animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (latticeStateRef.current.animId) cancelAnimationFrame(latticeStateRef.current.animId);
    };
  }, []);

  // Periodic Ball Drop
  useEffect(() => {
    if (!autoDrop) return;
    const interval = setInterval(() => {
      const canvas = latticeCanvasRef.current;
      if (!canvas) return;
      const w = canvas.width;
      latticeStateRef.current.balls.push({
        x: w / 2 + (Math.random() - 0.5) * 6,
        y: 12,
        vx: (Math.random() - 0.45) * 1.2,
        vy: 1.2,
      });
      setBallsDropped((prev) => prev + 1);
    }, 450);
    return () => clearInterval(interval);
  }, [autoDrop]);

  const handleManualDrop = () => {
    const canvas = latticeCanvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        latticeStateRef.current.balls.push({
          x: w / 2 + (Math.random() - 0.5) * 8,
          y: 12,
          vx: (Math.random() - 0.42) * 1.5,
          vy: 1.5,
        });
        setBallsDropped((prev) => prev + 1);
      }, i * 60);
    }
  };

  const handleResetLattice = () => {
    latticeStateRef.current.bins = [3, 8, 22, 38, 18, 7];
    latticeStateRef.current.balls = [];
    setBallsDropped(96);
  };

  // ==========================================
  // 2. TAIL PROBABILITY RIDGE (3D JOYPLOT)
  // ==========================================
  const ridgeCanvasRef = useRef(null);
  const [ridgeTooltip, setRidgeTooltip] = useState(null);

  useEffect(() => {
    const canvas = ridgeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = (canvas.width = canvas.parentElement.clientWidth || 700);
    const height = (canvas.height = 230);

    const numRidges = 16;
    const startY = 40;
    const rowStep = 9;
    const perspectiveTilt = 14;

    const drawRidges = (hoverX = null, hoverY = null) => {
      ctx.clearRect(0, 0, width, height);

      // Strike line (red dashed line)
      const strikeX = width * 0.72;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(strikeX + (numRidges * perspectiveTilt) / 2, 25);
      ctx.lineTo(strikeX - (numRidges * perspectiveTilt) / 2, height - 15);
      ctx.stroke();
      ctx.setLineDash([]);

      // Strike text
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.fillStyle = '#ef4444';
      ctx.fillText('STRIKE 100,000', strikeX - 10, 22);
      ctx.fillStyle = '#6b7280';
      ctx.fillText('TAIL ZONE - PAYOUT 100x', strikeX + 15, 22);

      let closestPoint = null;
      let minDistance = 9999;

      // Draw each ridge from back to front
      for (let r = 0; r < numRidges; r++) {
        const yBase = startY + r * rowStep;
        const xOffset = (r - numRidges / 2) * perspectiveTilt;
        const progress = r / numRidges;

        ctx.beginPath();
        const pts = [];
        const steps = 70;
        const curveWidth = width * 0.75;
        const startX = width * 0.12 + xOffset;

        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const x = startX + u * curveWidth;

          // Gaussian wave centered around u = 0.48
          const peakCenter = 0.48 + Math.sin(r * 0.4) * 0.05;
          const dist = Math.abs(u - peakCenter);
          const sigma = 0.12 + r * 0.003;
          const amp = Math.exp(-(dist * dist) / (2 * sigma * sigma)) * (48 + (1 - progress) * 16);
          const y = yBase - amp;
          pts.push({ x, y, u, r, amp });
        }

        // Fill under curve
        ctx.beginPath();
        ctx.moveTo(pts[0].x, yBase);
        pts.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineTo(pts[pts.length - 1].x, yBase);
        ctx.closePath();

        // Shading: front ridges have darker sleek fill
        if (r === numRidges - 1) {
          const grad = ctx.createLinearGradient(0, yBase - 60, 0, yBase);
          grad.addColorStop(0, 'rgba(17, 24, 39, 0.85)');
          grad.addColorStop(1, 'rgba(17, 24, 39, 0.05)');
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, 0.85)`;
        }
        ctx.fill();

        // Stroke line
        ctx.beginPath();
        pts.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);

          // Check hover proximity
          if (hoverX !== null && hoverY !== null) {
            const d = Math.hypot(p.x - hoverX, p.y - hoverY);
            if (d < minDistance && d < 30) {
              minDistance = d;
              closestPoint = p;
            }
          }
        });
        ctx.strokeStyle = r === numRidges - 1 ? '#111827' : `rgba(156, 163, 175, ${0.4 + progress * 0.5})`;
        ctx.lineWidth = r === numRidges - 1 ? 1.6 : 1;
        ctx.stroke();
      }

      // Draw highlighted hover point
      if (closestPoint) {
        ctx.beginPath();
        ctx.arc(closestPoint.x, closestPoint.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      return closestPoint;
    };

    drawRidges();

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const pt = drawRidges(x, y);

      if (pt) {
        setRidgeTooltip({
          x: pt.x,
          y: pt.y,
          prob: (1.25 - pt.r * 0.06).toFixed(2),
          implied: `+${(33.8 + pt.r * 8.4).toFixed(1)}`,
          session: 1287 - pt.r * 14,
        });
      } else {
        setRidgeTooltip(null);
      }
    };

    const handleMouseLeave = () => {
      drawRidges();
      setRidgeTooltip(null);
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  // ==========================================
  // 3. 5D STRATEGY LATTICE (TESSERACT 3D/4D)
  // ==========================================
  const tesseractRef = useRef(null);
  const [rotationAngle, setRotationAngle] = useState(268);

  useEffect(() => {
    const canvas = tesseractRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = (canvas.width = canvas.parentElement.clientWidth || 320);
    const height = (canvas.height = 200);

    // 16 vertices of a 4D Hypercube (x, y, z, w) = {-1, 1}^4
    const vertices4D = [];
    for (let i = 0; i < 16; i++) {
      vertices4D.push([
        i & 1 ? 1 : -1,
        i & 2 ? 1 : -1,
        i & 4 ? 1 : -1,
        i & 8 ? 1 : -1,
      ]);
    }

    // Edges connecting vertices that differ by exactly 1 bit (32 edges)
    const edges = [];
    for (let i = 0; i < 16; i++) {
      for (let j = i + 1; j < 16; j++) {
        const diff = i ^ j;
        if ((diff & (diff - 1)) === 0) {
          edges.push([i, j]);
        }
      }
    }

    let angleXZ = 0.02;
    let angleYW = 0.015;
    let animId = null;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let rotX = 0.6;
    let rotY = 0.4;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      rotY += 0.008;
      setRotationAngle(Math.round(((rotY * 180) / Math.PI) % 360));

      // Project 4D to 3D to 2D
      const projected2D = vertices4D.map(([x, y, z, w]) => {
        // Rotate in 4D (XZ & YW plane)
        const radXZ = rotY;
        const x1 = x * Math.cos(radXZ) - z * Math.sin(radXZ);
        const z1 = x * Math.sin(radXZ) + z * Math.cos(radXZ);

        const radYW = rotY * 0.7;
        const y1 = y * Math.cos(radYW) - w * Math.sin(radYW);
        const w1 = y * Math.sin(radYW) + w * Math.cos(radYW);

        // Stereographic perspective 4D -> 3D
        const distance4D = 2.4;
        const wFactor = 1 / (distance4D - w1);
        const x3D = x1 * wFactor;
        const y3D = y1 * wFactor;
        const z3D = z1 * wFactor;

        // Perspective 3D -> 2D
        const distance3D = 3.0;
        const zFactor = 1 / (distance3D - z3D);
        const screenX = width / 2 + x3D * zFactor * 260;
        const screenY = height / 2 + y3D * zFactor * 260;

        return { x: screenX, y: screenY, depth: z3D + w1 };
      });

      // Draw translucent hypercube faces
      ctx.fillStyle = 'rgba(239, 68, 68, 0.04)';
      ctx.beginPath();
      ctx.moveTo(projected2D[0].x, projected2D[0].y);
      ctx.lineTo(projected2D[1].x, projected2D[1].y);
      ctx.lineTo(projected2D[3].x, projected2D[3].y);
      ctx.lineTo(projected2D[2].x, projected2D[2].y);
      ctx.closePath();
      ctx.fill();

      // Draw Edges
      edges.forEach(([i, j]) => {
        const p1 = projected2D[i];
        const p2 = projected2D[j];

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = 'rgba(75, 85, 99, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Draw Vertices
      projected2D.forEach((p, idx) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = idx % 3 === 0 ? '#ef4444' : idx % 3 === 1 ? '#2563eb' : '#10b981';
        ctx.fill();
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  // ==========================================
  // 4. HANDOFF CHORD DIAGRAM
  // ==========================================
  const chordRef = useRef(null);
  const [hoveredRole, setHoveredRole] = useState(null);

  useEffect(() => {
    const canvas = chordRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = (canvas.width = canvas.parentElement.clientWidth || 320);
    const height = (canvas.height = 200);

    const roles = ['TINY', 'PALM', 'DERV', 'STOC', 'PROF', 'RELS', 'MAIN', 'REAL', 'LIQB'];
    const colors = ['#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#14b8a6', '#6366f1'];
    const radius = 62;
    const centerX = width / 2;
    const centerY = height / 2;

    const angleStep = (Math.PI * 2) / roles.length;
    const nodeCoords = roles.map((r, i) => {
      const angle = i * angleStep - Math.PI / 2;
      return {
        name: r,
        color: colors[i],
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        labelX: centerX + Math.cos(angle) * (radius + 18),
        labelY: centerY + Math.sin(angle) * (radius + 18),
      };
    });

    const drawChord = () => {
      ctx.clearRect(0, 0, width, height);

      // Inner chords
      for (let i = 0; i < nodeCoords.length; i++) {
        for (let j = i + 1; j < nodeCoords.length; j++) {
          if ((i + j) % 2 === 0 || (i * 3 + j) % 5 === 0) {
            const p1 = nodeCoords[i];
            const p2 = nodeCoords[j];

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.quadraticCurveTo(centerX, centerY, p2.x, p2.y);
            ctx.strokeStyle =
              hoveredRole === p1.name || hoveredRole === p2.name
                ? p1.color
                : 'rgba(203, 213, 225, 0.45)';
            ctx.lineWidth = hoveredRole === p1.name || hoveredRole === p2.name ? 1.8 : 0.8;
            ctx.stroke();
          }
        }
      }

      // Outer nodes & labels
      nodeCoords.forEach((n) => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = '8px JetBrains Mono, monospace';
        ctx.fillStyle = hoveredRole === n.name ? '#111827' : '#6b7280';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.name, n.labelX, n.labelY);
      });
    };

    drawChord();
  }, [hoveredRole]);

  // ==========================================
  // 5. RELATIONSHIP GRAPH SIMULATION (FLOW)
  // ==========================================
  const flowCanvasRef = useRef(null);

  useEffect(() => {
    const canvas = flowCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = (canvas.width = canvas.parentElement.clientWidth || 550);
    const height = (canvas.height = 180);

    // Graph nodes
    const clusters = [
      { id: 'bear', name: 'BEAR CLUSTER', x: width * 0.22, y: height * 0.52, color: '#ef4444', r: 16 },
      { id: 'catalyst', name: 'CATALYST RING', x: width * 0.64, y: height * 0.48, color: '#0d9488', r: 14 },
      { id: 'rc91', name: 'RC91', x: width * 0.88, y: height * 0.65, color: '#334155', r: 11 },
    ];

    // Background small scattering nodes
    const scatterNodes = [];
    for (let i = 0; i < 40; i++) {
      scatterNodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 2.5 + 1,
        color: i % 4 === 0 ? '#ef4444' : i % 4 === 1 ? '#2563eb' : i % 4 === 2 ? '#0d9488' : '#94a3b8',
      });
    }

    let particles = [];
    for (let i = 0; i < 12; i++) {
      particles.push({ t: Math.random(), speed: 0.003 + Math.random() * 0.004 });
    }

    let animId = null;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw scatter nodes
      scatterNodes.forEach((s) => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.globalAlpha = 0.35;
        ctx.fill();
        ctx.globalAlpha = 1.0;
      });

      // Flow pathway (dashed spline)
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(clusters[0].x, clusters[0].y);
      ctx.bezierCurveTo(
        width * 0.42,
        height * 0.72,
        width * 0.52,
        height * 0.3,
        clusters[1].x,
        clusters[1].y
      );
      ctx.bezierCurveTo(
        width * 0.75,
        height * 0.6,
        width * 0.8,
        height * 0.68,
        clusters[2].x,
        clusters[2].y
      );
      ctx.stroke();
      ctx.setLineDash([]);

      // Flow status badge "APPROVED / FLOW"
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(width * 0.4 - 36, height * 0.28 - 10, 72, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('APPROVED / FLOW', width * 0.4, height * 0.28 + 2);
      ctx.textAlign = 'left';

      // Moving particles along spline
      particles.forEach((p) => {
        p.t += p.speed;
        if (p.t > 1) p.t = 0;

        // Approximate position along bezier
        let px, py;
        if (p.t < 0.6) {
          const u = p.t / 0.6;
          px = (1 - u) * clusters[0].x + u * clusters[1].x;
          py = (1 - u) * clusters[0].y + u * clusters[1].y + Math.sin(u * Math.PI) * 18;
        } else {
          const u = (p.t - 0.6) / 0.4;
          px = (1 - u) * clusters[1].x + u * clusters[2].x;
          py = (1 - u) * clusters[1].y + u * clusters[2].y + Math.sin(u * Math.PI) * 12;
        }

        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#2563eb';
        ctx.fill();
      });

      // Draw Main Clusters
      clusters.forEach((c) => {
        // Outer pulsing halo
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Inner solid circle
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fillStyle = c.color;
        ctx.fill();

        // Label box below
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 1;
        const txtWidth = ctx.measureText(c.name).width;
        ctx.fillRect(c.x - txtWidth / 2 - 4, c.y + c.r + 6, txtWidth + 8, 14);
        ctx.strokeRect(c.x - txtWidth / 2 - 4, c.y + c.r + 6, txtWidth + 8, 14);

        ctx.fillStyle = '#111827';
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.fillText(c.name, c.x - txtWidth / 2, c.y + c.r + 17);
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  // Compute live realized stats if available
  const realizedPnL = tradeStats ? (tradeStats.winCount * 350 - tradeStats.lossCount * 120) : 401880;

  return (
    <div className="quant-terminal-wrap">
      {/* 1. TOP STATUS BAR */}
      <div className="qt-top-bar">
        <div className="qt-top-left">
          <div className="qt-logo-box">⚡</div>
          <div className="qt-title-meta">
            <span className="qt-sub-header">MIROFISH SIMULATION • RELATIONSHIP-GRAPH MISPRICING</span>
            <span className="qt-main-title">CLAUDE FABLE 5 — MIROFISH / SKYNET V5</span>
          </div>
        </div>

        <div className="qt-top-right">
          <span className="qt-badge qt-badge-live">
            <span className="pulse-dot" style={{ width: 6, height: 6 }} />
            LIVE • FORWARD-TEST
          </span>
          <span className="qt-badge qt-badge-pill">ROUND #7185</span>
          <span className="qt-badge qt-badge-clock">{utcTime || '22:09:40 UTC'}</span>
        </div>
      </div>

      {/* 2. TOP HERO ROW (TOTAL PnL + TOP WINS) */}
      <div className="qt-grid-2col">
        {/* TOTAL PnL */}
        <div className="qt-card">
          <div className="qt-card-header">
            <div className="qt-card-title">
              <span className="qt-card-title-dot red" />
              CLAUDE FABLE 5 — TOTAL PnL
            </div>
            <div className="qt-card-tags">
              <span className="qt-badge qt-badge-pill">CRYPTO TAIL SNIPER</span>
              <span className="qt-badge qt-badge-pill">+1 BTC</span>
            </div>
          </div>

          <div className="qt-hero-pnl">
            <span className="qt-pnl-currency">$</span>
            <span>401,880</span>
          </div>

          <div className="qt-pnl-subrow">
            <span>realized — forward test</span>
            <span>5,944 trades</span>
            <span className="qt-winrate-pill">71% WR</span>
            <span>Sharpe 4.21</span>
          </div>

          {/* 4 Quick Stat Selectors */}
          <div className="qt-stat-boxes-grid">
            <div
              className={`qt-stat-box ${selectedStatIdx === 0 ? 'active' : ''}`}
              onClick={() => setSelectedStatIdx(0)}
            >
              <div className="qt-stat-box-val">+$31,423</div>
              <div className="qt-stat-box-lbl">ETH $2.5K • APR</div>
            </div>
            <div
              className={`qt-stat-box ${selectedStatIdx === 1 ? 'active' : ''}`}
              onClick={() => setSelectedStatIdx(1)}
            >
              <div className="qt-stat-box-val">+$29,247</div>
              <div className="qt-stat-box-lbl">XRP UP • APR 3</div>
            </div>
            <div
              className={`qt-stat-box ${selectedStatIdx === 2 ? 'active' : ''}`}
              onClick={() => setSelectedStatIdx(2)}
            >
              <div className="qt-stat-box-val">+$28,062</div>
              <div className="qt-stat-box-lbl">BTC $95K • JUN</div>
            </div>
            <div
              className={`qt-stat-box ${selectedStatIdx === 3 ? 'active' : ''}`}
              onClick={() => setSelectedStatIdx(3)}
            >
              <div className="qt-stat-box-val">+$14,276</div>
              <div className="qt-stat-box-lbl">ETH $2.8K • APR</div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 14,
              fontSize: 10,
              color: 'var(--qt-text-muted)',
            }}
          >
            <span>anon 0x98dc...4524</span>
            <span style={{ color: 'var(--qt-accent-green)' }}>• LIVE • MAINNET</span>
          </div>
        </div>

        {/* TOP WINS & GROWTH CURVE */}
        <div className="qt-card">
          <div className="qt-card-header">
            <div className="qt-card-title">
              <span className="qt-card-title-dot green" />
              TOP WINS • BTC • POLYMARKET
            </div>
            <div className="qt-card-tags">2 / 5</div>
          </div>

          <div className="qt-win-hero">
            <div>
              <div className="qt-multiplier">x81.17</div>
              <div style={{ fontSize: 10, color: 'var(--qt-text-muted)', marginTop: 2 }}>
                AFD G — XRP UP/DOWN — UP & 5.2x
              </div>
            </div>
            <div className="qt-win-badge-big">+$29,247</div>
          </div>

          <div className="qt-entry-payout">
            <span>
              ENTRY: <strong>$365</strong>
            </span>
            <span>
              PAYOUT: <strong>$29,612</strong>
            </span>
          </div>

          {/* Exponential Growth Area SVG */}
          <div style={{ width: '100%', height: 75, position: 'relative' }}>
            <svg viewBox="0 0 300 70" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M 10 65 Q 160 62, 230 35 T 290 8 L 290 68 L 10 68 Z"
                fill="url(#curveGrad)"
              />
              <path
                d="M 10 65 Q 160 62, 230 35 T 290 8"
                fill="none"
                stroke="#10b981"
                strokeWidth="2.2"
              />
              <circle cx="290" cy="8" r="4" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
            </svg>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 14, color: '#111827' }}>—</span>
            <span style={{ fontSize: 14, color: '#9ca3af' }}>•</span>
            <span style={{ fontSize: 14, color: '#9ca3af' }}>•</span>
          </div>
        </div>
      </div>

      {/* 3. PROBABILITY LATTICE (GALTON BOARD SIMULATION) */}
      <div className="qt-card">
        <div className="qt-card-header">
          <div className="qt-card-title">
            <span className="qt-card-title-dot blue" />
            Probability Lattice — 5,944 Trades, One Board
          </div>
          <div className="qt-card-tags">
            <span>EVERY TRADE • ONE BALL • 8 VOLATILITY GATES • EDGE TILTS THE BOARD</span>
            <button
              className="qt-btn qt-btn-primary"
              style={{ marginLeft: 8 }}
              onClick={handleManualDrop}
            >
              Drop Ball
            </button>
            <button
              className={`qt-btn ${autoDrop ? 'active' : ''}`}
              onClick={() => setAutoDrop(!autoDrop)}
            >
              {autoDrop ? 'Stream: ON' : 'Stream: OFF'}
            </button>
            <button className="qt-btn" onClick={handleResetLattice}>
              Reset
            </button>
          </div>
        </div>

        <div className="qt-card-split">
          {/* Stats Column */}
          <div className="qt-stats-col">
            <span className="qt-stats-col-title">LOGS CONVERGENCE</span>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">BALLS DROPPED</span>
              <span className="qt-stat-row-val">{ballsDropped}</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">LANDED GREEN</span>
              <span className="qt-stat-row-val green">80.0%</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">EV / TRADE</span>
              <span className="qt-stat-row-val green">+$84</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">SESSION PnL</span>
              <span className="qt-stat-row-val green">+$7,055</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">ALL-TIME</span>
              <span className="qt-stat-row-val">5,944</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">REALIZED</span>
              <span className="qt-stat-row-val green">+$401,819</span>
            </div>

            <div className="qt-stats-footer-note">
              LAW OF LARGE NUMBERS — THE EDGE ONLY NEEDS REPETITION
            </div>
          </div>

          {/* Interactive Galton Canvas */}
          <div className="qt-canvas-area">
            <canvas ref={latticeCanvasRef} className="qt-canvas" />
          </div>
        </div>
      </div>

      {/* 4. TAIL PROBABILITY RIDGE (JOYPLOT 3D WIREFRAME) */}
      <div className="qt-card">
        <div className="qt-card-header">
          <div className="qt-card-title">
            <span className="qt-card-title-dot red" />
            Tail Probability Ridge — Strike Landscape
          </div>
          <div className="qt-card-tags">
            <span>PRICE-TARGET DENSITY / CRYPTO & GOLD TARGETS</span>
            <div style={{ display: 'flex', gap: 4, marginLeft: 10 }}>
              <button
                className={`qt-btn ${ridgeMode === 'STRIKE' ? 'active' : ''}`}
                onClick={() => setRidgeMode('STRIKE')}
              >
                STRIKE
              </button>
              <button
                className={`qt-btn ${ridgeMode === 'EXIT' ? 'active' : ''}`}
                onClick={() => setRidgeMode('EXIT')}
              >
                EXIT
              </button>
            </div>
          </div>
        </div>

        <div className="qt-card-split">
          {/* Stats Column */}
          <div className="qt-stats-col">
            <span className="qt-stats-col-title">TAIL SCANNER — LIVE</span>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">SESSIONS</span>
              <span className="qt-stat-row-val">1,287</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">TAIL MASS</span>
              <span className="qt-stat-row-val">0.81%</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">IMPLIED MULT</span>
              <span className="qt-stat-row-val green">+198.4</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">AVG ENTRY</span>
              <span className="qt-stat-row-val">1.2c</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">BEST HIT</span>
              <span className="qt-stat-row-val green">+81.2</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">ALL-TIME</span>
              <span className="qt-stat-row-val">5,944</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">REALIZED</span>
              <span className="qt-stat-row-val green">+$405,819</span>
            </div>

            <div className="qt-stats-footer-note">
              PENNIES INTO THE TAIL — HUNDREDS OUT WHEN THE STRIKE BREAKS
            </div>
          </div>

          {/* Interactive Ridgeline Canvas */}
          <div className="qt-canvas-area">
            <canvas ref={ridgeCanvasRef} className="qt-canvas" />
            {ridgeTooltip && (
              <div
                className="qt-ridge-tooltip"
                style={{ left: ridgeTooltip.x, top: ridgeTooltip.y }}
              >
                <div>
                  <strong>P(&gt;STRIKE): {ridgeTooltip.prob}%</strong>
                </div>
                <div style={{ color: 'var(--qt-accent-green)' }}>
                  IMPLIED: {ridgeTooltip.implied}
                </div>
                <div style={{ color: '#9ca3af' }}>SESSION #{ridgeTooltip.session}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. 5D STRATEGY LATTICE & HANDOFF CHORD (SPLIT 2-COL) */}
      <div className="qt-split-cards">
        {/* 5D LATTICE TESSERACT */}
        <div className="qt-card">
          <div className="qt-card-header">
            <div className="qt-card-title">
              <span className="qt-card-title-dot blue" />
              5D Strategy Lattice
            </div>
            <div className="qt-card-tags">TESSERACT • 32 NODES / 80 EDGES</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12 }}>
            <div className="qt-stats-col" style={{ borderRight: '1px solid var(--qt-border-subtle)' }}>
              <div className="qt-stat-row">
                <span className="qt-stat-row-lbl">DIMENSIONS</span>
                <span className="qt-stat-row-val">5 / 5</span>
              </div>
              <div className="qt-stat-row">
                <span className="qt-stat-row-lbl">VERTICES</span>
                <span className="qt-stat-row-val">32</span>
              </div>
              <div className="qt-stat-row">
                <span className="qt-stat-row-lbl">EDGES</span>
                <span className="qt-stat-row-val">80</span>
              </div>
              <div className="qt-stat-row">
                <span className="qt-stat-row-lbl">ROTATION</span>
                <span className="qt-stat-row-val red">{rotationAngle}°</span>
              </div>
              <div className="qt-stat-row">
                <span className="qt-stat-row-lbl">PROJECTION</span>
                <span className="qt-stat-row-val">5D → 2D</span>
              </div>

              <div className="qt-stats-footer-note">
                EVERY AXIS IS AN EDGE / A SYSTEM MUST PASS ALL FIVE
              </div>
            </div>

            <div className="qt-canvas-area">
              <canvas ref={tesseractRef} className="qt-canvas" />
            </div>
          </div>
        </div>

        {/* HANDOFF CHORD */}
        <div className="qt-card">
          <div className="qt-card-header">
            <div className="qt-card-title">
              <span className="qt-card-title-dot green" />
              Handoff Chord — Who Passes to Whom
            </div>
            <div className="qt-card-tags">10 SYSTEM ENGINES</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 12 }}>
            <div className="qt-canvas-area">
              <canvas ref={chordRef} className="qt-canvas" />
            </div>

            <div className="qt-stats-col" style={{ borderLeft: '1px solid var(--qt-border-subtle)', paddingLeft: 12 }}>
              <div className="qt-stat-row">
                <span className="qt-stat-row-lbl">HANDOFFS</span>
                <span className="qt-stat-row-val">113</span>
              </div>
              <div className="qt-stat-row">
                <span className="qt-stat-row-lbl">REJECTED</span>
                <span className="qt-stat-row-val red">3</span>
              </div>
              <div className="qt-stat-row">
                <span className="qt-stat-row-lbl">EDGES / TASK</span>
                <span className="qt-stat-row-val">1</span>
              </div>
              <div className="qt-stat-row">
                <span className="qt-stat-row-lbl">APPROVAL</span>
                <span className="qt-stat-row-val green">PALERMO</span>
              </div>

              <div className="qt-stats-footer-note">
                FILES, NOT MEMORY / EVERY PASS LEAVES A TRAIL
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6. RELATIONSHIP GRAPH SIMULATION */}
      <div className="qt-card">
        <div className="qt-card-header">
          <div className="qt-card-title">
            <span className="qt-card-title-dot teal" />
            Relationship Graph Simulation — Volume / Flow / Liquidity
          </div>
          <div className="qt-card-tags">98 NODES — 134 EDGES • SIGNAL 92.7% • ITER #184</div>
        </div>

        <div className="qt-flow-layout">
          {/* Legend */}
          <div className="qt-legend-list">
            <span className="qt-stats-col-title">NODE CLASS</span>
            <div className="qt-legend-item">
              <span className="qt-legend-dot" style={{ backgroundColor: '#ef4444' }} />
              <span>Bear signal</span>
            </div>
            <div className="qt-legend-item">
              <span className="qt-legend-dot" style={{ backgroundColor: '#2563eb' }} />
              <span>Bull signal</span>
            </div>
            <div className="qt-legend-item">
              <span className="qt-legend-dot" style={{ backgroundColor: '#334155' }} />
              <span>Median path</span>
            </div>
            <div className="qt-legend-item">
              <span className="qt-legend-dot" style={{ backgroundColor: '#0d9488' }} />
              <span>Catalyst</span>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="qt-stat-row">
                <span className="qt-stat-row-lbl">BEAR PATHS</span>
                <span className="qt-stat-row-val red">523</span>
              </div>
              <div className="qt-stat-row">
                <span className="qt-stat-row-lbl">BULL PATHS</span>
                <span className="qt-stat-row-val green">1,019</span>
              </div>
              <div className="qt-stat-row">
                <span className="qt-stat-row-lbl">PATHS SIM</span>
                <span className="qt-stat-row-val">1,509</span>
              </div>
            </div>
          </div>

          {/* Flow Simulation Canvas */}
          <div className="qt-canvas-area">
            <canvas ref={flowCanvasRef} className="qt-canvas" />
          </div>

          {/* Right Probabilities */}
          <div className="qt-stats-col" style={{ borderLeft: '1px solid var(--qt-border-subtle)', paddingLeft: 12 }}>
            <span className="qt-stats-col-title">EDGE ESTIMATE</span>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">P(UP)</span>
              <span className="qt-stat-row-val green">0.60</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">P(DOWN)</span>
              <span className="qt-stat-row-val red">0.40</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">EDGE VS BOOK</span>
              <span className="qt-stat-row-val green">+23c</span>
            </div>
            <div className="qt-stat-row">
              <span className="qt-stat-row-lbl">CONFIDENCE</span>
              <span className="qt-stat-row-val">94.0%</span>
            </div>

            <div className="qt-stats-footer-note">EDGE DISTRIBUTION / 24H</div>
          </div>
        </div>
      </div>

      {/* 7. REALTIME BREADCRUMB LOGS & INVALIDATIONS */}
      <div className="qt-card">
        <div className="qt-card-header">
          <div className="qt-card-title">
            <span className="qt-card-title-dot purple" />
            Realtime Execution Feed & Invalidation Breadcrumbs
          </div>
          <div className="qt-card-tags">LIVE BOT / EA LOGS • 18:43 R10 PULLBACK</div>
        </div>

        <div className="qt-breadcrumb-feed">
          <div className="qt-breadcrumb-item">
            <span className="qt-log-time">18:43</span>
            <span className="qt-log-tag" style={{ background: '#7c3aed' }}>
              R10
            </span>
            <span className="qt-log-text">
              <strong>PULLBACK / INVALIDATION MARKED</strong> — Target density confirmed
            </span>
          </div>
          <div className="qt-breadcrumb-item">
            <span className="qt-log-time">17:10</span>
            <span className="qt-log-tag">SIO</span>
            <span className="qt-log-text">g1//h4rm / invalidation marked</span>
          </div>
          <div className="qt-breadcrumb-item">
            <span className="qt-log-time">17:00</span>
            <span className="qt-log-tag">MAIN</span>
            <span className="qt-log-text">cleared brief ➔ Astra</span>
          </div>
          <div className="qt-breadcrumb-item">
            <span className="qt-log-time">16:50</span>
            <span className="qt-log-tag">LIQB</span>
            <span className="qt-log-text">holder snapshot / freshness check</span>
          </div>
          <div className="qt-breadcrumb-item">
            <span className="qt-log-time">16:40</span>
            <span className="qt-log-tag">DERV</span>
            <span className="qt-log-text">x = TG / paid noise filtered</span>
          </div>
          <div className="qt-breadcrumb-item">
            <span className="qt-log-time">16:30</span>
            <span className="qt-log-tag">STOC</span>
            <span className="qt-log-text">depth / slippage / size checked</span>
          </div>
          {botLogs.map((log) => (
            <div key={log.id} className="qt-breadcrumb-item">
              <span className="qt-log-time">
                {new Date(log.created_at || Date.now()).toLocaleTimeString('th-TH', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="qt-log-tag" style={{ background: '#0d9488' }}>
                BOT
              </span>
              <span className="qt-log-text">{log.message || log.raw_message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
